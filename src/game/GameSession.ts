import type { InputPort, SwingCommit } from '../input/types'
import { pointsForBand } from './scoring'
import { gradeSwing, type TimingBand, type TimingWindows, DEFAULT_WINDOWS } from './timing'

export type PitchState = {
  index: number
  /** When the ball reaches the plate (performance.now timeline) */
  contactAtMs: number
  startedAtMs: number
}

export type SwingResult = {
  pitchIndex: number
  band: TimingBand
  points: number
  commit: SwingCommit
}

export type SessionSnapshot = {
  totalPitches: number
  completed: SwingResult[]
  score: number
  current: PitchState | null
  finished: boolean
}

type Listener = (snapshot: SessionSnapshot) => void

const PITCH_FLIGHT_MS = 1200

/**
 * Core loop: start pitch → wait for SwingCommit → grade → next.
 * Never touches DOM or camera — only InputPort.
 */
export class GameSession {
  private results: SwingResult[] = []
  private current: PitchState | null = null
  private finished = false
  private unsub: (() => void) | null = null
  private listeners = new Set<Listener>()
  private readonly input: InputPort
  private readonly totalPitches: number
  private readonly windows: TimingWindows

  constructor(
    input: InputPort,
    totalPitches = 10,
    windows: TimingWindows = DEFAULT_WINDOWS,
  ) {
    this.input = input
    this.totalPitches = totalPitches
    this.windows = windows
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  start(): void {
    this.results = []
    this.finished = false
    this.input.start()
    this.unsub = this.input.onCommit((commit) => this.handleCommit(commit))
    this.beginPitch(0)
  }

  stop(): void {
    this.unsub?.()
    this.unsub = null
    this.input.stop()
    this.current = null
    this.emit()
  }

  snapshot(): SessionSnapshot {
    return {
      totalPitches: this.totalPitches,
      completed: [...this.results],
      score: this.results.reduce((s, r) => s + r.points, 0),
      current: this.current,
      finished: this.finished,
    }
  }

  private beginPitch(index: number): void {
    if (index >= this.totalPitches) {
      this.finished = true
      this.current = null
      this.input.stop()
      this.emit()
      return
    }

    const startedAtMs = performance.now()
    this.current = {
      index,
      startedAtMs,
      contactAtMs: startedAtMs + PITCH_FLIGHT_MS,
    }
    this.emit()
  }

  private handleCommit(commit: SwingCommit): void {
    if (!this.current || this.finished) return

    const band = gradeSwing(commit.atMs, this.current.contactAtMs, this.windows)
    const result: SwingResult = {
      pitchIndex: this.current.index,
      band,
      points: pointsForBand(band),
      commit,
    }
    this.results.push(result)
    const next = this.current.index + 1
    this.current = null
    this.emit()

    // Brief beat before next pitch (keeps UI readable)
    window.setTimeout(() => this.beginPitch(next), 500)
  }

  private emit(): void {
    const snap = this.snapshot()
    for (const listener of this.listeners) listener(snap)
  }
}
