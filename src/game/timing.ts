export type TimingBand = 'perfect' | 'early' | 'late' | 'miss'

export type TimingWindows = {
  /** Half-width of perfect band around contact (ms) */
  perfectMs: number
  /** Half-width of early/late contact band (ms); outside = miss */
  contactMs: number
}

export const DEFAULT_WINDOWS: TimingWindows = {
  perfectMs: 40,
  contactMs: 120,
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
