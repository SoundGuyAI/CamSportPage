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
export const PITCHER_POSITION: [number, number, number] = [0, 0.7, -MOUND_DISTANCE]

/** Target height for humanoids (ft) — GLB models are bbox-normalised to this. */
export const FIGURE_HEIGHT = 6.0

/** Outfield fence: 330 ft down the lines, 400 ft to straightaway center. */
export const FENCE_LINE_FT = 330
export const FENCE_CENTER_FT = 400
export const FENCE_HEIGHT = 8

/** Foul lines run at ±45° from dead center. */
export const FOUL_DEG = 45

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
  sky: '#8ec5f0',
  grass: '#4e9b44',
  dirt: '#b98a5a',
  dirtDark: '#a5764a',
  chalk: '#f2f2ee',
  fence: '#2f5d3a',
  ball: '#fbfbf7',
  bat: '#c79a5b',
  batterShirt: '#d8d8dc',
  batterPants: '#9aa0ad',
  pitcherShirt: '#3c4a7a',
  skin: '#e0ac7e',
  ring: '#ffe27a',
} as const
