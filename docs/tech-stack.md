# CamSport — Tech Stack

**Game:** Baseball batting-only (timing) — see [game-analysis.md](./game-analysis.md)  
**Hosting:** GitHub Pages (Cloudflare later)  
**Auth:** none for now  
**Webcam:** Stage 2 only — architecture prepared in Stage 1  

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
| Webcam (Stage 2) | MediaPipe Pose (browser) | No server; feeds existing input adapter |

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
│ PointerInput│  (Stage 1: click / space)       │
│ PoseInput   │  (Stage 2: MediaPipe swing)     │
└─────────────┴───────────────────────────────┘
```

### Input contract (lock early)

```ts
/** Fired when the player commits a swing. */
export type SwingCommit = {
  /** performance.now() or game clock ms when the swing was detected */
  atMs: number
  /** Optional metadata; Stage 1 may omit or stub these */
  source: 'pointer' | 'keyboard' | 'pose'
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
│   │   ├── types.ts          # InputPort, SwingCommit
│   │   ├── PointerInput.ts   # Stage 1
│   │   └── PoseInput.ts      # Stage 2 stub (throws / no-op until enabled)
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

| | Stage 1 (now) | Stage 2 (later) |
|--|---------------|-----------------|
| Input | `PointerInput` (+ keyboard) | `PoseInput` (MediaPipe) behind same `InputPort` |
| Hosting | GitHub Pages | Still fine on Pages; pose runs client-side |
| Backend | None | Optional Cloudflare later for scores |
| Auth | None | Optional later |
| Feature flag | `VITE_INPUT_MODE=pointer` | `VITE_INPUT_MODE=pose` |

`PoseInput.ts` ships as a **stub** in Stage 1 so the wiring path exists without pulling MediaPipe until Stage 2.

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
