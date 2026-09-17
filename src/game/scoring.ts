import type { HitOutcome } from './types.ts'
import type { TimingBand } from './timing.ts'

const POINTS: Record<TimingBand, number> = {
  perfect: 100,
  early: 40,
  late: 40,
  miss: 0,
}

/** Band-only fallback (kept for compat / quick grading without an outcome). */
export function pointsForBand(band: TimingBand): number {
  return POINTS[band]
}

/**
 * Deterministic scoring table:
 *   perfect            -> 100
 *   early/late, fair   -> 40..60, scaled linearly by carry over 150..300 ft
 *   foul               -> 10
 *   miss / whiff       -> 0
 */
export function pointsForResult(band: TimingBand, outcome: HitOutcome): number {
  if (band === 'miss' || outcome.kind === 'whiff') return 0
  if (band === 'perfect') return 100
  if (!outcome.fair) return 10

  const scale = Math.min(1, Math.max(0, (outcome.distanceFt - 150) / 150))
  return 40 + Math.round(scale * 20)
}

export function sumScore(bands: TimingBand[]): number {
  return bands.reduce((total, band) => total + pointsForBand(band), 0)
}
