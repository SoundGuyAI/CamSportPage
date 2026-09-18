/**
 * Sampled backend: `public/sounds/manifest.json` + the files it names.
 *
 * Per-sound fallback is the whole point — any id that is missing from the
 * manifest, fails to download, or fails to decode is simply delegated to the
 * shared SynthBackend. A 404 on the manifest itself means *everything* falls
 * back and nothing is logged as an error, so the game always has sound.
 *
 * The manifest URL goes through `import.meta.env.BASE_URL` so it resolves under
 * the GitHub Pages base (`/CamSportPage/`).
 */
import type { SynthBackend } from './SynthBackend.ts'
import type {
  SampleEntry,
  SampleManifest,
  SoundBackend,
  SoundCredit,
  SoundId,
} from './types.ts'
import { ALL_SOUND_IDS } from './types.ts'

type Loaded = { entry: SampleEntry; buffer: AudioBuffer }

const MANIFEST_URL = `${import.meta.env.BASE_URL}sounds/manifest.json`
const SOUNDS_BASE = `${import.meta.env.BASE_URL}sounds/`

/** Licenses that oblige us to print an attribution line. */
function needsAttribution(license: string | undefined): boolean {
  if (!license) return false
  const l = license.toUpperCase()
  return l.startsWith('CC-BY') || l.startsWith('CC BY') || l.startsWith('BY-')
}

export class SampleBackend implements SoundBackend {
  private readonly ctx: AudioContext
  private readonly out: AudioNode
  private readonly synth: SynthBackend
  private readonly loaded = new Map<SoundId, Loaded>()
  private readonly loops = new Map<SoundId, { src: AudioBufferSourceNode; gain: GainNode }>()
  private manifest: SampleManifest | null = null
  private loading: Promise<void> | null = null
  /** Ids the caller asked for while the manifest was still in flight. */
  private pendingLoops = new Set<SoundId>()

  constructor(ctx: AudioContext, out: AudioNode, synth: SynthBackend) {
    this.ctx = ctx
    this.out = out
    this.synth = synth
  }

  /** Idempotent, lazy: called on first enable of `real` mode. */
  load(): Promise<void> {
    this.loading ??= this.loadOnce()
    return this.loading
  }

  get ready(): boolean {
    return this.manifest !== null
  }

  getCredits(): SoundCredit[] {
    const out: SoundCredit[] = []
    const sounds = this.manifest?.sounds
    if (!sounds) return out
    for (const id of ALL_SOUND_IDS) {
      const entry = sounds[id]
      if (!entry || !needsAttribution(entry.license)) continue
      out.push({
        id,
        license: entry.license ?? '',
        source: entry.source,
        author: entry.author,
      })
    }
    return out
  }

  private async loadOnce(): Promise<void> {
    let manifest: SampleManifest
    try {
      const res = await fetch(MANIFEST_URL, { cache: 'force-cache' })
      if (!res.ok) {
        // No pack shipped (or 404 on Pages): stay silent, synth covers us.
        this.manifest = { version: 0, sounds: {} }
        return
      }
      manifest = (await res.json()) as SampleManifest
    } catch {
      this.manifest = { version: 0, sounds: {} }
      return
    }

    const sounds = manifest?.sounds ?? {}
    await Promise.all(
      ALL_SOUND_IDS.map(async (id) => {
        const entry = sounds[id]
        if (!entry?.file) return
        try {
          const res = await fetch(`${SOUNDS_BASE}${entry.file}`, { cache: 'force-cache' })
          if (!res.ok) return
          const bytes = await res.arrayBuffer()
          const buffer = await this.ctx.decodeAudioData(bytes)
          this.loaded.set(id, { entry, buffer })
        } catch {
          /* this one id falls back to synth; the rest are unaffected */
        }
      }),
    )

    this.manifest = { version: manifest?.version ?? 1, sounds }

    // Re-issue loops requested before the pack finished downloading.
    for (const id of this.pendingLoops) {
      if (!this.loaded.has(id)) continue
      this.synth.stopLoop(id, 300)
      this.startSampleLoop(id)
    }
    this.pendingLoops.clear()
  }

  play(id: SoundId, opts?: { at?: number; gain?: number }): void {
    const hit = this.loaded.get(id)
    if (!hit) {
      this.synth.play(id, opts)
      return
    }
    const now = this.ctx.currentTime
    const at = Math.max(now, opts?.at ?? now)
    const g = this.ctx.createGain()
    g.gain.value = (hit.entry.gain ?? 1) * (opts?.gain ?? 1)
    const src = this.ctx.createBufferSource()
    src.buffer = hit.buffer
    src.connect(g).connect(this.out)
    src.start(at)
  }

  startLoop(id: SoundId): void {
    if (this.loops.has(id)) return
    if (!this.ready) {
      // Cover the gap with synth, then swap once the sample lands.
      this.pendingLoops.add(id)
      this.synth.startLoop(id)
      void this.load()
      return
    }
    if (!this.loaded.has(id)) {
      this.synth.startLoop(id)
      return
    }
    this.startSampleLoop(id)
  }

  private startSampleLoop(id: SoundId): void {
    const hit = this.loaded.get(id)
    if (!hit || this.loops.has(id)) return
    const t0 = this.ctx.currentTime
    const target = hit.entry.gain ?? 1
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.linearRampToValueAtTime(target, t0 + 1.2)
    const src = this.ctx.createBufferSource()
    src.buffer = hit.buffer
    src.loop = hit.entry.loop ?? true
    src.connect(g).connect(this.out)
    src.start(t0)
    this.loops.set(id, { src, gain: g })
  }

  stopLoop(id: SoundId, fadeMs = 400): void {
    this.pendingLoops.delete(id)
    this.synth.stopLoop(id, fadeMs)
    const loop = this.loops.get(id)
    if (!loop) return
    this.loops.delete(id)
    const t0 = this.ctx.currentTime
    const fade = Math.max(0.01, fadeMs / 1000)
    loop.gain.gain.cancelScheduledValues(t0)
    loop.gain.gain.setValueAtTime(Math.max(loop.gain.gain.value, 0.0001), t0)
    loop.gain.gain.exponentialRampToValueAtTime(0.0001, t0 + fade)
    try {
      loop.src.stop(t0 + fade + 0.02)
    } catch {
      /* already stopped */
    }
  }

  stopAll(): void {
    for (const id of [...this.loops.keys()]) this.stopLoop(id, 120)
    this.synth.stopAll()
  }
}
