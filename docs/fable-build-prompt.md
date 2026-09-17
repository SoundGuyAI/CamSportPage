# CamSport — Fable 5.1 build prompt

Paste into Claude Code after starting a Fable session.

## Session setup

```bash
# Fable 5.1 orchestrates; Opus builds (cheaper than Fable)
export CLAUDE_CODE_SUBAGENT_MODEL=opus
claude --model fable
# or in-session: /model fable
# optional: /effort ultracode  (turns on orchestrated workflows)
```

---

## Prompt (copy below)

## CamSport Stage 1 — build batting MVP + ship GitHub Pages

You are **Claude Fable 5.1 acting as orchestrator**. Do **not** implement everything yourself. Plan, decompose, and **delegate implementation / research / verify** to subagents and agent-team teammates pinned to **`opus`** (cheaper than Fable). Keep Fable for judgment, integration, and final sign-off only.

Force workers onto Opus:
- Prefer Agent / teammate `model: opus`
- Session env already has `CLAUDE_CODE_SUBAGENT_MODEL=opus` — do not override workers to `fable` or `inherit` unless a task truly needs Fable

### Product (frozen scope)

Ship **Wii Sports–style baseball batting-only timing game** (Stage 1). Read and obey:

- `docs/game-analysis.md`
- `docs/tech-stack.md`
- existing `src/` scaffolding (`GameSession`, `InputPort`, `PointerInput`, `PoseInput` stub, scoring/timing)

**In:**
- 10 swings / round
- 1 pitch speed
- 3 timing bands: early / perfect / late (+ miss)
- Scripted hit arc + distance / fair-foul feedback (no physics solver)
- Mouse / click + Space / keyboard via `PointerInput`
- Local in-session score only
- Webcam-ready `InputPort` / `SwingCommit` architecture; leave `PoseInput` as stub

**Out (do not build):**
- Full innings, baserunning, fielding, pitcher AI, pitch types
- Real ball physics, multiplayer, auth, leaderboards, Cloudflare, Unity
- Stage 2 MediaPipe pose (wire stub only)

### Visuals / 3D avatars (research + integrate)

Delegate a research agent to find **free / open-license 3D humanoid avatars** usable in a browser (CC0 / CC-BY / MIT / Apache). Prefer:

- Ready Player Me free assets, Mixamo + free characters, Khronos / glTF sample humans, Poly Pizza / Sketchfab CC0, or similar
- Formats: **glTF / GLB** preferred
- Document license + attribution in README

Integrate **lightweight** presentation (Three.js / React Three Fiber is OK for batter + pitcher + ball + field backdrop) **without** turning the game into a physics sim. Game logic stays timing-based; 3D is juice only. Keep bundle reasonable for GitHub Pages. If an avatar license is unclear, skip it and use a simpler stylized mesh.

### Engineering requirements

- Stack: TypeScript, React 18, Vite (already present)
- Vite `base` **must remain** `/CamSportPage/`
- Deploy target: `https://SoundGuyAI.github.io/CamSportPage/` via existing `.github/workflows/deploy-pages.yml`
- `npm run build` must succeed; `dist/` is what Pages deploys
- No secrets / no backend

### Orchestration plan (execute this)

1. **Scout (opus):** inventory repo; list what’s stubbed vs missing for a playable round.
2. **Research (opus):** shortlist 2–3 free avatar sources; pick one batter (+ optional pitcher); download or vendor under `public/` / `src/assets/` with license notes.
3. **Builder A (opus):** finish game core — pitch spawn, commit grading, scoring, round flow, HUD.
4. **Builder B (opus):** 3D/scene presentation + avatar wiring; keep `GameSession` free of DOM/camera APIs.
5. **Polish (opus):** menus, start/retry, timing feedback (“PERFECT!” / Early / Late / Miss), restrained juice.
6. **Verify (opus):** `npm ci && npm run build && npm run preview` smoke; fix asset paths under `/CamSportPage/` base.
7. **Ship:** commit on `main` (or open PR then merge if you use PRs), push so **Deploy GitHub Pages** runs. Confirm Actions green and the live URL loads the game (not a blank 404).

You (Fable) integrate results, resolve conflicts, and only stop when the **live GitHub Pages site works**.

### Definition of done

- [ ] Playable: start round → 10 pitches → click/Space swings → timing grades → score
- [ ] Free 3D avatar(s) in scene with license/attribution noted
- [ ] `npm run build` clean
- [ ] GitHub Actions Pages deploy succeeds
- [ ] `https://SoundGuyAI.github.io/CamSportPage/` loads and the game is playable

If Pages Settings → Source is not **GitHub Actions**, report that as the only remaining human step; otherwise fix code/workflow until the URL works.

Start by reading the docs + current `src/`, then spawn the scout + avatar-research agents in parallel.
