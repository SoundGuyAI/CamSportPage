/**
 * Scripted hit outcomes — pure, deterministic, no physics solver and no
 * Math.random (so replays / tests are stable). Variance comes from a tiny
 * integer hash of the pitch index.
 */
import type { HitKind, HitOutcome, SwingResult } from './types.ts'
import { DEFAULT_WINDOWS, type TimingBand, type TimingWindows } from './timing.ts'

/** Foul territory threshold: |dirDeg| beyond this is a foul ball. */
export const FOUL_DEG = 45

/** Deterministic 32-bit hash -> [0, 1). */
function hash01(seed: number): number {
  let x = Math.imul(seed | 0, 0x27d4eb2d) ^ 0x9e3779b9
  x ^= x >>> 15
  x = Math.imul(x, 0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35)
  x ^= x >>> 16
  return (x >>> 0) / 4294967296
}

/** Signed variance in [-amount, +amount). */
function jitter(seed: number, amount: number): number {
  return (hash01(seed) * 2 - 1) * amount
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

const WHIFF: HitOutcome = {
  kind: 'whiff',
  fair: false,
  distanceFt: 0,
  dirDeg: 0,
  launchDeg: 0,
  flightMs: 0,
}

/**
 * Map a graded swing to a scripted ball flight.
 *
 * - perfect -> fair, mostly `homer` (else `deep`), 380-430 ft, |dirDeg| <= 15
 * - early   -> pulled left (negative dirDeg), magnitude grows with |deltaMs|
 * - late    -> pushed right (positive dirDeg), same ramp
 * - miss    -> whiff
 *
 * Right-handed batter assumed: "pulled" = left field.
 */
export function resolveOutcome(
  band: TimingBand,
  deltaMs: number | null,
  pitchIndex: number,
  windows: TimingWindows = DEFAULT_WINDOWS,
): HitOutcome {
  if (band === 'miss' || deltaMs === null) return { ...WHIFF }

  const seed = (pitchIndex + 1) * 101

  if (band === 'perfect') {
    const kind: HitKind = hash01(seed + 1) < 0.78 ? 'homer' : 'deep'
    return {
      kind,
      fair: true,
      distanceFt: Math.round(380 + hash01(seed + 2) * 50),
      dirDeg: round1(jitter(seed + 3, 15)),
      launchDeg: round1(28 + hash01(seed + 4) * 6),
      flightMs: 2200,
    }
  }

  // How far off the perfect band we are, normalised 0..1 across the contact window.
  const span = Math.max(1, windows.contactMs - windows.perfectMs)
  const t = clamp((Math.abs(deltaMs) - windows.perfectMs) / span, 0, 1)

  // 12deg (barely off) ramping to ~60deg (nearly a whiff) -> foul past 45deg,
  // which happens around |delta| >= ~112 ms with the default 50/140 windows.
  const sign = band === 'early' ? -1 : 1
  const dirMag = 12 + t * 48 + jitter(seed + 5, 3)
  const dirDeg = round1(sign * dirMag)

  if (Math.abs(dirDeg) > FOUL_DEG) {
    return {
      kind: 'foul',
      fair: false,
      distanceFt: Math.round(70 + hash01(seed + 6) * 70),
      dirDeg,
      launchDeg: round1(18 + hash01(seed + 7) * 40),
      flightMs: 1400,
    }
  }

  // Fair but mistimed: 300 ft when barely early/late down to ~150 ft near foul.
  const distanceFt = Math.round(clamp(300 - t * 150 + jitter(seed + 8, 20), 140, 320))
  const kind: HitKind = distanceFt >= 260 ? 'deep' : distanceFt >= 195 ? 'liner' : 'grounder'
  const launchDeg =
    kind === 'deep'
      ? 25 + hash01(seed + 9) * 6
      : kind === 'liner'
        ? 12 + hash01(seed + 9) * 6
        : 2 + hash01(seed + 9) * 6

  return {
    kind,
    fair: true,
    distanceFt,
    dirDeg,
    launchDeg: round1(launchDeg),
    flightMs: Math.round(900 + distanceFt * 3.5),
  }
}

const KIND_LABEL: Record<HitKind, string> = {
  homer: 'Home run',
  deep: 'Deep fly',
  liner: 'Line drive',
  grounder: 'Ground ball',
  foul: 'Foul ball',
  whiff: 'Swing and a miss',
}

/** One-line HUD text. Shared so the 3D scene and the HUD never disagree. */
export function describeResult(result: SwingResult): string {
  const { band, outcome, commit } = result

  if (band === 'miss') {
    return commit ? 'Miss — swinging strike' : 'Miss — strike looking'
  }

  if (band === 'perfect') {
    return `PERFECT! ${KIND_LABEL[outcome.kind]} — ${outcome.distanceFt} ft`
  }

  const label = band === 'early' ? 'Early' : 'Late'
  if (!outcome.fair) return `${label} — foul ball`

  const side = outcome.dirDeg < 0 ? 'left' : 'right'
  return `${label} — ${outcome.distanceFt} ft to ${side}`
}
