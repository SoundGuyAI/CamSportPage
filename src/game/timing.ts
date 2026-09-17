export type TimingBand = 'perfect' | 'early' | 'late' | 'miss'

export type TimingWindows = {
  /** Half-width of perfect band around contact (ms) */
  perfectMs: number
  /** Half-width of early/late contact band (ms); outside = miss */
  contactMs: number
}

/**
 * Slightly widened from the original 40/120 for feel: a 100 ms round-trip on
 * pointer input ate most of the perfect band.
 */
export const DEFAULT_WINDOWS: TimingWindows = {
  perfectMs: 50,
  contactMs: 140,
}

export function gradeSwing(
  commitAtMs: number,
  contactAtMs: number,
  windows: TimingWindows = DEFAULT_WINDOWS,
): TimingBand {
  const delta = commitAtMs - contactAtMs
  const abs = Math.abs(delta)

  if (abs <= windows.perfectMs) return 'perfect'
  if (abs > windows.contactMs) return 'miss'
  return delta < 0 ? 'early' : 'late'
}
