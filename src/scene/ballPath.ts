import type { SessionSnapshot } from '../game/types'
import {
  CATCHER_POINT,
  CONTACT_POINT,
  RELEASE_POINT,
  WHIFF_TRAVEL_MS,
} from './constants'

export type BallPose = {
  visible: boolean
  x: number
  y: number
  z: number
  /** 0..1 progress of the current pitch, used by the timing ring. -1 when not pitching. */
  pitchT: number
}

const HIDDEN: BallPose = { visible: false, x: 0, y: 0, z: 0, pitchT: -1 }

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

const DEG = Math.PI / 180

/**
 * Pure, deterministic ball pose from timestamps only — no physics, no randomness.
 * `nowMs` must come from the same clock GameSession uses (`performance.now()`).
 */
export function ballPose(snapshot: SessionSnapshot, nowMs: number): BallPose {
  const { phase, current, lastResult } = snapshot

  if (phase === 'pitching' && current) {
    const span = Math.max(1, current.contactAtMs - current.startedAtMs)
    const t = clamp01((nowMs - current.startedAtMs) / span)
    return {
      visible: true,
      ...lerpPitch(t),
      pitchT: t,
    }
  }

  if (phase === 'result' && lastResult) {
    const { outcome, resolvedAtMs } = lastResult
    const elapsed = nowMs - resolvedAtMs

    if (outcome.kind === 'whiff') {
      // Ball sails past the plate into the catcher's mitt, then vanishes.
      const t = elapsed / WHIFF_TRAVEL_MS
      if (t > 1) return HIDDEN
      const k = clamp01(t)
      return {
        visible: true,
        x: CONTACT_POINT[0] + (CATCHER_POINT[0] - CONTACT_POINT[0]) * k,
        y: CONTACT_POINT[1] + (CATCHER_POINT[1] - CONTACT_POINT[1]) * k,
        z: CONTACT_POINT[2] + (CATCHER_POINT[2] - CONTACT_POINT[2]) * k,
        pitchT: -1,
      }
    }

    const flight = Math.max(1, outcome.flightMs)
    const t = clamp01(elapsed / flight)
    // Scripted parabola: range R at launch angle θ → y = x·tanθ·(1 − x/R).
    const dist = Math.max(0, outcome.distanceFt) * t
    const theta = outcome.launchDeg * DEG
    const arc = dist * Math.tan(theta) * (1 - t)
    const heading = outcome.dirDeg * DEG
    return {
      visible: true,
      x: CONTACT_POINT[0] + Math.sin(heading) * dist,
      y: CONTACT_POINT[1] * (1 - t) + Math.max(0, arc),
      z: CONTACT_POINT[2] - Math.cos(heading) * dist,
      pitchT: -1,
    }
  }

  return HIDDEN
}

/**
 * Release → plate. Horizontal motion is linear; the vertical channel is eased
 * (t^1.8) so the ball drops faster near the plate like a real pitch, while still
 * hitting CONTACT_POINT exactly at t = 1.
 */
function lerpPitch(t: number): { x: number; y: number; z: number } {
  const drop = Math.pow(t, 1.8)
  return {
    x: RELEASE_POINT[0] + (CONTACT_POINT[0] - RELEASE_POINT[0]) * t,
    y: RELEASE_POINT[1] + (CONTACT_POINT[1] - RELEASE_POINT[1]) * drop,
    z: RELEASE_POINT[2] + (CONTACT_POINT[2] - RELEASE_POINT[2]) * t,
  }
}

/**
 * Unclamped pitch progress (0 at release, 1 at the plate), used by the timing
 * ring so it can keep reading past `contactAtMs` — the contact window runs to
 * t = 1.108 and the perfect window to t = 1.038. -1 when no pitch is live.
 */
export function pitchProgress(snapshot: SessionSnapshot, nowMs: number): number {
  const { phase, current } = snapshot
  if (phase !== 'pitching' || !current) return -1
  const span = Math.max(1, current.contactAtMs - current.startedAtMs)
  const t = (nowMs - current.startedAtMs) / span
  return t < 0 ? 0 : t > 1.25 ? 1.25 : t
}
