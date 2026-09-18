# CamSport — prompt log

Every instruction given in the build session, quoted verbatim (typos and all).
Session date: 2026-09-17 to 2026-09-18. Orchestrated by Claude Fable 5.1 with
implementation delegated to Opus subagents.

The Stage 1 kickoff referenced a separate pasted brief, kept at
[fable-build-prompt.md](./fable-build-prompt.md). Slash commands used during the
session (`/model`, `/effort`) are not prompts and are not logged here.

---

## 1. Kickoff

```
execute the prompt in fable-build.prompt.md
```

**Produced:** Stage 1 batting MVP. Pitch timeout, deterministic scripted hit
outcomes, scoring, 3D scene with the CC0 RobotExpressive avatar, start/end
cards, timing flash, and the first green GitHub Pages deploy.

---

## 2. Status check

```
you still working?
```

**Produced:** progress report only. Two of three agents had finished; the 3D
scene builder was still running.

---

## 3. Webcam (Stage 2)

```
what about my request for it to work with a webcam ? you can take a look at these two repo to see how it was done there https://github.com/natsh/air-guitar-hero/blob/main/PROMPT.md and https://codewithpassion.github.io/fable-demos/maestro/
```

**Produced:** `CameraInput` behind the existing `InputPort`. Frame differencing
on a mirrored 64x48 grayscale canvas with onset detection, re-arm, debounce and
a start guard. Mode picker, camera panel with live preview and sensitivity
slider, mouse/keyboard kept as fallback, plus 58 synthetic-frame checks.

---

## 4. Reference question

```
which cam tech stack did the two git i send you used?
```

**Produced:** answer only. Both references use `getUserMedia` into a tiny 2D
canvas with hand-written frame differencing and Web Audio, no ML model and no
libraries.

---

## 5. Visual direction

```
after you done with the camera can you make the visuals look better.? ask a graphic desiger subagent to give you advice on how to make this look amazing. shares, textyres or whatnot.
```

**Produced:** the art direction spec at [art-direction.md](./art-direction.md),
then implementation of its Tier 1 and Tier 2: procedural field map with mow
stripes, gradient sky, bleachers and clouds, ACES lighting with a shadow map,
dressed batter and pitcher, readable ball with trail, three-state timing ring,
contact burst and home run celebration. Separately the 2D UI restyle: palette
tokens, self-hosted fonts, HUD pills, swing meter, vignette and grain.

---

## 6. Mobile panel and deploy errors

```
1. i tried the webcam on my iphone . it works but the webcam frame on the bottom left is blockgin the ball hit area . 2. i'm gettign emails of deploy errors on github pages but i still see the game there, what are the errors? can you fix them?
```

**Produced:** diagnosis that the failure emails came from the source repo
`SoundGuyAI/CamSport`, which has no Pages site, so its deploy step 404'd on
every push while the `CamSportPage` deploys stayed green. The deploy job is now
gated to the Pages repo and the source repo builds as CI only.

---

## 7. Remaining spec items (sent mid-turn)

```
3. want to go ahead with the stuff you mentioned you didn't do in the spec? bloom, turf texture, etc.
```

**Produced:** Tier 3. Gated bloom post-processing with an ACES tone-mapping
pass, the CC0 ambientCG Grass004 turf multiplied into the field map, and a
portrait camera preset for phones.

---

## 8. Panel placement decision (sent mid-turn)

```
just move the caamera to the bottom right on mobile should be ok
```

**Produced:** the camera panel moves to bottom-right below 560 px, clear of the
batter and contact zone. Verified on a 390 px emulated phone viewport.

---

## 9. Sound

```
can you also add sounds? look for free sounds, example the crown, ball hit, cheering on sucecs, booing on failure, if you can't find any free sounds online use a syhtn to generate and emulate sounds. actually implement both with a setting so i can hear either totally symulated synth sounds or real sounds (with some synth for sounds you cannot find) . also make sure there a  mute sound button on the top so it doens't btoher people.
```

**Produced:** 13 CC0 effects vendored as mono Ogg with a manifest and license
notes, a Web Audio synth backend covering every cue, a sample backend that
falls back to synth per sound, a "Real samples / Synth" picker with volume, a
header mute button that also stops the crowd loop, and 70 cue-mapping checks.

---

## 10. This log

```
can you save all the prompts i gave you into an .md file?
```

**Produced:** this file.
