/**
 * Scene units: **1 unit = 1 foot**. (HitOutcome.distanceFt maps 1:1 to units.)
 *
 * Coordinate conventions (right-handed, Y-up, matching glTF):
 *   - Home plate sits at the origin (0, 0, 0).
 *   - **-Z points toward center field**; +Z is behind the catcher (the camera side).
 *   - +X is the first-base / right-field side, -X is the third-base / left-field side.
 *   - HitOutcome.dirDeg 0 = dead center (-Z); negative = pulled to left field (-X);
 *     positive = pushed to right field (+X). |dirDeg| > 45 is outside the foul lines.
 *   - The camera lives behind and above the catcher looking toward the mound, so
 *     screen-right is +X (first base) — same as a broadcast "behind the plate" shot.
 */

export const DEG = Math.PI / 180

/** Distance from the plate to the pitching rubber (ft). */
export const MOUND_DISTANCE = 60.5

/** Where the ball leaves the pitcher's hand (a few feet in front of the rubber). */
export const RELEASE_POINT: [number, number, number] = [0.8, 6.0, -(MOUND_DISTANCE - 5)]

/** Ideal contact point in front of the plate, roughly belt-high. */
export const CONTACT_POINT: [number, number, number] = [0, 3.1, 0.4]

/** Where the ball ends up on a whiff (catcher's mitt). */
export const CATCHER_POINT: [number, number, number] = [0, 2.2, 5.0]

/** Milliseconds the ball keeps travelling past the plate on a whiff. */
export const WHIFF_TRAVEL_MS = 220

/** Right-handed batter stands on the third-base (-X) side of the plate. */
export const BATTER_POSITION: [number, number, number] = [-2.6, 0, 0.9]

/** Pitcher stands on the rubber. */
export const PITCHER_POSITION: [number, number, number] = [0, 0.82, -MOUND_DISTANCE]

/** Target height for humanoids (ft) — GLB models are bbox-normalised to this. */
export const FIGURE_HEIGHT = 6.0

/** Outfield fence: 330 ft down the lines, 400 ft to straightaway center. */
export const FENCE_LINE_FT = 330
export const FENCE_CENTER_FT = 400
/** Raised from 8 → 10 ft: a 10-ft wall at 330–400 ft still only subtends ~1.6°. */
export const FENCE_HEIGHT = 10
/** Wall banding (ft from the ground): kick strip, padding, top rail. */
export const WALL_KICK_H = 1.5
export const WALL_PAD_H = 8.2

/** Foul lines run at ±45° from dead center. */
export const FOUL_DEG = 45

/**
 * Fence radius at `deg` off dead center: 400 ft in center easing to 330 ft at the
 * foul poles. Shared by the wall mesh, the field map and the backdrop so the
 * warning track, padding and bleachers all follow the same arc.
 */
export function fenceRadius(deg: number): number {
  return FENCE_LINE_FT + (FENCE_CENTER_FT - FENCE_LINE_FT) * Math.cos(deg * DEG * 2)
}

/** Base bags (1.25 ft square, 0.25 ft tall) on a 90-ft diamond. */
export const BASE_POSITIONS: [number, number, number][] = [
  [63.6, 0.12, -63.6],
  [0, 0.12, -127.3],
  [-63.6, 0.12, -63.6],
]

/** Camera framing — see §8 of docs/art-direction.md. */
export const CAMERA_FOV = 34
export const CAMERA_POSITION: [number, number, number] = [1.9, 9.6, 24.0]
export const CAMERA_TARGET: [number, number, number] = [-0.1, 4.4, -58.0]
/** Pitch push-in end state (eased over pitch progress t ∈ [0.55, 1.0]). */
export const CAMERA_PUSH_FOV = 32.2
export const CAMERA_PUSH_Z = 22.6

/** Perfect window as pitch progress: ±50 ms of a 1300 ms flight. */
export const PERFECT_T_MIN = 0.962
export const PERFECT_T_MAX = 1.038
/** Contact (early/late) window as pitch progress: ±140 ms. */
export const CONTACT_T_MIN = 0.892
export const CONTACT_T_MAX = 1.108

/** Procedural bat swing: ~120° of yaw over ~180 ms, sweeping through the plate. */
export const SWING_MS = 180
export const SWING_ARC = (120 * Math.PI) / 180
export const SWING_RETURN_MS = 320
/**
 * Bat pivot rotation. The bat mesh runs along the pivot's local +Z, and the batter
 * group is yawed +90° so batter-local +Z points at the plate. Euler order is XYZ, so
 * X is the up/down tilt (applied first) and Y is the swing yaw.
 */
export const BAT_REST_Y = -0.9
export const BAT_REST_X = -0.6
export const BAT_SWING_X = 0.5

export const COLORS = {
  // sky
  skyZenith: '#2E7FD6',
  skyMid: '#79B8F0',
  skyHorizon: '#DCEEFB',
  // field
  grassLight: '#5FB04A',
  grassDark: '#4A9139',
  outfieldRim: '#3E7C32',
  clay: '#C08B55',
  clayDark: '#A87145',
  warningTrack: '#B57D4A',
  chalk: '#FBFBF6',
  // structure
  wall: '#1F6B4B',
  wallKick: '#14503A',
  wallRail: '#F5D547',
  bleacher: '#C9CFD6',
  bleacherShadow: '#8E97A3',
  crowd: '#6C7580',
  hillFront: '#4E7A5C',
  hillBack: '#3F6A55',
  cloud: '#FFFFFF',
  cloudUnder: '#D6E7F7',
  // props & characters
  ball: '#FCFCF7',
  ballSeam: '#D8443C',
  ballOutline: '#12212B',
  batBarrel: '#D9A25C',
  batBarrelLight: '#E6B878',
  batBarrelDark: '#B07C3F',
  batHandle: '#8A5A32',
  batterTint: '#E8ECF2',
  batterAccent: '#1F6BD6',
  pitcherTint: '#C4403F',
  skin: '#E0AC7E',
  pants: '#9AA0AD',
  // timing ring states
  ringFar: '#7FD7FF',
  ringNear: '#FFC64D',
  ringPerfect: '#7DFFB3',
} as const

/** Deterministic 32-bit hash → [0, 1). Same mixer as `src/game/outcome.ts`. */
export function hash01(seed: number): number {
  let x = Math.imul(seed | 0, 0x27d4eb2d) ^ 0x9e3779b9
  x ^= x >>> 15
  x = Math.imul(x, 0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35)
  x ^= x >>> 16
  return (x >>> 0) / 4294967296
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const smoothstep = (x: number) => {
  const t = clamp01(x)
  return t * t * (3 - 2 * t)
}
