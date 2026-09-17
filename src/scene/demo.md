# `src/scene` — 3D presentation layer

Pure juice. Consumes `SessionSnapshot` (frozen contract in `src/game/types.ts`) and
derives every bit of motion from its timestamps against `performance.now()`.
No physics engine, no `Math.random`, no imperative tweens.

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
- Mound 60.5 ft at -Z; fence arc 330 ft down the lines to 400 ft in center, 8 ft tall.
- Camera sits at `(2.4, 12.5, 29.5)` looking at `(-0.2, 5.2, -42)`, fov 36 — broadcast behind-the-plate.

## Ball states

| phase | behaviour |
|---|---|
| `pitching` | lerp release → contact point over `[startedAtMs, contactAtMs]`, vertical channel eased `t^1.8` for a gentle drop |
| `result`, `kind !== 'whiff'` | parabola `y = x·tan(launchDeg)·(1 − x/distanceFt)` along `dirDeg`, completing at `resolvedAtMs + flightMs`, then held on the ground |
| `result`, `kind === 'whiff'` | continues past the plate into the catcher over 220 ms, then hidden |
| `idle` / `finished` | hidden |

A translucent ring at the contact point shrinks from 3.2 ft to 0.8 ft as the pitch arrives.

## Model handling

`GlbFigure` loads via drei `useGLTF`, clones with `SkeletonUtils.clone` (so one cached
GLTF can be mounted twice with independent mixers), `Box3`-normalises the clone to 6 ft
with feet on `y = 0`, and plays the first clip matching `/idle/i` (else clip 0) on loop.
When `swingAtMs` changes, a clip matching `/punch|swing|hit|attack|bat/i` plays once and
fades back to idle. The procedural bat swing (~120° over 180 ms from `commit.atMs`) always
runs, so the swing reads even when the GLB has no suitable clip.

Load failure or a missing url falls back to `StylizedFigure` (primitives) via
`ModelErrorBoundary` + `Suspense`.
