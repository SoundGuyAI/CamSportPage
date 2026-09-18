/**
 * The audio facade the UI and the game hook talk to.
 *
 * Owns: the single AudioContext, the master gain, the two backends, the
 * persisted settings, and the ambience bed's "should it be playing" state.
 *
 * Browsers will not let us start audio without a user gesture, so the context
 * is created lazily in `unlock()` — called from the Start button and from the
 * mute / mode / volume controls. Cues fired before the first gesture are
 * silently dropped rather than queued (a stale crack is worse than no crack).
 */
import { SampleBackend } from './SampleBackend.ts'
import { SynthBackend } from './SynthBackend.ts'
import type { Cue } from './cues.ts'
import { AMBIENCE_ABORT_FADE_MS } from './cues.ts'
import type { AudioSettings, SoundBackend, SoundCredit, SoundId, SoundMode } from './types.ts'

/** localStorage key — JSON `{ mode, muted, volume }`. */
export const AUDIO_SETTINGS_KEY = 'camsport.audio'

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  mode: 'real',
  muted: false,
  volume: 0.8,
}

const AMBIENCE: SoundId = 'crowd_ambience'

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

/** Same shape as `readStoredInputMode`: never throw, always land on a default. */
export function readStoredAudioSettings(): AudioSettings {
  try {
    const raw = globalThis.localStorage?.getItem(AUDIO_SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_AUDIO_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<AudioSettings> | null
    return {
      mode: parsed?.mode === 'synth' ? 'synth' : 'real',
      muted: parsed?.muted === true,
      volume:
        typeof parsed?.volume === 'number' && Number.isFinite(parsed.volume)
          ? clamp01(parsed.volume)
          : DEFAULT_AUDIO_SETTINGS.volume,
    }
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS }
  }
}

export function writeStoredAudioSettings(settings: AudioSettings): void {
  try {
    globalThis.localStorage?.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* private mode — the choice just won't persist */
  }
}

type AudioContextCtor = new () => AudioContext

function contextCtor(): AudioContextCtor | null {
  const w = globalThis as unknown as {
    AudioContext?: AudioContextCtor
    webkitAudioContext?: AudioContextCtor
  }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

export class AudioEngine {
  private settings: AudioSettings = readStoredAudioSettings()
  private listeners = new Set<(s: AudioSettings) => void>()
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private synth: SynthBackend | null = null
  private samples: SampleBackend | null = null
  private timers = new Set<ReturnType<typeof setTimeout>>()
  /** Does the game want the crowd bed up right now? */
  private ambienceWanted = false
  private visible = true
  private detachVisibility: (() => void) | null = null

  constructor() {
    const doc = globalThis.document as Document | undefined
    if (!doc) return
    this.visible = doc.visibilityState !== 'hidden'
    const onChange = () => {
      this.visible = doc.visibilityState !== 'hidden'
      this.applyAmbience()
    }
    doc.addEventListener('visibilitychange', onChange)
    this.detachVisibility = () => {
      doc.removeEventListener('visibilitychange', onChange)
    }
  }

  // ---------------------------------------------------------------- settings

  getSettings(): AudioSettings {
    return this.settings
  }

  /** React-friendly store subscription (pairs with `useSyncExternalStore`). */
  subscribe(cb: (s: AudioSettings) => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  private commit(next: AudioSettings): void {
    this.settings = next
    writeStoredAudioSettings(next)
    for (const cb of this.listeners) cb(next)
  }

  setMuted(muted: boolean): void {
    if (muted === this.settings.muted) return
    this.commit({ ...this.settings, muted })
    this.applyMasterGain()
    // Muted means *silent*, not quiet: the bed is stopped outright.
    this.applyAmbience()
  }

  toggleMuted(): void {
    this.setMuted(!this.settings.muted)
  }

  setVolume(volume: number): void {
    const v = clamp01(volume)
    if (v === this.settings.volume) return
    this.commit({ ...this.settings, volume: v })
    this.applyMasterGain()
  }

  setMode(mode: SoundMode): void {
    if (mode === this.settings.mode) return
    const hadAmbience = this.ambienceWanted
    // Tear the bed down on the old backend before swapping.
    this.backend()?.stopLoop(AMBIENCE, 200)
    this.commit({ ...this.settings, mode })
    if (mode === 'real') void this.samples?.load()
    if (hadAmbience) this.applyAmbience()
  }

  // ---------------------------------------------------------------- lifecycle

  /** Must run inside a user gesture. Safe to call as often as you like. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = contextCtor()
      if (!Ctor) return
      try {
        this.ctx = new Ctor()
      } catch {
        return
      }
      const master = this.ctx.createGain()
      master.connect(this.ctx.destination)
      this.master = master
      this.synth = new SynthBackend(this.ctx, master)
      this.samples = new SampleBackend(this.ctx, master, this.synth)
      this.applyMasterGain()
      if (this.settings.mode === 'real') void this.samples.load()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  get context(): AudioContext | null {
    return this.ctx
  }

  /** Live master gain value — handy for smoke tests. */
  get masterGain(): number {
    return this.master?.gain.value ?? 0
  }

  /** Where the master gain is headed (0 when muted). */
  get masterTarget(): number {
    return this.settings.muted ? 0 : this.settings.volume
  }

  getCredits(): SoundCredit[] {
    return this.samples?.getCredits() ?? []
  }

  private backend(): SoundBackend | null {
    return this.settings.mode === 'real' ? this.samples : this.synth
  }

  private applyMasterGain(): void {
    const master = this.master
    const ctx = this.ctx
    if (!master || !ctx) return
    const target = this.settings.muted ? 0 : this.settings.volume
    const t = ctx.currentTime
    master.gain.cancelScheduledValues(t)
    master.gain.setValueAtTime(master.gain.value, t)
    // Short ramp, not a step: a hard jump on the master bus clicks.
    master.gain.linearRampToValueAtTime(target, t + 0.03)
  }

  // ---------------------------------------------------------------- playback

  /** AudioContext time for a `performance.now()` instant. */
  timeFor(perfMs: number): number {
    const ctx = this.ctx
    if (!ctx) return 0
    return Math.max(ctx.currentTime, ctx.currentTime + (perfMs - performance.now()) / 1000)
  }

  play(id: SoundId, opts?: { at?: number; gain?: number }): void {
    if (this.settings.muted) return
    this.backend()?.play(id, opts)
  }

  /** Run a cue list from `cuesForTransition`. */
  fireCues(cues: readonly Cue[]): void {
    if (!cues.length) return
    for (const cue of cues) {
      if (cue.loop === 'start') {
        this.ambienceWanted = true
        if (cue.delayMs) this.after(cue.delayMs, () => this.applyAmbience())
        else this.applyAmbience()
        continue
      }
      if (cue.loop === 'stop') {
        const fade = cue.fadeMs ?? AMBIENCE_ABORT_FADE_MS
        if (cue.delayMs) {
          this.after(cue.delayMs, () => {
            this.ambienceWanted = false
            this.backend()?.stopLoop(cue.id, fade)
          })
        } else {
          this.ambienceWanted = false
          this.backend()?.stopLoop(cue.id, fade)
        }
        continue
      }
      if (this.settings.muted || !this.ctx) continue
      const at =
        cue.atPerfMs !== undefined
          ? this.timeFor(cue.atPerfMs)
          : this.ctx.currentTime + (cue.delayMs ?? 0) / 1000
      this.play(cue.id, { at, gain: cue.gain })
    }
  }

  private after(ms: number, fn: () => void): void {
    const handle = setTimeout(() => {
      this.timers.delete(handle)
      fn()
    }, ms)
    this.timers.add(handle)
  }

  private applyAmbience(): void {
    const backend = this.backend()
    if (!backend) return
    if (this.ambienceWanted && !this.settings.muted && this.visible) backend.startLoop(AMBIENCE)
    else backend.stopLoop(AMBIENCE, 250)
  }

  /** Kill every voice and forget the ambience intent (hook unmount, restart). */
  stopAll(): void {
    for (const handle of this.timers) clearTimeout(handle)
    this.timers.clear()
    this.ambienceWanted = false
    this.synth?.stopAll()
    this.samples?.stopAll()
  }

  dispose(): void {
    this.stopAll()
    this.detachVisibility?.()
    this.detachVisibility = null
    void this.ctx?.close()
    this.ctx = null
    this.master = null
    this.synth = null
    this.samples = null
  }
}

let singleton: AudioEngine | null = null

/** One engine per page — the AudioContext limit is per document, not per tree. */
export function getAudioEngine(): AudioEngine {
  singleton ??= new AudioEngine()
  // Exposed for manual/headless smoke checks (see README "Sound").
  ;(globalThis as unknown as { __camsportAudio?: AudioEngine }).__camsportAudio = singleton
  return singleton
}
