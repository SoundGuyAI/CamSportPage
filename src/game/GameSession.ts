import type { InputPort, SwingCommit } from '../input/types.ts'
import { resolveOutcome } from './outcome.ts'
import { pointsForResult } from './scoring.ts'
import { gradeSwing, type TimingBand, type TimingWindows, DEFAULT_WINDOWS } from './timing.ts'
import type { Phase, PitchState, SessionSnapshot, SwingResult } from './types.ts'

// Re-exported so existing consumers (`import { type SessionSnapshot } from
// './game/GameSession'`) keep working; the contract itself lives in ./types.
export type { HitKind, HitOutcome, Phase, PitchState, SessionSnapshot, SwingResult } from './types.ts'

type Listener = (snapshot: SessionSnapshot) => void

/** Time from release to the ball reaching the plate. */
export const PITCH_FLIGHT_MS = 1300
/** Beat after start() / between rounds before the first pitch is released. */
export const PRE_PITCH_DELAY_MS = 600
/** Extra hold after the scripted arc finishes before the next pitch. */
export const RESULT_HOLD_MS = 500
/** Total hold for a whiff (no arc to play out). */
export const WHIFF_HOLD_MS = 900

/**
 * Minimal clock/timer seam so GameSession never touches `window` and tests can
 * drive time by hand.
 */
export type Scheduler = {
  now(): number
  setTimeout(fn: () => void, ms: number): number
  clearTimeout(handle: number): void
}

export const defaultScheduler: Scheduler = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms) as unknown as number,
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle)
  },
}

/**
 * Core loop: pre-pitch delay -> pitch -> SwingCommit (or timeout) -> grade ->
 * hold the result while the scripted arc plays -> next pitch.
 * Never touches DOM, camera or timers directly — only InputPort + Scheduler.
 */
export class GameSession {
  private results: SwingResult[] = []
  private current: PitchState | null = null
  private lastResult: SwingResult | null = null
  private phase: Phase = 'idle'
  private running = false
  private unsub: (() => void) | null = null
  private timers = new Set<number>()
  private listeners = new Set<Listener>()
  private readonly input: InputPort
  private readonly totalPitches: number
  private readonly windows: TimingWindows
  private readonly clock: Scheduler

  constructor(
    input: InputPort,
    totalPitches = 10,
    windows: TimingWindows = DEFAULT_WINDOWS,
    clock: Scheduler = defaultScheduler,
  ) {
    this.input = input
    this.totalPitches = totalPitches
    this.windows = windows
    this.clock = clock
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Safe to call repeatedly — restarts the round from scratch. */
  start(): void {
    this.teardown()

    this.results = []
    this.current = null
    this.lastResult = null
    this.phase = 'idle'
    this.running = true

    this.input.start()
    this.unsub = this.input.onCommit((commit) => {
      this.handleCommit(commit)
    })

    this.emit()
    this.schedule(() => {
      this.beginPitch(0)
    }, PRE_PITCH_DELAY_MS)
  }

  stop(): void {
    this.teardown()
    this.current = null
    this.running = false
    if (this.phase !== 'finished') this.phase = 'idle'
    this.emit()
  }

  snapshot(): SessionSnapshot {
    return {
      totalPitches: this.totalPitches,
      phase: this.phase,
      completed: [...this.results],
      score: this.results.reduce((s, r) => s + r.points, 0),
      current: this.current,
      lastResult: this.lastResult,
      finished: this.phase === 'finished',
      running: this.running,
    }
  }

  private teardown(): void {
    for (const handle of this.timers) this.clock.clearTimeout(handle)
    this.timers.clear()
    this.unsub?.()
    this.unsub = null
    this.input.stop()
  }

  private schedule(fn: () => void, ms: number): void {
    const handle = this.clock.setTimeout(() => {
      this.timers.delete(handle)
      fn()
    }, ms)
    this.timers.add(handle)
  }

  private beginPitch(index: number): void {
    if (!this.running) return
    if (index >= this.totalPitches) {
      this.finish()
      return
    }

    const startedAtMs = this.clock.now()
    this.current = {
      index,
      startedAtMs,
      contactAtMs: startedAtMs + PITCH_FLIGHT_MS,
    }
    this.phase = 'pitching'
    this.emit()

    // No swing by the end of the contact window => strike looking.
    this.schedule(() => {
      this.resolve('miss', null, null)
    }, PITCH_FLIGHT_MS + this.windows.contactMs)
  }

  private handleCommit(commit: SwingCommit): void {
    // Ignore anything outside the live pitch window: pre-pitch delay, result
    // hold, finished, stopped. Exactly one result per pitch.
    if (this.phase !== 'pitching' || !this.current) return

    const deltaMs = commit.atMs - this.current.contactAtMs
    const band = gradeSwing(commit.atMs, this.current.contactAtMs, this.windows)
    this.resolve(band, commit, deltaMs)
  }

  private resolve(band: TimingBand, commit: SwingCommit | null, deltaMs: number | null): void {
    const pitch = this.current
    if (!pitch || this.phase !== 'pitching') return

    // Cancel the pending pitch timeout (and any stragglers) for this pitch.
    for (const handle of this.timers) this.clock.clearTimeout(handle)
    this.timers.clear()

    const outcome = resolveOutcome(band, deltaMs, pitch.index, this.windows)
    const result: SwingResult = {
      pitchIndex: pitch.index,
      band,
      points: pointsForResult(band, outcome),
      commit,
      deltaMs,
      outcome,
      resolvedAtMs: this.clock.now(),
    }

    this.results.push(result)
    this.lastResult = result
    this.current = null
    this.phase = 'result'
    this.emit()

    const hold = outcome.flightMs > 0 ? outcome.flightMs + RESULT_HOLD_MS : WHIFF_HOLD_MS
    const next = pitch.index + 1
    this.schedule(() => {
      this.beginPitch(next)
    }, hold)
  }

  private finish(): void {
    this.teardown()
    this.current = null
    this.running = false
    this.phase = 'finished'
    this.emit()
  }

  private emit(): void {
    const snap = this.snapshot()
    for (const listener of this.listeners) listener(snap)
  }
}
