# CamSport

Wii Sports–inspired **baseball batting** mini-game (timing). Stage 1 uses pointer/keyboard; Stage 2 will add webcam via the same input adapter.

## Docs

- [Game analysis](docs/game-analysis.md) — why batting (complexity / credit cost)
- [Tech stack](docs/tech-stack.md) — Vite + React + GitHub Pages, webcam-ready architecture

## Develop

```bash
npm install
npm run dev
```

Click / Space to swing once a round is started.

## Build & preview

```bash
npm run build
npm run preview
```

## Deploy (GitHub Pages)

1. Repo **Settings → Pages → Source: GitHub Actions**
2. Push to `main` (or run the **Deploy GitHub Pages** workflow manually)
3. Site: `https://SoundGuyAI.github.io/CamSportPage/`

Vite `base` is `/CamSportPage/`. Deploy remote: `pages` → [SoundGuyAI/CamSportPage](https://github.com/SoundGuyAI/CamSportPage). No auth, no backend in Stage 1.

## Input mode

- Default / Stage 1: pointer + keyboard (`PointerInput`)
- Stage 2: set `VITE_INPUT_MODE=pose` and implement `PoseInput` (MediaPipe stub is already wired)
