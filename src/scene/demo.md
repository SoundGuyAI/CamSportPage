# `src/scene` — 3D presentation layer

Pure juice. Consumes `SessionSnapshot` (frozen contract in `src/game/types.ts`) and
derives every bit of motion from its timestamps against `performance.now()`.
No physics engine, no `Math.random`, no imperative tweens — every effect is
seek-safe (rendering at any instant gives the same picture). Art direction:
`docs/art-direction.md`.

## Mounting

```tsx
import { BattingScene } from './scene'

<BattingScene
  snapshot={snap}
  batterUrl={`${import.meta.env.BASE_URL}models/batter.glb`}
  // pitcherUrl is optional — defaults to batterUrl (tinted) for a matching style
/>
```

Props:

| prop | type | notes |
|---|---|---|
| `snapshot` | `SessionSnapshot` | required; safe when `current` / `lastResult` are `null` |
| `batterUrl` | `string?` | rigged glTF/GLB; omit → procedural capsule figure |
| `pitcherUrl` | `string?` | omit → reuses `batterUrl` with a tinted material clone |
| `className` | `string?` | appended to the `.camsport-scene` wrapper |

The wrapper is a 16:9 `aspect-ratio` block; give it a width. `scene.css` is imported
by the component. The canvas never calls `stopPropagation`, so the window-level
`pointerdown` swing input keeps working over the 3D view.

## Units & axes (1 unit = 1 foot)

- Home plate at the origin. `HitOutcome.distanceFt` maps 1:1 to scene units.
- **-Z = center field**, +Z = behind the catcher (camera side).
- +X = first base / right field, -X = third base / left field.
- `dirDeg` 0 → -Z, negative → -X (pulled to left), positive → +X. `±45°` = foul lines.

## Coordinate & framing constants (`constants.ts`)

| thing | value |
|---|---|
| mound / release / contact / catcher | `-60.5` Z · `[0.8, 6, -55.5]` · `[0, 3.1, 0.4]` · `[0, 2.2, 5]` |
| batter / pitcher | `[-2.6, 0, 0.9]` (yawed +90°) · `[0, 0.82, -60.5]` (mound top = 0.825) |
| bases | 1B `[63.6, .12, -63.6]`, 2B `[0, .12, -127.3]`, 3B `[-63.6, .12, -63.6]` |
| fence | `fenceRadius(deg) = 330 + 70·cos(2·deg)` → 400 ft center, 330 ft at ±45° |
| wall bands | kick 0–1.5 `#14503A`, padding 1.5–8.2 `#1F6B4B`, rail 8.2–10 `#F5D547` |
| foul poles | ±45° at r = 330, 34 ft tall + a 5 × 24 ft fair-side fin, `#F5D547` |
| distance markers | `330/375/400/375/330` at ∓45/∓22/0°, 9 × 5 ft plane, `fenceRadius − 1.8`, y 4.6 |
| bleacher ring | −60°…+60°, inner r = `fenceRadius(≤45°) + 25`, 26 ft tall, leaning back 22° |
| hills | open cylinders r 560 (h 45) and r 620 (h 70), `BackSide` |
| clouds | 5 × `plane(92, 38)` at y 102–154, z −600…−800, `x = x0 + sin(t·0.03 + i)·12` |
| sky dome | `sphere(900)` `BackSide`, unlit, unfogged · fog `#DCEEFB` 340 → 1200 |
| camera | fov **34**, pos `[1.9, 9.6, 24.0]`, target `[-0.1, 4.4, -58.0]` |
| push-in | fov 34 → **32.2**, z 24.0 → **22.6**, smoothstep over pitch `t ∈ [0.55, 1]` |
| lights | ambient 0.35 · hemi `#9FD0F5`/`#4A8F3C` 0.90 · dir `[-120, 180, 90]` `#FFF6E0` 2.10 |
| shadow | 1024², ortho ±34, near 40 / far 260, bias −0.0006, normalBias 0.02 |
| renderer | ACES filmic, exposure 1.05, dpr `[1, 1.75]` desktop / `[1, 1.5]` otherwise |
| timing ring | outer `ring(0.82│0.74, 1.0)` scaled 3.4 → 0.95 · static perfect zone `ring(0.86, 0.99)` |
| ring colours | `#7FD7FF` (t < .80) → `#FFC64D` (.80–.96) → `#7DFFB3` only for `t ∈ [0.962, 1.038]` |

The field map is one 2048² canvas covering a **640 ft** square, drawn in polar
coordinates about the plate and mapped to a single `plane(640, 640)` at
`[0, -0.02, -260]` (so the plate lands 320 ft from the far edge, 3.2 px/ft). A
2200 ft `#3E7C32` ground plane sits underneath it for everything past the map.

## Ball states

| phase | behaviour |
|---|---|
| `pitching` | lerp release → contact point over `[startedAtMs, contactAtMs]`, vertical channel eased `t^1.8`; scale `1 + 0.28·t` |
| `result`, `kind !== 'whiff'` | parabola `y = x·tan(launchDeg)·(1 − x/distanceFt)` along `dirDeg`, completing at `resolvedAtMs + flightMs` |
| `result`, `kind === 'whiff'` | continues past the plate into the catcher over 220 ms, then hidden |
| `idle` / `finished` | hidden |

`ballPath.ts` also exports `pitchProgress(snapshot, now)` — the *unclamped* pitch
progress (up to 1.25) the ring and the camera push-in need, since the perfect
window ends at `t = 1.038` and the contact window at `t = 1.108`.

## Effects — what lives where

| file | effects |
|---|---|
| `textures.ts` | every canvas texture: sky gradient 4×256, cloud 256×128, **field map 2048²**, bleacher 256×128 (hashed crowd speckle), distance marker / jersey number, bat gradient 32×256, ball seam 128², soft disc 256², star 256², shadow blob 128² |
| `useGeneratedTexture.ts` | builds a texture once, stamps renderer anisotropy, disposes on unmount |
| `Field.tsx` | field-map plane (receives shadow), mound + rubber, plate, bases, 3-band wall arc, foul poles, distance markers, **home-run wall emissive flash** (0 → 0.9 → 0 over 420 ms from `resolvedAtMs`) |
| `Backdrop.tsx` | sky dome, two hill bands, bleacher ring, drifting cloud billboards |
| `Ball.tsx` | outline shell + seam ball, approach scale cue, **8-instance trail** (`InstancedMesh`, 26 ms steps in flight / 45 ms after contact), three-state timing ring + static perfect zone + additive glow ramp (`t ∈ [0.90, 1.0]`, snaps off past 1.038) |
| `Impact.tsx` | contact star flash + 10 hashed chevrons (240 ms from `commit.atMs`), landing puff (420 ms from `resolvedAtMs + flightMs`, clay vs grass tint), 3 fixed-position fireworks at +200/380/560 ms for 520 ms each |
| `CameraRig.tsx` | idle drift, pitch push-in, 120 ms contact kick (≤ 0.35 ft + 0.008 rad roll), home-run nudge (target y → 9, fov → 37); the kick and nudge are gated behind `prefers-reduced-motion`, the push-in is not (it is informational) |
| `Dressing.tsx` | helmet / cap, chest number, two-part bat with sun gradient, baked contact blob for figures outside the shadow frustum |
| `Batter.tsx` | swing pivot (~120° over 180 ms), torso rotation, idle sway (`sin(t·1.1)·0.035` roll + `sin(t·2.2)·0.04` bob) frozen during the swing and during `result` |
| `Pitcher.tsx` | rock-back over the 260 ms before the *predicted* next release, 0.20 rad drive at release, 500 ms settle |
| `GlbFigure.tsx` | GLB load/clone/normalise, `Idle` loop, `/punch|swing/` one-shot (timeScale 1.4 batter, 0.9 pitcher), `/thumb|wave|yes/` celebration scheduled at `resolvedAtMs + 400` on a perfect result, jersey tint at 0.8, `castShadow` on every mesh |

Determinism: no `Math.random` anywhere. Where variation is wanted (chevron
angles, crowd speckle) it comes from `hash01()` in `constants.ts` — the same
integer mixer `src/game/outcome.ts` uses — keyed by `pitchIndex` or an index.

The whole home-run sequence finishes within 1200 ms of `resolvedAtMs`
(wall flash 0–420, fireworks 200–1080, camera nudge in 0–400 / out at
`flightMs − 300`).

## Model handling

`GlbFigure` loads via drei `useGLTF`, clones with `SkeletonUtils.clone` (so one cached
GLTF can be mounted twice with independent mixers), `Box3`-normalises the clone to 6 ft
with feet on `y = 0`, and plays the first clip matching `/idle/i` (else clip 0) on loop.
The procedural bat swing (~120° over 180 ms from `commit.atMs`) always runs, so the
swing reads even when the GLB has no suitable clip. Headwear, chest number, bat and
the contact blob are siblings of the model, so they render identically on the
fallback path.

Load failure or a missing url falls back to `StylizedFigure` (primitives) via
`ModelErrorBoundary` + `Suspense`.
