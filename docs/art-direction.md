# CamSport — Art Direction Spec

Scope: presentation only. Nothing here adds physics, changes `GameSession`, or introduces
per-frame randomness. Every animation below is a pure function of `performance.now()`
against snapshot timestamps (same rule as `src/scene/ballPath.ts`), or of a *hash of
`pitchIndex`* where variation is wanted. Units: 1 unit = 1 ft, plate at origin,
-Z = center field, camera behind the plate.

Reference timings from `src/game/GameSession.ts` / `timing.ts`, used throughout:
`PITCH_FLIGHT_MS = 1300`, perfect window `±50 ms` (→ pitch progress `t ∈ [0.962, 1.038]`),
contact window `±140 ms` (→ `t ∈ [0.892, 1.108]`), `PRE_PITCH_DELAY_MS = 600`,
`RESULT_HOLD_MS = 500`.

---

## 1. Art direction in one paragraph

A sunny 3 p.m. neighbourhood ballpark rendered like a plastic toy set: chunky saturated
shapes, zero photographic detail, everything lit by one warm sun and a big blue bounce
so nothing is ever muddy. The park should read as a *diorama* — a clean green fan of
mowing stripes, a candy-red clay infield, a teal padded wall with white distance numbers,
a pale bleacher ring and two flat cartoon cloud billboards — so the eye has nothing to do
except track the white ball. References: Wii Sports Baseball's flat-lit mini-stadium,
Nintendo Switch Sports' pastel-with-one-hot-accent UI, Mario Superstar Baseball's
oversaturated turf and thick outlines. Three adjectives: **crisp, sunny, toy-like**.

---

## 2. Palette

Replace `COLORS` in `src/scene/constants.ts` wholesale; add a `UI` block or mirror these
as CSS custom properties in `App.css`.

**Sky (vertical gradient, 3 stops)**
| stop | hex | y |
|---|---|---|
| zenith | `#2E7FD6` | top of dome |
| mid | `#79B8F0` | 45° |
| horizon haze | `#DCEEFB` | horizon line |

**Field**
| element | hex |
|---|---|
| grass light stripe | `#5FB04A` |
| grass dark stripe | `#4A9139` |
| outfield rim (fog blend / far ring) | `#3E7C32` |
| infield clay | `#C08B55` |
| clay dark (mound, base paths) | `#A87145` |
| warning track | `#B57D4A` |
| chalk lines / plate / bases | `#FBFBF6` |

**Structure**
| element | hex |
|---|---|
| wall face (padding) | `#1F6B4B` |
| wall padding lower stripe | `#14503A` |
| wall top rail + foul poles | `#F5D547` |
| bleacher concrete | `#C9CFD6` |
| bleacher shadow / crowd speckle | `#8E97A3` / `#6C7580` |
| distant hills (two bands) | `#4E7A5C` / `#3F6A55` |
| clouds | `#FFFFFF` core, `#D6E7F7` underside |

**Props & characters**
| element | hex |
|---|---|
| ball | `#FCFCF7`, seam `#D8443C` |
| ball outline (BackSide shell) | `#12212B` |
| bat barrel | `#D9A25C`, handle tape `#8A5A32` |
| batter tint (home whites) | `#E8ECF2`, accent `#1F6BD6` |
| pitcher tint (away) | `#C4403F` |
| timing ring far → near → perfect | `#7FD7FF` → `#FFC64D` → `#7DFFB3` |

**UI** (contrast ratios against the panel `#101E18`)
| token | hex | ratio |
|---|---|---|
| page base | `#0B1512` | — |
| panel | `#101E18` @ 92% | — |
| panel border | `#2E6B4C` | — |
| text primary | `#F2F7F3` | 15.7:1 ✔ AAA |
| text secondary | `#B7C8BC` | 8.3:1 ✔ AAA |
| accent / perfect | `#7DFFB3` | 13.7:1 ✔ AAA |
| early / late | `#FFC64D` | 11.2:1 ✔ AAA |
| miss | `#FF7A7A` | 6.9:1 ✔ AA |
| primary button | bg `#4DE59A`, label `#07130D` | 9.1:1 ✔ AAA |

Current `--bad: #ff8f8f` and `--warn: #ffd27a` already pass; the change is to darken the
page base and warm the amber so the three states separate at a glance on a phone.

---

## 3. Sky & environment

**Gradient dome** — replace `<color attach="background">` with an inward-facing
`sphereGeometry(900, 24, 16)`, `side: BackSide`, `depthWrite: false`, `fog: false`,
`MeshBasicMaterial` with a 4 × 256 canvas gradient texture (three stops above),
`ClampToEdgeWrapping`. Cost: 1 draw call, ~2 KB VRAM, 0 KB download. Keep
`<fog args={[ '#DCEEFB', 340, 1200 ]}>` so the wall and hills sit back. Do **not** use
drei `<Sky>` (Preetham shader, atmospheric and desaturated — wrong mood, and it pulls in
a shader chunk for no gain).

**Clouds** — 5 flat billboards, `planeGeometry(70, 30)`, `transparent`, `depthWrite: false`,
one shared 256 × 128 canvas texture (three overlapping soft white discs with a
`#D6E7F7` underside band). Place at fixed positions, y = 120–190, z = -450 to -700, and
drift with `x = x0 + sin(now/1000 * 0.03 + i) * 12` — deterministic, seek-safe. Never
above z > -300 so they cannot crowd the ball's flight path.

**Backdrop** — two hill bands as arcs of a large cylinder at r = 900 (`#4E7A5C` front,
`#3F6A55` back, heights 55 / 80 ft), plus a **bleacher ring**: an extruded arc behind the
wall from -60° to +60°, inner r = fence + 25 ft, 26 ft tall, tilted 22°, textured with a
256 × 128 canvas of horizontal seat rows plus a hashed crowd speckle
(`hash(i) = fract(sin(i*12.9898)*43758.5)` — computed once at build, not per frame).
Cost: 3 extra draw calls, 0 KB download.

**Time of day**: mid-afternoon, sun high and slightly camera-left so the batter's shadow
falls toward first base and the ball stays lit against the sky.

---

## 4. Field

Biggest single win: **one procedurally drawn 1024 × 1024 "field map"** that replaces the
stack of tinted circles in `Field.tsx`. Draw it in a `useMemo` on an `OffscreenCanvas`
(fallback `document.createElement('canvas')`) in polar coordinates centred on the plate,
then map it to a single `planeGeometry(900, 900)` positioned so the plate lands at the
texture centre (`position=[0, -0.02, -330]`, plane spans 450 ft each way). ~6 ms one-time
cost, 0 KB download, and it kills 5 draw calls.

What the canvas contains, centre-outward (texture px = 0.879 ft at 1024 px / 900 ft):

- **Mowing stripes**: 24 angular wedges of 7.5° alternating `#5FB04A` / `#4A9139`, fanned
  from the plate — the classic outfield fan cut. Add a second, subtler set of 6 concentric
  rings (`multiply` at 4% alpha) to break up the wedges in the outfield.
- **Infield clay**: filled circle r = 95 ft in `#C08B55`, edge softened with a 3-ft
  radial-gradient feather (alpha 1 → 0) so it never shows a polygonal rim.
- **Infield grass diamond**: grass-coloured shape inset 13 ft from the base paths,
  corners at the three bases — this is what makes it read as a real skinned infield
  instead of a brown disc.
- **Base paths**: 6-ft-wide `#A87145` bands from plate → 1B (`+X` at 45°, 90 ft) → 2B
  (dead center, 127.3 ft) → 3B → plate.
- **Chalk**: foul lines 4 in (0.33 ft) wide `#FBFBF6` out to 330 ft; batter's boxes
  4 ft × 6 ft centred at x = ±2.83, z = +0.5, 3-in line; catcher's box 43 in × 8 ft;
  two **on-deck circles** r = 5 ft at (±26, 18) in clay `#A87145`; coach's boxes optional.
- **Warning track**: 15-ft-wide `#B57D4A` band immediately inside the wall arc, with a
  1.5-ft feather on the grass side.

Keep as real geometry (they need height or must sit above the map):

| thing | geometry | position |
|---|---|---|
| mound | `cylinderGeometry(9, 10, 0.83, 32)` | `[0, 0.41, -60.5]`, clay `#A87145`, plus a 1 ft × 0.5 ft rubber plate in `#FBFBF6` |
| plate | existing `Shape` | y = 0.03, `#FBFBF6` |
| bases | `boxGeometry(1.25, 0.25, 1.25)` ×3 | 1B `[63.6, 0.12, -63.6]`, 2B `[0, 0.12, -127.3]`, 3B `[-63.6, 0.12, -63.6]` |
| outfield wall | existing arc buffer, but **two stacked bands**: 0–6.5 ft `#1F6B4B`, 6.5–8 ft `#F5D547` top rail; add a 0–1.2 ft `#14503A` kick strip | raise `FENCE_HEIGHT` to 10 ft so it reads from the camera |
| distance markers | `planeGeometry(13, 7)`, 256 × 128 canvas text, `#FBFBF6` on transparent | "330" at ±45° (2 ft above the kick strip), "375" at ±22°, "400" at 0° |
| foul poles | `cylinderGeometry(0.5, 0.5, 34, 8)` + a 6 ft × 0.2 ft screen fin | at the 330 ft foul-line ends, `#F5D547` |

A 10-ft wall at 330–400 ft subtends ~1.6° at the camera — that is the single reason the
park currently looks empty. The wall + bleachers + hills together give the three
overlapping depth planes the shot is missing.

Optional upgrade: tile a real turf normal/albedo over the grass — ambientCG **Grass004**
1K JPG (CC0, https://ambientcg.com/view?id=Grass004, ~190 KB) at `repeat(60, 60)`,
multiplied under the stripe map. Only worth it after Tier 2; the stripes carry the look.

---

## 5. Characters

**Keep RobotExpressive.** It is 450 KB already downloaded, flat-shaded (matches the art
direction), and — decisively — it has `Idle`, `Punch`, `Wave`, `ThumbsUp`, `Jump` clips
that `GlbFigure` already resolves by regex. Swapping to a Quaternius humanoid
(e.g. *Ultimate Modular Men* pack, CC0, https://quaternius.com/packs/ultimatemodularmen.html)
costs another ~500 KB, a new retarget, and loses the working `/punch/i` swing clip. Not worth it.
Instead, dress the robot — three small meshes turn it from "engine placeholder" into "ballplayer":

1. **Cap / helmet** — hemisphere `sphereGeometry(0.45, 16, 8, 0, 2π, 0, π/2)` plus a brim
   from `cylinderGeometry(0.46, 0.46, 0.08, 16, 1, false, 0, π)` scaled `[1, 1, 1.5]`.
   Batter gets a helmet (add a 0.2 ft ear flap box on the catcher side), pitcher gets a cap.
   Parent it to the head bone if one is findable by name, else to the figure group at
   `y = FIGURE_HEIGHT * 0.95`.
2. **Jersey tint** — already supported: pass `tint="#E8ECF2"` for the batter (currently
   untinted, so it reads as a grey-yellow robot) and `#C4403F` for the pitcher, and lower
   the lerp from `0.65` to `0.8` so the team colour dominates. Add a chest number plane
   (128 × 128 canvas "9" / "24") at `z = +0.5, y = 0.62·h`, 0.9 ft square.
3. **Bat** — replace the single tapered cylinder with barrel
   `cylinderGeometry(0.22, 0.14, 2.3, 10)` in `#D9A25C` + handle
   `cylinderGeometry(0.1, 0.09, 0.9, 8)` in `#8A5A32`, and a 0.12 ft knob sphere. Give the
   barrel `MeshStandardMaterial { roughness: 0.45, metalness: 0 }` and a 32 × 256 canvas
   gradient (light `#E6B878` → dark `#B07C3F`) so it catches the sun along its length.
4. **Shadows** — see §7. Feet-on-ground contact is the other half of "not a placeholder".

**Motion**: pitcher wind-up — on `releaseAtMs`, cross-fade `Idle` → `Punch` at
`timeScale 0.9` starting at `releaseAtMs - 260 ms` (the snapshot exposes `startedAtMs`, so
the lean can lead the release deterministically), keeping the existing rotational lean but
reducing it to `rotation.x = 0.20·k`. Batter idle sway — `rotation.z = sin(now/1000 * 1.1) * 0.035`
and `position.y = sin(now/1000 * 2.2) * 0.04` while `phase !== 'result'`; freeze it during
the 180 ms swing so the swing keeps all the energy. On a `perfect` result, fire `ThumbsUp`
at `resolvedAtMs + 400 ms`; on `miss`, no clip (stillness reads as a whiff).

---

## 6. Ball & timing readability

- **Size/outline**: keep r = 0.36 ft but add a **cartoon outline shell** —
  `sphereGeometry(0.42, 14, 10)`, `MeshBasicMaterial { color: '#12212B', side: BackSide }`.
  One extra draw call, and the ball stays legible over both the pale sky and the green
  outfield, which is currently its worst crossing. Raise `emissiveIntensity` to `0.5`
  and add two seam arcs as a 128 × 128 canvas (`#D8443C` on `#FCFCF7`) so spin is
  suggested without a spin animation.
- **Scale cue**: `scale = 1 + 0.28 * pitchT` during the pitch. Perspective alone under a
  34° FOV under-sells the approach; a subtle over-scale near the plate is the standard
  Wii Sports cheat and costs nothing.
- **Trail**: 8 fading spheres (one `InstancedMesh`, `MeshBasicMaterial`, additive,
  `depthWrite: false`). Each frame, sample `ballPose(snapshot, now - i * 26)` for
  `i = 0..7`; `opacity = 0.40 * (1 - i/8)`, `scale = 0.36 * 0.88^i`. `ballPose` is already
  pure, so this is exactly seek-safe and costs one instanced draw call. Reuse the same
  instance buffer for the post-contact hit arc (there the step becomes 45 ms for a longer
  ribbon).
- **Timing ring**: keep the shrinking ring but make it a three-state read.
  - Outer shrinking ring: `ringGeometry(0.86, 1.0, 40)` scaled `3.4 → 0.95` over `pitchT`,
    facing the camera (`lookAt` camera once at mount — the plate-facing plane is fine here).
    Colour lerps `#7FD7FF` (t < 0.80) → `#FFC64D` (0.80–0.96), opacity `0.45 → 0.85`.
  - Static **perfect zone**: a second ring at fixed radius `0.95` ft, `#7DFFB3`, opacity
    `0.35`, plus an additive glow quad (256 px soft-disc canvas) whose opacity ramps
    `0 → 0.7` across `t ∈ [0.90, 1.0]` and snaps to `0` after. The shrinking ring landing
    *inside* the glow is the "now" signal; that is a much stronger cue than the current
    lone amber circle.
  - Line weight scales with viewport: `ringGeometry` inner radius `0.82` on ≥ 900 px wide,
    `0.74` below (thicker line on phones).
- **Contact burst**: on `lastResult.commit != null`, for 240 ms from `commit.atMs`:
  a **star flash** billboard (256 × 256 canvas, 8-point star, additive) scaling
  `0.6 → 7 ft` with opacity `1 → 0` on `1 - t²`; plus 10 radial chevrons from one
  `InstancedMesh` of `boxGeometry(0.12, 0.12, 1.6)`, angles from `hash(pitchIndex, i)`,
  travelling 1.5 → 5 ft. No particle system, no `Math.random`.
- **Landing puff**: soft-disc billboard (reuse the glow canvas) at the landing XZ, from
  `resolvedAtMs + flightMs` for 420 ms, scale `1 → 9 ft`, opacity `0.55 → 0`, colour
  `#E0C79A` on clay, `#CFE6B8` on grass (pick by `distanceFt`).
- **Home run** (total ≤ 1200 ms, all offsets from `resolvedAtMs`):
  0 ms wall-emissive flash on the padding material (`#F5D547`, emissiveIntensity `0 → 0.9 → 0`
  over 420 ms) · 200/380/560 ms three additive firework billboards at fixed positions
  above the wall (`[-90, 70, -390]`, `[10, 95, -405]`, `[95, 65, -380]`), each a 520 ms
  `0.5 → 14 ft` scale with opacity `1 → 0` · 120 ms camera nudge, see §8. Stagger is
  fixed, not random, so replays match.

---

## 7. Lighting & shadows

```
ambientLight        intensity 0.35
hemisphereLight     sky '#9FD0F5', ground '#4A8F3C', intensity 0.90
directionalLight    position [-120, 180, 90], color '#FFF6E0', intensity 2.10, castShadow
```

The current `ambient 1.9 + hemi 1.1 + dir 1.6` is why everything looks like a flat-colour
swatch — total ambient is doing the work. Shift the ratio so the directional carries the
form, then convert the field/figure materials from `MeshLambertMaterial` to
`MeshStandardMaterial { roughness: 0.85, metalness: 0 }` (no cost change worth measuring at
this poly count; keeps `MeshBasicMaterial` for chalk, rings and billboards).

Shadows: enable `shadows` on `<Canvas>` with `shadow-mapSize={[1024, 1024]}` and a **tight**
ortho frustum around the action only — `left/right ±34`, `top/bottom ±34`, `near 40`,
`far 260`, `bias -0.0006`, `normalBias 0.02`. Only the batter, bat, pitcher and mound
`castShadow`; only the field plane `receiveShadow`. A 1024 map over a 68-ft box gives
~15 px/ft — plenty for a stylized blob. Keep `shadow.autoUpdate = true` but set
`shadow.needsUpdate` manually only while `running` if you see cost on integrated GPUs.

If that measures badly on a phone, fall back to a **baked contact blob**: a 128 × 128
radial-gradient alpha canvas on a `planeGeometry(5, 3)` at `y = 0.04` under each figure,
`opacity 0.42`, rotated to the sun direction. Prefer this over drei `<ContactShadows>`,
which needs `frames={Infinity}` for animated figures and then costs a depth re-render
every frame.

Renderer: `gl={{ antialias: true, powerPreference: 'high-performance' }}`, plus
`onCreated`: `gl.toneMapping = ACESFilmicToneMapping`, `gl.toneMappingExposure = 1.05`.
Raise `dpr` to `[1, 1.75]` on desktop (`window.devicePixelRatio > 1 && innerWidth > 900`),
keep `[1, 1.5]` otherwise — the chalk lines alias badly at 1.5.

---

## 8. Camera & composition

Current `pos [2.4, 12.5, 29.5]` / `target [-0.2, 5.2, -42]` / FOV 36 puts the batter's head
at the bottom edge and wastes the top 40% on empty sky. Change to:

```
FOV 34
position [1.9,  9.6, 24.0]
target   [-0.1, 4.4, -58.0]
```

This drops the horizon to ~38% screen height (batter's helmet near the lower third, mound
and pitcher on the upper third, wall visible along the top third), and the ball's flight
path crosses the frame diagonally instead of sitting in a dead centre band.

Deterministic motion, all from `performance.now()`:

- **Idle drift** (always): `x += sin(now/1000 * 0.11) * 0.22`, `y += sin(now/1000 * 0.083 + 1.7) * 0.16`.
- **Pitch push-in**: during `phase === 'pitching'`, ease `fov 34 → 32.2` and
  `z 24.0 → 22.6` over `t ∈ [0.55, 1.0]` with `smoothstep`. Subtle tension, and it makes
  the ball larger exactly when timing matters.
- **Contact kick**: for 120 ms from `commit.atMs`, offset `y` by
  `sin(π·k) * 0.35` and roll `camera.rotation.z` by `sin(π·k) * 0.008`. Cap at 0.35 ft —
  above that the ball becomes harder to read, violating the readability rule.
- **Home run nudge**: from `resolvedAtMs`, ease `target.y 4.4 → 9.0` and `fov 34 → 37`
  over 400 ms, hold to `flightMs - 300`, ease back over 300 ms — follows the arc without a
  camera controller.
- Gate the kick and nudge behind `matchMedia('(prefers-reduced-motion: reduce)')`; keep
  the push-in (it is informational).

---

## 9. UI / HUD

**Typography** — self-hosted, latin subset, `font-display: swap`:
- Headlines / flash / score: **Archivo Black** 400 (OFL 1.1, https://fonts.google.com/specimen/Archivo+Black),
  latin subset woff2 ≈ 16 KB. Sports-poster weight, wide apertures, reads at 2 rem on a phone.
- Body / HUD: **Outfit** variable 300–700 (OFL 1.1, https://fonts.google.com/specimen/Outfit),
  latin subset woff2 ≈ 30 KB. Geometric, tabular-friendly.
- Stack: `font-family: Outfit, 'Segoe UI', system-ui, sans-serif`. Total ≈ 46 KB. If you
  want zero download, the procedural fallback is the existing system stack with
  `letter-spacing: 0.02em` and `font-weight: 800` on headlines — acceptable but generic.

**HUD** — move it *onto* the stage as an overlay instead of a row above it, so the 16:9
frame is the whole product:
- Pitch dots → 10 pills, 0.55 rem × 0.55 rem, `gap 0.28rem`, top-left inside the stage on a
  `rgb(11 21 18 / 55%)` pill with `backdrop-filter: blur(6px)`, 999 px radius. Filled states
  use the palette above; the live dot gets a 2 px `#FFC64D` ring and a 900 ms breathe (no
  box-shadow animation — animate `outline-color` alpha, cheaper).
- Score top-right, `Archivo Black`, 1.6 rem, `font-variant-numeric: tabular-nums`, with the
  existing `score-bump` keyframe retimed to 320 ms and `scale(1.28)`.
- Add a thin **swing meter** at the bottom centre of the stage: a 180 px × 6 px track with a
  `#7DFFB3` segment marking the ±50 ms perfect window (7.7% of the track) and a marker
  that sweeps left→right over `PITCH_FLIGHT_MS`. This is the single highest-value
  readability addition for new players and duplicates the 3D ring in 2D.

**Flash typography** — headline at `clamp(2.4rem, 8vw, 4.6rem)`, Archivo Black,
`letter-spacing 0.02em`, `-webkit-text-stroke: 3px rgb(7 19 13 / 85%)` so it survives over
the sky, plus `text-shadow: 0 6px 0 rgb(7 19 13 / 35%)` for a hard toy-poster offset.
Motion: `0% scale(0.72) rotate(-3deg)` → `14% scale(1.10) rotate(1deg)` →
`26% scale(1.0) rotate(0)` → hold to 68% → `100% opacity 0, scale(1.04)`, total 860 ms with
`cubic-bezier(.16,1.02,.3,1)`. On `perfect`, add a one-shot radial `#7DFFB3` 12%-alpha wash
over the stage, 300 ms.

**Start / end cards** — keep the centred card but restyle: `border-radius 18px`,
`border: 2px solid #2E6B4C`, `background: linear-gradient(180deg, rgb(16 30 24 / 94%), rgb(11 21 18 / 94%))`,
`box-shadow: 0 18px 60px rgb(0 0 0 / 55%), inset 0 1px 0 rgb(255 255 255 / 8%)`. Add a
1.6 rem Archivo Black title and a 0.8-rem uppercase eyebrow ("BATTING PRACTICE"). Primary
button: `#4DE599` bg, `#07130D` label, `border-radius 999px`, `padding .8rem 1.6rem`,
`box-shadow 0 4px 0 #2FA972` and `:active { transform: translateY(2px); box-shadow: none }`
— a physical toy press.

**Overlays** — inside `.stage`, two `pointer-events: none` layers: a vignette
(`radial-gradient(ellipse at 50% 42%, transparent 55%, rgb(4 10 8 / 34%) 100%)`) and a
grain (single 128 × 128 tiled PNG or an inline SVG `feTurbulence`, `opacity .035`,
`mix-blend-mode: overlay`, ~1.5 KB). Both sell "rendered image" over "WebGL canvas".

**9:16 mobile** — below 560 px, swap the stage to `aspect-ratio: 4/5`, and pass a
portrait camera variant (`FOV 42`, `position [1.4, 8.8, 21]`) so the batter and mound both
stay in frame; move the HUD pills to a single row across the top and put the swing meter
just above the safe-area inset (`padding-bottom: env(safe-area-inset-bottom)`).

---

## 10. Prioritized implementation plan

### Tier 1 — ~2–3 h, ~80% of the visual jump. +0 KB download.
| # | change | files | bundle | acceptance check |
|---|---|---|---|---|
| 1 | Procedural 1024² field map (stripes, clay, diamond, base paths, chalk, warning track) on one plane | `Field.tsx`, `constants.ts` | 0 KB | Outfield shows a 24-wedge mow fan and the clay edge has no visible polygon rim |
| 2 | Gradient sky dome + retuned fog | `BattingScene.tsx` | 0 KB | Sky is a visible zenith→horizon gradient, no flat `#8ec5f0` band |
| 3 | Lighting rebalance (0.35 / 0.90 / 2.10), ACES + exposure 1.05, Lambert → Standard | `BattingScene.tsx`, `Field.tsx`, `StylizedFigure.tsx` | 0 KB | Mound and figures show a directional light/dark side |
| 4 | Wall to 10 ft with top rail + kick strip, foul poles, "330/375/400" canvas markers | `Field.tsx`, `constants.ts` | 0 KB | All three numbers legible at 960 px wide |
| 5 | Camera reframe + pitch push-in + idle drift | `BattingScene.tsx` | 0 KB | Horizon at ~38% height; FOV eases 34→32.2 during the pitch |
| 6 | Ball outline shell + seam texture + `1 + 0.28t` scale | `Ball.tsx` | 0 KB | Ball stays readable at every point of the flight over both sky and grass |
| 7 | Ring rework: colour states + static perfect zone + glow ramp | `Ball.tsx`, `constants.ts` | 0 KB | Ring turns green only within `t ∈ [0.962, 1.038]` |
| 8 | UI palette + Archivo Black/Outfit + card/button restyle + vignette | `App.css`, `index.css`, `+ public/fonts/*.woff2` | +46 KB | Lighthouse contrast audit clean; no FOUT flash of a different size |

### Tier 2 — ~3–4 h. +0–20 KB.
| # | change | files | bundle | acceptance check |
|---|---|---|---|---|
| 9 | Directional shadow (1024, tight frustum) on figures/mound | `BattingScene.tsx`, `Batter.tsx`, `Pitcher.tsx`, `Field.tsx` | 0 KB | Batter has a grounded shadow; frame time under 16 ms on integrated GPU |
| 10 | Character dressing: helmet/cap mesh, jersey tint, two-part bat, chest number | `Batter.tsx`, `Pitcher.tsx`, `GlbFigure.tsx` | 0 KB | Batter reads as a white-jersey hitter, pitcher as red, at a glance |
| 11 | Ball trail + hit-arc ribbon (one `InstancedMesh`) | `Ball.tsx` | 0 KB | Seeking to any timestamp reproduces the identical trail |
| 12 | Contact burst (star + 10 hashed chevrons) and landing puff | `Ball.tsx` (new `Impact.tsx`) | +2 KB | Burst fires within 1 frame of `commit.atMs`, gone by +240 ms |
| 13 | Bleacher ring + hill bands + cloud billboards | `Field.tsx` (new `Backdrop.tsx`) | 0 KB | Three distinct depth planes behind the wall |
| 14 | HUD overlay move + swing meter + flash retype/motion | `App.tsx`, `App.css` | +1 KB | New player can hit `perfect` inside 3 pitches using the meter alone |
| 15 | Batter idle sway, pitcher lead-in wind-up, `ThumbsUp` on perfect | `Batter.tsx`, `Pitcher.tsx`, `GlbFigure.tsx` | 0 KB | Nobody is ever a frozen T-pose statue |

### Tier 3 — polish. +30 KB (or 0 with fallbacks).
| # | change | files | bundle | acceptance check |
|---|---|---|---|---|
| 16 | Home run celebration: wall flash, 3 fireworks, camera nudge | `BattingScene.tsx`, `Field.tsx` | +1 KB | Entire sequence ≤ 1200 ms, identical on replay |
| 17 | `@react-three/postprocessing` bloom — `intensity .55`, `luminanceThreshold .78`, `mipmapBlur`, `KernelSize.SMALL` | `BattingScene.tsx`, `package.json` | **+28 KB gz** | Off when `dpr < 1.25` or `innerWidth < 760`; ≥ 55 fps on integrated GPU with it on |
| 18 | Optional turf albedo tile (ambientCG Grass004) multiplied under the stripes | `Field.tsx`, `public/textures/` | +190 KB | Turf reads as grass, not paint, at the batter's feet |
| 19 | Grain overlay + 4:5 portrait camera variant | `App.css`, `BattingScene.tsx` | +1.5 KB | Portrait phone shows batter and mound simultaneously |

**Bloom cost flag**: one extra full-screen pass at `dpr 1.75` on a 960 px stage is ~1.6 MP
of mip-blur per frame — measurable (2–4 ms) on Intel Iris. It only buys the ball glow and
the perfect-zone glow, both of which the additive billboards in §6 already approximate. Ship
it last, behind a capability check, and skip it entirely if item 12 already sells the hit.

Total added download, Tier 1 + 2 + all of Tier 3 with the optional turf: **≈ 270 KB** —
well inside the 1.5 MB budget.

---

## 11. Asset list

| asset | source / URL | license | size | procedural fallback |
|---|---|---|---|---|
| Archivo Black 400, latin subset woff2 | https://fonts.google.com/specimen/Archivo+Black (self-host, do not hotlink) | OFL 1.1 | ~16 KB | `font-weight: 800` on the system stack |
| Outfit variable 300–700, latin subset woff2 | https://fonts.google.com/specimen/Outfit | OFL 1.1 | ~30 KB | `'Segoe UI', system-ui, sans-serif` |
| RobotExpressive GLB (already shipped) | Quaternius / Tomás Laulhé, mod. Don McCurdy — `public/models/batter.glb` | CC0 1.0 | 450 KB | `StylizedFigure` primitives (exists) |
| Grass004 albedo 1K JPG *(optional, Tier 3)* | https://ambientcg.com/view?id=Grass004 | CC0 1.0 | ~190 KB | canvas stripe map alone (item 1) |
| Ultimate Modular Men *(evaluated, not recommended)* | https://quaternius.com/packs/ultimatemodularmen.html | CC0 1.0 | ~500 KB | keep RobotExpressive + §5 dressing |
| Grain tile 128² PNG *(optional)* | generate locally, or inline SVG `feTurbulence` | n/a (self-made) | ~1.5 KB | inline SVG filter, 0 KB |
| Field map 1024², sky gradient 4×256, cloud 256×128, bleacher 256×128, star 256², soft disc 256², ball seam 128², bat gradient 32×256, distance-marker 256×128, shadow blob 128² | all generated at runtime on `<canvas>` | n/a (self-made) | — (these *are* the fallbacks) |

No HDRI is recommended: even a 1K `.hdr` from Poly Haven (e.g.
https://polyhaven.com/a/kloppenheim_02_puresky, CC0) is 1–2 MB and would push a
photographic sky into a deliberately non-photoreal look. The hemisphere light plus the
gradient dome give the same ambient read for 0 KB.
