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
node --experimental-strip-types scripts/check-audio.ts   # headless sound-cue mapper test
npm run preview
```

`scripts/check-game.ts` drives `GameSession` with a fake clock and a fake `InputPort` and asserts the phase sequence, grading bands and scoring — no DOM, no browser.

`scripts/check-audio.ts` unit-tests `cuesForTransition` from `src/audio/cues.ts` with literal snapshots (no Web Audio, nothing mocked): every band / hit kind, the whoosh lead time, no double-fire when a snapshot is re-delivered, the round-end applause and bed fade, the consecutive-looking-strike boo rule, and a ten-pitch round whose per-sound cue counts are asserted.

`scripts/check-camera.ts` drives `CameraInput` through its `frameSource` seam with synthetic 64x48 grayscale frames (no camera, no DOM): a static scene and head-band-only motion emit nothing, one burst emits exactly one commit, sustained motion does not emit a second, the debounce holds, quiet frames re-arm, `stop()` / `dispose()` silence it, and `CompositeInput` fans out to both children.

## Sound

Two interchangeable backends behind one facade (`src/audio/AudioEngine.ts`), picked on the start / end card with the **Sound** segmented control, plus a **mute toggle in the header, top-right** (always visible, `aria-pressed`, inline SVG speaker icon).

| Backend | What it is |
|---|---|
| **Real samples** (default) | `public/sounds/manifest.json` + the `.ogg` files it names, fetched and `decodeAudioData`-d lazily on first enable, then cached as `AudioBuffer`s. |
| **Synth** | Pure Web Audio synthesis for every sound — no files, no network. Noise is pre-rendered into cached buffers by a seeded LCG (never `Math.random`), and every filter / envelope number is a constant, so a given sound is bit-identical every time. |

**Fallback is per sound, not per pack.** `SampleBackend` delegates to a shared `SynthBackend` instance for any id that is absent from the manifest, fails to download, or fails to decode. A missing or 404 manifest therefore degrades to *all synth*, silently — the game always has audio. The manifest URL goes through `import.meta.env.BASE_URL`, so it resolves under the GitHub Pages base.

Synth recipes, in short: bat crack = 2-8 ms bandpassed noise burst (~2.5-4 kHz) + a decaying sine "knock" at 185-250 Hz + a highpassed click transient (brighter and louder for `perfect`, duller and lower for `contact`, plus a thin ~5.4 kHz tick for the foul tip); whoosh / whiff = pink noise through a bandpass sweeping 400 -> 1800 Hz over ~250 ms; catcher's mitt = 110 -> 90 Hz sine thump under a lowpassed noise puff; crowd bed = looping brown noise through a ~600 Hz lowpass with two very slow LFOs on level and cutoff; cheers = noise through a 1-2 kHz bandpass swelling over 200 ms then decaying 1.6 s (`big` adds a brighter 2.8 kHz layer and a 2.5 s tail); `ohh` = two detuned sawtooths gliding 220 -> 160 Hz under a lowpass, plus soft air; `boo` = a 110 / 124 / 138 Hz sawtooth cluster with a 4.5 Hz vibrato over 1.2 s; applause = ~220 LCG-placed 4 ms noise clicks pre-rendered into one 2 s buffer; `ui_click` = a 5 ms blip.

### Cues

`src/audio/cues.ts` is a **pure** function of two consecutive `SessionSnapshot`s — `cuesForTransition(prev, next): Cue[]`. No Web Audio, no DOM, no timers, which is what makes it unit-testable. Every trigger is keyed on a monotonic timestamp from the snapshot contract (`current.startedAtMs`, `lastResult.resolvedAtMs`), so a re-render, a re-emitted snapshot or StrictMode's double effect invocation can never double-fire a pitch.

| Transition | Sounds |
|---|---|
| round starts (`running` -> true) | `crowd_ambience` loop up (1.2 s fade-in) |
| pitch released (new `startedAtMs`) | `pitch_whoosh`, scheduled at `contactAtMs - 350 ms` so it peaks on the contact point |
| `perfect`, kind `homer` | `bat_crack_perfect` + `crowd_cheer_big` (+250 ms) |
| `perfect`, any other kind | `bat_crack_perfect` + `crowd_cheer_small` (+250 ms) |
| `early` / `late`, fair | `bat_crack_contact` + `crowd_cheer_small` (+250 ms, ducked to 0.45) |
| `early` / `late`, foul | `bat_foul_tip` + `crowd_ohh` (+220 ms) |
| `miss` **with** a swing (`commit !== null`) | `whiff` + `catcher_mitt` (+120 ms) + `crowd_ohh` (+300 ms) |
| `miss` **without** a swing, 1st in a row | `catcher_mitt` + `crowd_ohh` (+260 ms) |
| `miss` **without** a swing, 2nd+ in a row | `catcher_mitt` + `crowd_boo` (+260 ms, ducked to 0.5) |
| round finishes | `applause_end` (+120 ms), then the bed fades out over 1 s starting 1 s later |
| `stop()` mid-round | bed fades out over 250 ms, no applause |

Absolute scheduling uses `ctx.currentTime + (targetPerfMs - performance.now()) / 1000`, so cue timing is sample-accurate against the game clock rather than `setTimeout`-accurate.

### Settings

Persisted as JSON under `localStorage` key **`camsport.audio`**: `{ mode, muted, volume }`, defaults `{ mode: 'real', muted: false, volume: 0.8 }`.

- **Mute** really means silent: master gain goes to 0 **and** the ambience loop is stopped, so a muted tab makes no sound and does no work. Unmuting brings the bed back if a round is live.
- The ambience bed also stops while `document.visibilityState === 'hidden'` and resumes when the tab comes back.
- Browsers require a gesture before audio can start, so `AudioEngine.unlock()` (create / resume the `AudioContext`) is called from **Start round**, the mute button, the backend buttons and the volume slider. The volume slider is hidden during `phase === 'pitching'`, like the sensitivity slider.
- The mute button `blur()`s itself after a click: `PointerInput` listens for `Space` / `Enter` on `window`, so a still-focused button would re-trigger itself on the next swing.
- The footer prints the active backend, and renders an attribution line per manifest entry whose license needs one (`getCredits()` filters for CC-BY-style licenses; the shipped pack is all CC0, so it prints nothing).

`window.__camsportAudio` exposes the engine for manual poking: `__camsportAudio.context.state`, `.masterGain`, `.setMode('synth')`, `.play('bat_crack_perfect')`.

## Architecture

Four layers, one-way data flow:

| Layer | Path | Responsibility |
|---|---|---|
| Input | `src/input/` | `InputPort` adapters (`start` / `stop` / `onCommit`) emitting `SwingCommit { atMs, source, power? }`. `PointerInput` = window `pointerdown` + `Space`/`Enter`; `CameraInput` = webcam frame differencing; `CompositeInput` fans out to both; `PoseInput` stays a stub. |
| Game | `src/game/` | `GameSession` owns the loop (pre-pitch delay → pitch → grade → result hold → next). Pure logic: no DOM, no camera, no `Math.random`, time via an injectable `Scheduler`. Publishes an immutable `SessionSnapshot` (contract in `src/game/types.ts`). |
| Audio | `src/audio/` | `AudioEngine` facade over two `SoundBackend`s (`SampleBackend` -> `SynthBackend` per-sound fallback). `cues.ts` maps snapshot transitions to cues as a pure function; `useGameAudio` is the only React glue. No `Math.random` (seeded LCG). |
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
