/**
 * Shared game-state contract (Stage 1).
 * GameSession produces these; React HUD + 3D scene only consume them.
 * Presentation derives ball/batter animation from timestamps here — no physics.
 */
import type { SwingCommit } from '../input/types'
import type { TimingBand } from './timing'

export type Phase =
  | 'idle' // before start / after stop
  | 'pitching' // ball in flight toward plate, waiting for SwingCommit (or timeout → miss)
  | 'result' // outcome shown; scripted arc plays for outcome.flightMs
  | 'finished' // all pitches done

export type HitKind = 'homer' | 'deep' | 'liner' | 'grounder' | 'foul' | 'whiff'

export type HitOutcome = {
  kind: HitKind
  /** false for foul and whiff */
  fair: boolean
  /** scripted carry distance in feet (0 for whiff) */
  distanceFt: number
  /** horizontal direction: 0 = dead center, negative = left field (pulled), positive = right field (pushed). |dirDeg| > 45 is foul. */
  dirDeg: number
  /** launch angle for the scripted arc (deg above horizontal) */
  launchDeg: number
  /** how long presentation should animate the ball after contact (ms) */
  flightMs: number
}

export type PitchState = {
  index: number
  /** performance.now() when the pitch left the pitcher */
  startedAtMs: number
  /** performance.now() when the ball reaches the plate (ideal contact) */
  contactAtMs: number
}

export type SwingResult = {
  pitchIndex: number
  band: TimingBand
  points: number
  /** null when the pitch timed out with no swing */
  commit: SwingCommit | null
  /** commit.atMs - contactAtMs; null when no swing */
  deltaMs: number | null
  outcome: HitOutcome
  /** performance.now() when the result was produced (arc starts here) */
  resolvedAtMs: number
}

export type SessionSnapshot = {
  totalPitches: number
  phase: Phase
  completed: SwingResult[]
  score: number
  current: PitchState | null
  lastResult: SwingResult | null
  /** kept for backward compat: phase === 'finished' */
  finished: boolean
  /**
   * True from start() until the round finishes or stop() is called.
   * Lets the HUD distinguish "idle, waiting for the first pitch to leave the
   * pitcher" (running, phase 'idle', current null) from "not started".
   */
  running?: boolean
}
