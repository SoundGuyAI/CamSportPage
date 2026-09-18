/**
 * Snapshot transition -> sound cues.
 *
 * Deliberately pure: no Web Audio, no DOM, no timers, no `Math.random`. The
 * React hook (`useGameAudio`) only diffs snapshots and hands the result to the
 * engine, so every mapping rule is testable under plain node
 * (`scripts/check-audio.ts`).
 */
import type { SessionSnapshot, SwingResult } from '../game/types.ts'
import type { SoundId } from './types.ts'

export type Cue = {
  id: SoundId
  /** Delay from "now" in ms (default 0). Ignored when `atPerfMs` is set. */
  delayMs?: number
  /** Absolute `performance.now()` target for the start of the sound. */
  atPerfMs?: number
  /** Per-cue gain multiplier, 0..1 (default 1). */
  gain?: number
  /** Loop control instead of a one-shot trigger. */
  loop?: 'start' | 'stop'
  /** Fade-out length for `loop: 'stop'`. */
  fadeMs?: number
}

/** The whoosh is started early so its peak lands on the contact point. */
export const WHOOSH_LEAD_MS = 350
/** Crowd reaction trails the bat. */
export const CHEER_DELAY_MS = 250
/** The mitt "pop" after a swinging strike. */
export const MITT_DELAY_MS = 120
/** Groan after a swinging strike (mitt first, then the crowd). */
export const SWING_MISS_OHH_DELAY_MS = 300
/** Groan / boo after a called strike. */
export const LOOKING_STRIKE_REACTION_DELAY_MS = 260
/** Reaction to a foul tip. */
export const FOUL_OHH_DELAY_MS = 220
/** Applause starts just after the final result lands. */
export const APPLAUSE_DELAY_MS = 120
/** Ambience keeps running for a beat after the round, then fades. */
export const AMBIENCE_STOP_DELAY_MS = 1000
export const AMBIENCE_FADE_MS = 1000
/** A manual stop() kills the bed quickly instead. */
export const AMBIENCE_ABORT_FADE_MS = 250

/** Mistimed-but-fair contact gets a muted reaction. */
export const QUIET_CHEER_GAIN = 0.45
/** Booing is a garnish, never the headline. */
export const BOO_GAIN = 0.5

/**
 * How many *consecutive* called strikes (miss with no swing) the round ends on,
 * counting the result that just landed. 2+ earns a boo.
 */
export function trailingLookingStrikes(completed: readonly SwingResult[]): number {
  let n = 0
  for (let i = completed.length - 1; i >= 0; i -= 1) {
    const r = completed[i]
    if (r.band === 'miss' && r.commit === null) n += 1
    else break
  }
  return n
}

function cuesForResult(result: SwingResult, completed: readonly SwingResult[]): Cue[] {
  const { band, outcome, commit } = result

  if (band === 'perfect') {
    return [
      { id: 'bat_crack_perfect' },
      {
        id: outcome.kind === 'homer' ? 'crowd_cheer_big' : 'crowd_cheer_small',
        delayMs: CHEER_DELAY_MS,
      },
    ]
  }

  if (band === 'early' || band === 'late') {
    if (outcome.fair) {
      return [
        { id: 'bat_crack_contact' },
        { id: 'crowd_cheer_small', delayMs: CHEER_DELAY_MS, gain: QUIET_CHEER_GAIN },
      ]
    }
    // Foul ball / foul tip.
    return [{ id: 'bat_foul_tip' }, { id: 'crowd_ohh', delayMs: FOUL_OHH_DELAY_MS }]
  }

  // band === 'miss'
  if (commit !== null) {
    return [
      { id: 'whiff' },
      { id: 'catcher_mitt', delayMs: MITT_DELAY_MS },
      { id: 'crowd_ohh', delayMs: SWING_MISS_OHH_DELAY_MS },
    ]
  }

  // Called strike: the crowd only turns on you after the second one in a row.
  const looking = trailingLookingStrikes(completed)
  return [
    { id: 'catcher_mitt' },
    looking >= 2
      ? { id: 'crowd_boo', delayMs: LOOKING_STRIKE_REACTION_DELAY_MS, gain: BOO_GAIN }
      : { id: 'crowd_ohh', delayMs: LOOKING_STRIKE_REACTION_DELAY_MS },
  ]
}

/**
 * Diff two snapshots into the cues that should fire now.
 *
 * Every trigger is keyed on a monotonic timestamp from the snapshot contract
 * (`current.startedAtMs`, `lastResult.resolvedAtMs`) so re-delivering the same
 * snapshot — or React re-running the effect — can never double-fire.
 */
export function cuesForTransition(prev: SessionSnapshot | null, next: SessionSnapshot): Cue[] {
  const cues: Cue[] = []

  const wasRunning = prev?.running ?? false
  const isRunning = next.running ?? false

  // ---- ambience bed follows the round
  if (isRunning && !wasRunning) cues.push({ id: 'crowd_ambience', loop: 'start' })

  // ---- pitch released (a brand-new startedAtMs)
  const prevStartedAtMs = prev?.current?.startedAtMs ?? null
  const pitch = next.current
  if (pitch && pitch.startedAtMs !== prevStartedAtMs) {
    cues.push({ id: 'pitch_whoosh', atPerfMs: pitch.contactAtMs - WHOOSH_LEAD_MS })
  }

  // ---- result landed (a brand-new resolvedAtMs)
  const prevResolvedAtMs = prev?.lastResult?.resolvedAtMs ?? null
  const result = next.lastResult
  if (result && result.resolvedAtMs !== prevResolvedAtMs) {
    cues.push(...cuesForResult(result, next.completed))
  }

  // ---- round over
  const wasFinished = prev?.phase === 'finished'
  if (next.phase === 'finished' && !wasFinished) {
    cues.push({ id: 'applause_end', delayMs: APPLAUSE_DELAY_MS })
    cues.push({
      id: 'crowd_ambience',
      loop: 'stop',
      delayMs: AMBIENCE_STOP_DELAY_MS,
      fadeMs: AMBIENCE_FADE_MS,
    })
  } else if (wasRunning && !isRunning) {
    // stop() / restart mid-round: kill the bed without the applause.
    cues.push({ id: 'crowd_ambience', loop: 'stop', fadeMs: AMBIENCE_ABORT_FADE_MS })
  }

  return cues
}
