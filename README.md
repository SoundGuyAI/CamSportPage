# CamSport

Wii Sports–inspired **baseball batting** mini-game (pure timing), built with React 19, Vite 8 and Three.js / React Three Fiber. Play with mouse / keyboard, or turn on **webcam mode** and swing your arm — no ML model, no extra dependencies.

## Play

Ten pitches per round. **Click or press Space (or Enter) when the ball reaches the plate.**

- Dead on the contact point → `PERFECT!` — usually a home run
- A little **early** pulls the ball to left field, a little **late** pushes it right
- Too far off (or no swing) → a miss

While a round runs the HUD shows the pitch counter, the running score (which pulses when it goes up), and a strip of ten dots that fill with each pitch's band colour. A big transient overlay calls the timing over the scene, and the result line below it is `aria-live` for screen readers. When the round ends a summary card shows the final score, perfect / early / late / miss counts and the longest fair hit.

## Develop

```bash
npm install
npm run dev
```

`.npmrc` sets `legacy-peer-deps=true`: React 19.3 is outside `@react-three/fiber`'s declared peer range, but works fine. Without it, `npm install` fails on peer resolution.

## Build, check & preview

```bash
npm run build        # tsc -b && vite build
npm run lint         # oxlint
npx tsc -p tsconfig.app.json --noEmit
node --experimental-strip-types scripts/check-game.ts     # headless game-loop smoke test
node --experimental-strip-types scripts/check-camera.ts  # headless webcam-detector test
npm run preview
```

`scripts/check-game.ts` drives `GameSession` with a fake clock and a fake `InputPort` and asserts the phase sequence, grading bands and scoring — no DOM, no browser.

`scripts/check-camera.ts` drives `CameraInput` through its `frameSource` seam with synthetic 64x48 grayscale frames (no camera, no DOM): a static scene and head-band-only motion emit nothing, one burst emits exactly one commit, sustained motion does not emit a second, the debounce holds, quiet frames re-arm, `stop()` / `dispose()` silence it, and `CompositeInput` fans out to both children.

## Architecture

Three layers, one-way data flow:

| Layer | Path | Responsibility |
|---|---|---|
| Input | `src/input/` | `InputPort` adapters (`start` / `stop` / `onCommit`) emitting `SwingCommit { atMs, source, power? }`. `PointerInput` = window `pointerdown` + `Space`/`Enter`; `CameraInput` = webcam frame differencing; `CompositeInput` fans out to both; `PoseInput` stays a stub. |
| Game | `src/game/` | `GameSession` owns the loop (pre-pitch delay → pitch → grade → result hold → next). Pure logic: no DOM, no camera, no `Math.random`, time via an injectable `Scheduler`. Publishes an immutable `SessionSnapshot` (contract in `src/game/types.ts`). |
| Presentation | `src/scene/`, `src/App.tsx` | Consume `SessionSnapshot` only. All ball / bat motion is derived from snapshot timestamps against `performance.now()` — no physics engine, no imperative tweens. See [`src/scene/demo.md`](src/scene/demo.md). |

`App.tsx` builds a fresh `GameSession(createInput(mode, cameraRef.current), 10)` per round and tears the old one down (unsubscribe **then** stop) before starting the next, and on unmount — a shared input would otherwise be deactivated by the old session's `stop()`, and the old session's final emit would clobber the new snapshot. The `CameraInput` *is* shared and long-lived (one per webcam session, held in a ref): `stop()` only parks the detector and keeps the `MediaStream`, so re-arming between rounds costs nothing and never re-prompts; only `dispose()` releases the camera.

Outcomes are scripted and deterministic (`src/game/outcome.ts`): variance comes from an integer hash of the pitch index, so replays and tests are stable.

## Deploy (GitHub Pages)

1. Repo **Settings → Pages → Source: GitHub Actions**
2. Push to `main` (or run the **Deploy GitHub Pages** workflow manually)
3. Site: `https://SoundGuyAI.github.io/CamSportPage/`

Vite `base` is `/CamSportPage/`, so all asset URLs go through `import.meta.env.BASE_URL`. Deploy remote: `pages` → [SoundGuyAI/CamSportPage](https://github.com/SoundGuyAI/CamSportPage). No auth, no backend.

## Input modes

Pick a mode on the start card (and on the end card); the choice persists in `localStorage` under `camsport.inputMode`.

### Mouse & keyboard (default)

`PointerInput`: window `pointerdown` + `Space` / `Enter`. Always works, and **stays active in webcam mode too** — webcam mode is `CompositeInput([PointerInput, CameraInput])`, so a click or Space is still a valid swing if the camera misreads you.

### Webcam — frame differencing, no ML

`CameraInput` (`src/input/CameraInput.ts`) needs no model and no new packages:

1. The mirrored camera frame is drawn into a **64x48** canvas (`willReadFrequently: true`) and converted to grayscale (`(r*77 + g*151 + b*28) >> 8`).
2. Pixels whose absolute delta against the previous frame exceeds `pixThreshold` are counted and divided by the pixel count → **motion energy**, 0..1. The top ~15% of rows (your head) are skipped; the full width is **one** zone, because a swing is one big lateral burst.
3. Energy is smoothed with two EMAs — `emaFast` (α 0.55) and `emaSlow` (α 0.05).
4. A commit fires on the **onset**, never on sustained motion:
   `armed && emaFast > onsetThresh && (emaFast - emaPrev) > riseMin && emaFast > emaSlow * 1.55 && now - lastFire > 250 ms`.
   Firing disarms the detector; it re-arms only once `emaFast < onsetThresh * 0.55`. Onsets in the first 400 ms after `start()` are ignored (clicking "Start round" moves you in front of the lens).

Frames are processed via `requestVideoFrameCallback` (falling back to `requestAnimationFrame`) with preallocated, swapped `Uint8Array` buffers.

**Tuning.** The panel's sensitivity slider (0–100, default 60, persisted as `camsport.sensitivity`) maps to
`pixThreshold = round(38 - 26s)`, `onsetThresh = 0.14 - 0.105s`, `riseMin = onsetThresh * 0.35`.
Raise it if your swings are missed (dim room, small motion, far from the camera); lower it if the game swings on its own (busy background, moving light, pets). The panel's energy bar has a marker at `onsetThresh` — a swing should shoot well past the marker, idling should sit near zero.

**Privacy.** Frames never leave the browser: no upload, no recording, no model download. Nothing but a 64x48 pixel-diff count is computed, in a canvas that lives and dies with the page. The camera is released when you switch back to mouse & keyboard or leave the page. Webcam access needs HTTPS or `localhost`; if it is blocked or missing the game says so and keeps playing on mouse / keyboard.

### Pose (reserved)

`PoseInput` is still a stub. A MediaPipe adapter can drop in behind the same `InputPort` later (`VITE_INPUT_MODE=pose`) without touching `src/game/**`.

## Credits

3D model: **"RobotExpressive"** by [Tomás Laulhé (Quaternius)](https://www.patreon.com/quaternius), modified by Don McCurdy — [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), from [three.js examples](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/RobotExpressive). CC0 requires no attribution; the credit in the app footer is voluntary. Full details: [`public/models/LICENSES.md`](public/models/LICENSES.md).

## Docs

- [Game analysis](docs/game-analysis.md) — why batting (complexity / credit cost)
- [Tech stack](docs/tech-stack.md) — Vite + React + GitHub Pages, webcam-ready architecture
