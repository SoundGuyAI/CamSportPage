# CamSport

Wii Sports–inspired **baseball batting** mini-game (pure timing), built with React 19, Vite 8 and Three.js / React Three Fiber. Stage 1 uses pointer + keyboard; Stage 2 will add webcam pose input behind the same adapter.

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
node --experimental-strip-types scripts/check-game.ts   # headless game-loop smoke test
npm run preview
```

`scripts/check-game.ts` drives `GameSession` with a fake clock and a fake `InputPort` and asserts the phase sequence, grading bands and scoring — no DOM, no browser.

## Architecture

Three layers, one-way data flow:

| Layer | Path | Responsibility |
|---|---|---|
| Input | `src/input/` | `InputPort` adapter (`start` / `stop` / `onCommit`) emitting `SwingCommit { atMs, source }`. `PointerInput` = window `pointerdown` + `Space`/`Enter`; `PoseInput` is the Stage 2 stub. |
| Game | `src/game/` | `GameSession` owns the loop (pre-pitch delay → pitch → grade → result hold → next). Pure logic: no DOM, no camera, no `Math.random`, time via an injectable `Scheduler`. Publishes an immutable `SessionSnapshot` (contract in `src/game/types.ts`). |
| Presentation | `src/scene/`, `src/App.tsx` | Consume `SessionSnapshot` only. All ball / bat motion is derived from snapshot timestamps against `performance.now()` — no physics engine, no imperative tweens. See [`src/scene/demo.md`](src/scene/demo.md). |

`App.tsx` builds a fresh `GameSession(createInput(), 10)` per round and tears the old one down (unsubscribe **then** stop) before starting the next, and on unmount — a shared input would otherwise be deactivated by the old session's `stop()`, and the old session's final emit would clobber the new snapshot.

Outcomes are scripted and deterministic (`src/game/outcome.ts`): variance comes from an integer hash of the pitch index, so replays and tests are stable.

## Deploy (GitHub Pages)

1. Repo **Settings → Pages → Source: GitHub Actions**
2. Push to `main` (or run the **Deploy GitHub Pages** workflow manually)
3. Site: `https://SoundGuyAI.github.io/CamSportPage/`

Vite `base` is `/CamSportPage/`, so all asset URLs go through `import.meta.env.BASE_URL`. Deploy remote: `pages` → [SoundGuyAI/CamSportPage](https://github.com/SoundGuyAI/CamSportPage). No auth, no backend.

## Input mode

- Default / Stage 1: pointer + keyboard (`PointerInput`)
- Stage 2: set `VITE_INPUT_MODE=pose` and implement `PoseInput` (MediaPipe stub is already wired)

## Credits

3D model: **"RobotExpressive"** by [Tomás Laulhé (Quaternius)](https://www.patreon.com/quaternius), modified by Don McCurdy — [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), from [three.js examples](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/RobotExpressive). CC0 requires no attribution; the credit in the app footer is voluntary. Full details: [`public/models/LICENSES.md`](public/models/LICENSES.md).

## Docs

- [Game analysis](docs/game-analysis.md) — why batting (complexity / credit cost)
- [Tech stack](docs/tech-stack.md) — Vite + React + GitHub Pages, webcam-ready architecture
