# CamSport — Tech Stack

**Game:** Baseball batting-only (timing) — see [game-analysis.md](./game-analysis.md)  
**Hosting:** GitHub Pages (Cloudflare later)  
**Auth:** none for now  
**Webcam:** Stage 2 **shipped** — frame-difference motion input, no ML model, no new dependencies  

---

## Stack

| Layer | Choice | Notes |
|-------|--------|--------|
| Language | TypeScript | Shared types for game + input |
| UI shell | React 18 + Vite | Menus, HUD, score, round flow |
| Game canvas | Canvas 2D (or lightweight DOM/CSS) | Enough for pitch lane + ball; avoid Three.js until needed |
| Build | Vite | `base` set for GitHub Pages project URL |
| Hosting | **GitHub Pages** | Static SPA via GitHub Actions |
| Backend | **None (Stage 1)** | Scores stay in-session / `localStorage` only |
| Auth | **Skipped** | Revisit with Cloudflare/Supabase later |
| Webcam (Stage 2, shipped) | **Frame differencing** (canvas 2D, 64x48 grayscale diff) | No model, no dependency, no server; feeds the existing `InputPort` |
| Webcam (optional future) | MediaPipe Pose (browser) | Only if per-joint tracking is ever needed; same adapter seam |

**Explicitly deferred:** Unity WebGL, Cloudflare Workers/D1, Clerk/Supabase Auth, physics engines, online multiplayer.

---

## Architecture (webcam-ready)

Stage 1 and Stage 2 share one game core. Only the input source changes.

```
┌─────────────────────────────────────────────┐
│  React (menus, HUD, score, round state)     │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  GameSession                                    │
│  pitch → wait commit → grade timing → result    │
└──────────────────┬──────────────────────────┘
                   │ listens for SwingCommit
┌──────────────────▼──────────────────────────┐
│  InputPort (interface)                        │
│  onCommit(cb) / start() / stop()              │
├─────────────┬───────────────────────────────┤
│ PointerInput  │  click / space                │
│ CameraInput   │  webcam frame differencing     │
│ CompositeInput│  fan-out (camera + pointer)    │
│ PoseInput     │  stub (optional MediaPipe)     │
└───────────────┴───────────────────────────────┘
```

### Input contract (lock early)

```ts
/** Fired when the player commits a swing. */
export type SwingCommit = {
  /** performance.now() or game clock ms when the swing was detected */
  atMs: number
  /** Optional metadata; Stage 1 may omit or stub these */
  source: 'pointer' | 'keyboard' | 'camera' | 'pose'
  /** Stage 2: normalized swing strength 0–1; Stage 1 can pass 1 */
  power?: number
}

export interface InputPort {
  start(): void
  stop(): void
  onCommit(handler: (commit: SwingCommit) => void): () => void // unsubscribe
}
```

**Rule:** `GameSession` never reads `window`, DOM events, or the camera. It only consumes `SwingCommit` and grades against the pitch’s ideal contact time.

### Timing grade (Stage 1)

```ts
type TimingBand = 'perfect' | 'early' | 'late' | 'miss'

function gradeSwing(commitAtMs: number, contactAtMs: number, windows: TimingWindows): TimingBand
```

Hit quality → scripted arc + distance points. No ball physics solver.

---

## Repo layout (target)

```
CamSport/
├── docs/
│   ├── game-analysis.md
│   └── tech-stack.md
├── .github/workflows/deploy-pages.yml
├── public/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── game/
│   │   ├── GameSession.ts
│   │   ├── timing.ts
│   │   └── scoring.ts
│   ├── input/
│   │   ├── types.ts           # InputPort, SwingCommit
│   │   ├── PointerInput.ts    # click / Space
│   │   ├── CameraInput.ts     # Stage 2: webcam frame differencing (no ML)
│   │   ├── CompositeInput.ts  # camera + pointer fan-out
│   │   ├── createInput.ts     # mode factory
│   │   └── PoseInput.ts       # stub (optional MediaPipe later)
│   ├── ui/
│   └── styles/
├── index.html
├── package.json
├── vite.config.ts
└── README.md
```

---

## GitHub Pages deployment

### Requirements

1. Vite `base` = `/CamSportPage/` (Pages repo: [SoundGuyAI/CamSportPage](https://github.com/SoundGuyAI/CamSportPage)).  
2. Build output = `dist/`.  
3. GitHub Actions workflow: build on `main` → upload artifact → deploy to Pages.  
4. On **CamSportPage**: Settings → Pages → Source: **GitHub Actions**.

### Local commands

```bash
npm install
npm run dev      # local
npm run build    # writes dist/
npm run preview  # smoke-test production build
```

### Workflow behavior

- Trigger: push to `main` (and manual `workflow_dispatch`)  
- Node LTS → `npm ci` → `npm run build`  
- Deploy `dist` with `actions/deploy-pages`  
- Site URL: `https://SoundGuyAI.github.io/CamSportPage/`

No secrets required for public Pages. No auth, no API keys in Stage 1.

---

## Stage 1 vs Stage 2

| | Stage 1 | Stage 2 (shipped) |
|--|---------------|-----------------|
| Input | `PointerInput` (+ keyboard) | `CompositeInput([PointerInput, CameraInput])` behind the same `InputPort` |
| Hosting | GitHub Pages | Still fine on Pages; detection is 100% client-side |
| Backend | None | Still none |
| Auth | None | Optional later |
| Default flag | `VITE_INPUT_MODE=pointer` | `VITE_INPUT_MODE=camera` (the UI picker + `localStorage['camsport.inputMode']` wins at runtime) |

### Stage 2 detector (no ML)

`src/input/CameraInput.ts`, modelled on the air-guitar-hero and "Maestro" frame-difference demos:

- mirrored video → **64x48** canvas (`willReadFrequently: true`) → grayscale `(r*77 + g*151 + b*28) >> 8`
- count pixels with `|Δ| > pixThreshold`, divide by pixel count → motion energy 0..1
- top ~15% of rows skipped (head); full width is **one** zone (a swing is a big lateral burst)
- `emaFast` (α 0.55) / `emaSlow` (α 0.05); commit on **onset**:
  `armed && emaFast > onsetThresh && rise > riseMin && emaFast > emaSlow * 1.55 && now - lastFire > 250 ms`,
  then disarm until `emaFast < onsetThresh * 0.55`; 400 ms guard after `start()`
- sensitivity 0..1 (default 0.6, `localStorage['camsport.sensitivity']`) →
  `pixThreshold = round(38 - 26s)`, `onsetThresh = 0.14 - 0.105s`, `riseMin = onsetThresh * 0.35`
- `requestVideoFrameCallback` (else `requestAnimationFrame`), preallocated swapped `Uint8Array`s
- stream kept alive across `stop()/start()` (GameSession restarts input every round); `dispose()` releases the camera
- privacy: frames never leave the browser; nothing is uploaded or recorded

`PoseInput.ts` remains a **stub**. MediaPipe Pose stays an *optional future adapter* behind the very same `InputPort` — worth it only if we ever need per-joint data (bat angle, handedness); the frame-difference detector covers "swing now" with zero bundle cost. `scripts/check-camera.ts` drives the detector headlessly through its `frameSource` seam.

---

## Why this stack (credit cost)

- **No physics engine** → fewer tune loops  
- **No 3D unless needed** → smaller bundle and less agent thrash  
- **No backend/auth** → no env/secret/deploy coupling  
- **GitHub Pages** → free static hosting already in the repo  
- **InputPort** → webcam later without rewriting `GameSession`  

---

## Out of scope (do not add in Stage 1)

- Cloudflare Workers / D1 / Pages migration  
- Leaderboards, accounts, OAuth  
- Real pin/ball rigid-body physics  
- Unity / WebGL  
- Multiplayer networking  
