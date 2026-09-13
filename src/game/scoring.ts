import type { TimingBand } from './timing'

const POINTS: Record<TimingBand, number> = {
  perfect: 100,
  early: 40,
  late: 40,
  miss: 0,
}

export function pointsForBand(band: TimingBand): number {
  return POINTS[band]
}

export function sumScore(bands: TimingBand[]): number {
  return bands.reduce((total, band) => total + pointsForBand(band), 0)
}
