/**
 * Pure Web Audio synthesis — every SoundId, zero files, zero network.
 *
 * Determinism: all noise is pre-rendered into cached AudioBuffers by a seeded
 * LCG (never `Math.random`), and every envelope / filter number below is a
 * constant. The same SoundId always sounds byte-identical.
 *
 * Structure: caller owns the AudioContext and the destination node (the
 * engine's master gain). Each voice builds its own little graph, schedules its
 * envelope, and lets the nodes fall off the graph when the source ends.
 */
import type { SoundBackend, SoundId } from './types.ts'

/** Floor for exponential ramps (0 is illegal for exponentialRampToValueAtTime). */
const EPS = 0.0001

/** 32-bit linear congruential generator — the only randomness in this file. */
function makeLcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Bipolar noise sample stream in [-1, 1). */
function makeBipolarLcg(seed: number): () => number {
  const rnd = makeLcg(seed)
  return () => rnd() * 2 - 1
}

type NoiseColor = 'white' | 'pink' | 'brown'

/** Per-sound gain trims so nothing clips and the bed sits far under the cues. */
const TRIM: Record<SoundId, number> = {
  crowd_ambience: 0.085,
  pitch_whoosh: 0.3,
  catcher_mitt: 0.55,
  bat_crack_perfect: 0.9,
  bat_crack_contact: 0.6,
  bat_foul_tip: 0.45,
  whiff: 0.34,
  crowd_cheer_big: 0.55,
  crowd_cheer_small: 0.38,
  crowd_ohh: 0.34,
  crowd_boo: 0.3,
  applause_end: 0.5,
  ui_click: 0.22,
}

export class SynthBackend implements SoundBackend {
  private readonly ctx: AudioContext
  private readonly out: AudioNode
  private readonly buffers = new Map<string, AudioBuffer>()
  private readonly loops = new Map<SoundId, { gain: GainNode; sources: AudioScheduledSourceNode[] }>()

  constructor(ctx: AudioContext, out: AudioNode) {
    this.ctx = ctx
    this.out = out
  }

  // ------------------------------------------------------------ buffer cache

  /** Deterministic noise of the requested colour, cached by key. */
  private noise(color: NoiseColor, seconds: number, seed: number): AudioBuffer {
    const key = `n:${color}:${seconds}:${seed}`
    const hit = this.buffers.get(key)
    if (hit) return hit

    const rate = this.ctx.sampleRate
    const len = Math.max(1, Math.floor(seconds * rate))
    const buf = this.ctx.createBuffer(1, len, rate)
    const data = buf.getChannelData(0)
    const next = makeBipolarLcg(seed)

    if (color === 'white') {
      for (let i = 0; i < len; i += 1) data[i] = next() * 0.9
    } else if (color === 'brown') {
      // Leaky integrator: -6 dB/oct, very dark. Used for the crowd bed.
      let last = 0
      for (let i = 0; i < len; i += 1) {
        last = (last + 0.02 * next()) / 1.02
        data[i] = last * 3.2
      }
    } else {
      // Paul Kellet's economy pink filter: -3 dB/oct.
      let b0 = 0
      let b1 = 0
      let b2 = 0
      let b3 = 0
      let b4 = 0
      let b5 = 0
      let b6 = 0
      for (let i = 0; i < len; i += 1) {
        const w = next()
        b0 = 0.99886 * b0 + w * 0.0555179
        b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.969 * b2 + w * 0.153852
        b3 = 0.8665 * b3 + w * 0.3104856
        b4 = 0.55 * b4 + w * 0.5329522
        b5 = -0.7616 * b5 - w * 0.016898
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
        b6 = w * 0.115926
      }
    }

    this.buffers.set(key, buf)
    return buf
  }

  /**
   * Applause as *one* pre-rendered buffer: `count` short noise clicks placed by
   * the LCG over `seconds`. One buffer source instead of ~200 — cheap, and the
   * clap pattern is identical every time.
   */
  private applauseBuffer(seconds: number, count: number, seed: number): AudioBuffer {
    const key = `a:${seconds}:${count}:${seed}`
    const hit = this.buffers.get(key)
    if (hit) return hit

    const rate = this.ctx.sampleRate
    const len = Math.floor(seconds * rate)
    const buf = this.ctx.createBuffer(1, len, rate)
    const data = buf.getChannelData(0)
    const rnd = makeLcg(seed)
    const clickLen = Math.max(2, Math.floor(0.004 * rate))

    for (let c = 0; c < count; c += 1) {
      // Bias the claps toward the front so the crowd "arrives" then thins out.
      const u = rnd()
      const start = Math.floor(u * u * (len - clickLen))
      const amp = 0.35 + rnd() * 0.65
      for (let i = 0; i < clickLen; i += 1) {
        // Each click: a tiny decaying noise grain.
        const k = 1 - i / clickLen
        data[start + i] += (rnd() * 2 - 1) * amp * k * k * 0.5
      }
    }

    // Normalise so the clap density cannot clip.
    let peak = 0
    for (let i = 0; i < len; i += 1) peak = Math.max(peak, Math.abs(data[i]))
    if (peak > 0) {
      const g = 0.9 / peak
      for (let i = 0; i < len; i += 1) data[i] *= g
    }

    this.buffers.set(key, buf)
    return buf
  }

  // ------------------------------------------------------------ graph helpers

  private gain(value = 0): GainNode {
    const g = this.ctx.createGain()
    g.gain.value = value
    return g
  }

  private source(buffer: AudioBuffer, loop = false): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.loop = loop
    return src
  }

  /** attack -> peak -> exponential decay to silence. Returns the end time. */
  private env(
    param: AudioParam,
    t0: number,
    peak: number,
    attackS: number,
    decayS: number,
  ): number {
    param.setValueAtTime(EPS, t0)
    if (attackS <= 0) param.setValueAtTime(Math.max(peak, EPS), t0)
    else param.linearRampToValueAtTime(Math.max(peak, EPS), t0 + attackS)
    param.exponentialRampToValueAtTime(EPS, t0 + attackS + decayS)
    return t0 + attackS + decayS
  }

  private filter(type: BiquadFilterType, freq: number, q = 1): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    return f
  }

  // ------------------------------------------------------------ public API

  play(id: SoundId, opts?: { at?: number; gain?: number }): void {
    const now = this.ctx.currentTime
    const t0 = Math.max(now, opts?.at ?? now)
    const level = TRIM[id] * (opts?.gain ?? 1)
    if (level <= 0) return

    const bus = this.gain(level)
    bus.connect(this.out)
    this.voice(id, t0, bus)
  }

  startLoop(id: SoundId): void {
    if (this.loops.has(id)) return
    const t0 = this.ctx.currentTime
    const bus = this.gain(EPS)
    bus.connect(this.out)
    // 1.2 s fade-in: the bed should never appear with a click.
    bus.gain.setValueAtTime(EPS, t0)
    bus.gain.linearRampToValueAtTime(TRIM[id], t0 + 1.2)

    const sources = this.loopVoice(id, t0, bus)
    this.loops.set(id, { gain: bus, sources })
  }

  stopLoop(id: SoundId, fadeMs = 400): void {
    const loop = this.loops.get(id)
    if (!loop) return
    this.loops.delete(id)
    const t0 = this.ctx.currentTime
    const fade = Math.max(0.01, fadeMs / 1000)
    loop.gain.gain.cancelScheduledValues(t0)
    loop.gain.gain.setValueAtTime(Math.max(loop.gain.gain.value, EPS), t0)
    loop.gain.gain.exponentialRampToValueAtTime(EPS, t0 + fade)
    for (const src of loop.sources) {
      try {
        src.stop(t0 + fade + 0.02)
      } catch {
        /* already stopped */
      }
    }
  }

  stopAll(): void {
    for (const id of [...this.loops.keys()]) this.stopLoop(id, 120)
  }

  // ------------------------------------------------------------ loop voices

  private loopVoice(id: SoundId, t0: number, bus: GainNode): AudioScheduledSourceNode[] {
    if (id !== 'crowd_ambience') {
      // Nothing else is designed as a bed; loop the one-shot's noise body.
      const src = this.source(this.noise('pink', 2, 1337), true)
      src.connect(bus)
      src.start(t0)
      return [src]
    }

    // Crowd bed: 6 s of brown noise through a soft lowpass, with a very slow
    // LFO on both cutoff and level so it breathes instead of hissing.
    const src = this.source(this.noise('brown', 6, 20260918), true)
    const lp = this.filter('lowpass', 600, 0.7)
    // A second, quieter pink layer adds the "many voices" texture up top.
    const air = this.source(this.noise('pink', 5, 99991), true)
    const airLp = this.filter('lowpass', 1100, 0.6)
    const airGain = this.gain(0.28)

    const swell = this.gain(1)
    const lfo = this.ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 0.08
    const lfoAmt = this.gain(0.22)
    lfo.connect(lfoAmt).connect(swell.gain)

    const lfo2 = this.ctx.createOscillator()
    lfo2.type = 'sine'
    lfo2.frequency.value = 0.031
    const lfo2Amt = this.gain(140)
    lfo2.connect(lfo2Amt).connect(lp.frequency)

    src.connect(lp).connect(swell)
    air.connect(airLp).connect(airGain).connect(swell)
    swell.connect(bus)

    src.start(t0)
    air.start(t0 + 0.13)
    lfo.start(t0)
    lfo2.start(t0)
    return [src, air, lfo, lfo2]
  }

  // ------------------------------------------------------------ one-shot voices

  private voice(id: SoundId, t0: number, bus: GainNode): void {
    switch (id) {
      case 'bat_crack_perfect':
        this.batCrack(t0, bus, { burstS: 0.006, bp: 3600, knock: 250, knockGain: 0.5, tick: 0 })
        return
      case 'bat_crack_contact':
        this.batCrack(t0, bus, { burstS: 0.008, bp: 2500, knock: 185, knockGain: 0.62, tick: 0 })
        return
      case 'bat_foul_tip':
        this.batCrack(t0, bus, { burstS: 0.003, bp: 4000, knock: 215, knockGain: 0.3, tick: 5400 })
        return
      case 'pitch_whoosh':
        this.sweepNoise(t0, bus, { from: 400, to: 1800, sweepS: 0.25, attackS: 0.16, decayS: 0.14 })
        return
      case 'whiff':
        this.sweepNoise(t0, bus, { from: 600, to: 2600, sweepS: 0.16, attackS: 0.03, decayS: 0.15 })
        return
      case 'catcher_mitt':
        this.mitt(t0, bus)
        return
      case 'crowd_cheer_small':
        this.cheer(t0, bus, false)
        return
      case 'crowd_cheer_big':
        this.cheer(t0, bus, true)
        return
      case 'crowd_ohh':
        this.ohh(t0, bus)
        return
      case 'crowd_boo':
        this.boo(t0, bus)
        return
      case 'applause_end':
        this.applause(t0, bus)
        return
      case 'ui_click':
        this.uiClick(t0, bus)
        return
      case 'crowd_ambience':
        // Ambience is a loop; a one-shot request plays a 2 s taste of it.
        this.ambienceOneShot(t0, bus)
        return
    }
  }

  /**
   * Bat crack = 2-8 ms bandpassed noise burst + a decaying sine "knock" in the
   * 180-260 Hz woody range + a highpassed click transient. Perfect is louder
   * and brighter, contact is duller and lower, the foul tip adds a high tick.
   */
  private batCrack(
    t0: number,
    bus: GainNode,
    p: { burstS: number; bp: number; knock: number; knockGain: number; tick: number },
  ): void {
    // 1. the crack itself
    const src = this.source(this.noise('white', 0.05, 4242))
    const bp = this.filter('bandpass', p.bp, 1.3)
    const bpGain = this.gain(0)
    src.connect(bp).connect(bpGain).connect(bus)
    this.env(bpGain.gain, t0, 1, 0.0008, p.burstS)
    src.start(t0)
    src.stop(t0 + 0.05)

    // 2. the click transient (attack edge, almost no body)
    const click = this.source(this.noise('white', 0.02, 777))
    const hp = this.filter('highpass', 4200, 0.7)
    const clickGain = this.gain(0)
    click.connect(hp).connect(clickGain).connect(bus)
    this.env(clickGain.gain, t0, 0.55, 0, 0.002)
    click.start(t0)
    click.stop(t0 + 0.02)

    // 3. the knock: wood resonance, pitch dropping slightly as it decays
    const osc = this.ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(p.knock, t0)
    osc.frequency.exponentialRampToValueAtTime(p.knock * 0.62, t0 + 0.1)
    const oscGain = this.gain(0)
    osc.connect(oscGain).connect(bus)
    this.env(oscGain.gain, t0, p.knockGain, 0.001, 0.12)
    osc.start(t0)
    osc.stop(t0 + 0.16)

    // 4. foul tip only: a thin metallic tick riding on top
    if (p.tick > 0) {
      const tick = this.ctx.createOscillator()
      tick.type = 'sine'
      tick.frequency.value = p.tick
      const tickGain = this.gain(0)
      tick.connect(tickGain).connect(bus)
      this.env(tickGain.gain, t0, 0.22, 0, 0.012)
      tick.start(t0)
      tick.stop(t0 + 0.03)
    }
  }

  /** Air movement: pink noise through a bandpass that sweeps up as it passes. */
  private sweepNoise(
    t0: number,
    bus: GainNode,
    p: { from: number; to: number; sweepS: number; attackS: number; decayS: number },
  ): void {
    const src = this.source(this.noise('pink', 1, 5150))
    const bp = this.filter('bandpass', p.from, 1.4)
    bp.frequency.setValueAtTime(p.from, t0)
    bp.frequency.exponentialRampToValueAtTime(p.to, t0 + p.sweepS)
    const g = this.gain(0)
    src.connect(bp).connect(g).connect(bus)
    this.env(g.gain, t0, 1, p.attackS, p.decayS)
    src.start(t0)
    src.stop(t0 + p.attackS + p.decayS + 0.05)
  }

  /** Catcher's mitt: 90 Hz sine thump under a short lowpassed noise puff. */
  private mitt(t0: number, bus: GainNode): void {
    const osc = this.ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(110, t0)
    osc.frequency.exponentialRampToValueAtTime(90, t0 + 0.06)
    const og = this.gain(0)
    osc.connect(og).connect(bus)
    this.env(og.gain, t0, 0.9, 0.002, 0.12)
    osc.start(t0)
    osc.stop(t0 + 0.18)

    const puff = this.source(this.noise('white', 0.1, 31337))
    const lp = this.filter('lowpass', 1200, 0.9)
    const pg = this.gain(0)
    puff.connect(lp).connect(pg).connect(bus)
    this.env(pg.gain, t0, 0.5, 0.001, 0.06)
    puff.start(t0)
    puff.stop(t0 + 0.1)
  }

  /**
   * Cheer: layered noise through a 1-2 kHz bandpass that swells over ~200 ms
   * and decays for 1.5-2.5 s. "Big" adds a brighter second layer and a longer
   * tail so it reads as a bigger crowd, not just a louder one.
   */
  private cheer(t0: number, bus: GainNode, big: boolean): void {
    const tail = big ? 2.5 : 1.6
    const dur = tail + 0.5

    const src = this.source(this.noise('pink', 3, big ? 8080 : 6060))
    const bp = this.filter('bandpass', big ? 1200 : 1500, 0.8)
    bp.frequency.setValueAtTime(big ? 900 : 1200, t0)
    bp.frequency.linearRampToValueAtTime(big ? 1700 : 1900, t0 + 0.4)
    const g = this.gain(0)
    src.connect(bp).connect(g).connect(bus)
    this.env(g.gain, t0, 1, 0.2, tail)
    src.start(t0)
    src.stop(t0 + dur)

    if (!big) return

    // Second layer: brighter, arrives a touch later, hangs on longer.
    const hi = this.source(this.noise('white', 3, 9090))
    const hiBp = this.filter('bandpass', 2800, 0.7)
    const hiLp = this.filter('lowpass', 5200, 0.6)
    const hg = this.gain(0)
    hi.connect(hiBp).connect(hiLp).connect(hg).connect(bus)
    this.env(hg.gain, t0 + 0.06, 0.45, 0.26, tail + 0.4)
    hi.start(t0 + 0.06)
    hi.stop(t0 + dur + 0.5)
  }

  /** "Ohhh": two detuned saws gliding 220 -> 160 Hz under a lowpass, plus air. */
  private ohh(t0: number, bus: GainNode): void {
    const lp = this.filter('lowpass', 850, 1.1)
    const g = this.gain(0)
    lp.connect(g).connect(bus)
    this.env(g.gain, t0, 0.55, 0.09, 0.78)

    for (const detune of [-7, 7]) {
      const osc = this.ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.detune.value = detune
      osc.frequency.setValueAtTime(220, t0)
      osc.frequency.exponentialRampToValueAtTime(160, t0 + 0.7)
      osc.connect(lp)
      osc.start(t0)
      osc.stop(t0 + 0.95)
    }

    const air = this.source(this.noise('pink', 1.2, 4321))
    const airLp = this.filter('lowpass', 900, 0.7)
    const ag = this.gain(0)
    air.connect(airLp).connect(ag).connect(bus)
    this.env(ag.gain, t0, 0.3, 0.12, 0.8)
    air.start(t0)
    air.stop(t0 + 1.1)
  }

  /** Boo: a low sawtooth cluster (110-140 Hz) with a slow shared vibrato. */
  private boo(t0: number, bus: GainNode): void {
    const lp = this.filter('lowpass', 620, 1.2)
    const g = this.gain(0)
    lp.connect(g).connect(bus)
    this.env(g.gain, t0, 0.5, 0.1, 1.1)

    const vib = this.ctx.createOscillator()
    vib.type = 'sine'
    vib.frequency.value = 4.5
    const vibAmt = this.gain(28)
    vib.connect(vibAmt)
    vib.start(t0)
    vib.stop(t0 + 1.3)

    for (const f of [110, 124, 138]) {
      const osc = this.ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = f
      vibAmt.connect(osc.detune)
      osc.connect(lp)
      osc.start(t0)
      osc.stop(t0 + 1.25)
    }
  }

  /** Applause: one pre-rendered 2 s clap field, bandpassed and shaped. */
  private applause(t0: number, bus: GainNode): void {
    const src = this.source(this.applauseBuffer(2, 220, 13579))
    const bp = this.filter('bandpass', 2000, 0.9)
    const lp = this.filter('lowpass', 6500, 0.6)
    const g = this.gain(0)
    src.connect(bp).connect(lp).connect(g).connect(bus)
    g.gain.setValueAtTime(EPS, t0)
    g.gain.linearRampToValueAtTime(1, t0 + 0.12)
    g.gain.setValueAtTime(1, t0 + 1.1)
    g.gain.exponentialRampToValueAtTime(EPS, t0 + 2)
    src.start(t0)
    src.stop(t0 + 2.05)

    // A thin crowd "roar" under the claps so it is not all transients.
    const roar = this.source(this.noise('pink', 3, 2468))
    const roarBp = this.filter('bandpass', 1100, 0.7)
    const rg = this.gain(0)
    roar.connect(roarBp).connect(rg).connect(bus)
    this.env(rg.gain, t0, 0.4, 0.3, 1.7)
    roar.start(t0)
    roar.stop(t0 + 2.1)
  }

  /** 5 ms blip. */
  private uiClick(t0: number, bus: GainNode): void {
    const osc = this.ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1250, t0)
    osc.frequency.exponentialRampToValueAtTime(900, t0 + 0.005)
    const g = this.gain(0)
    osc.connect(g).connect(bus)
    this.env(g.gain, t0, 0.8, 0.0005, 0.005)
    osc.start(t0)
    osc.stop(t0 + 0.02)
  }

  /** Non-looping taste of the crowd bed (only used if someone triggers it). */
  private ambienceOneShot(t0: number, bus: GainNode): void {
    const src = this.source(this.noise('brown', 6, 20260918))
    const lp = this.filter('lowpass', 600, 0.7)
    const g = this.gain(0)
    src.connect(lp).connect(g).connect(bus)
    this.env(g.gain, t0, 1, 0.4, 1.6)
    src.start(t0)
    src.stop(t0 + 2.2)
  }
}
