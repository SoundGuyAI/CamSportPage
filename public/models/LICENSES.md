# 3D Asset Licenses — `public/models/`

All models in this folder are third-party assets used under open licenses.
Only one CC0 asset ships; no attribution is legally required, but a voluntary
credit is shown in the app footer.

---

## `batter.glb` — "RobotExpressive"

| Field | Value |
|---|---|
| Asset name | RobotExpressive |
| Author | Tomás Laulhé (a.k.a. Quaternius) |
| Modifications | Don McCurdy — added 3 facial-expression morph targets, converted with FBX2glTF, removed duplicate materials, reduced material metalness |
| Source URL | https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/RobotExpressive |
| Direct file URL | https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/RobotExpressive/RobotExpressive.glb |
| License | CC0 1.0 Universal (Public Domain Dedication) — https://creativecommons.org/publicdomain/zero/1.0/ |
| License stated at | `examples/models/gltf/RobotExpressive/README.md` in the three.js repository ("Model by Tomás Laulhé. ... CC0 1.0.") |
| Author's Patreon | https://www.patreon.com/quaternius |

**Attribution required:** None. CC0 1.0 waives all copyright and imposes no
conditions. The following credit is voluntary and recommended:

```
"RobotExpressive" by Tomás Laulhé (Quaternius), modified by Don McCurdy. CC0 1.0.
```

Technical notes: 463,988 bytes; glTF 2.0 binary; 74 nodes, 14 meshes, 2 skins
(43 joints each), 3 materials, 0 embedded images (untextured / flat-shaded).
14 animation clips: Dance (3.33s), Death (0.96s), Idle (3.33s), Jump (0.71s),
No (1.67s), Punch (0.83s), Running (0.96s), Sitting (0.42s), Standing (0.42s),
ThumbsUp (1.58s), Walking (0.96s), WalkJump (0.83s), Wave (1.83s), Yes (1.67s).
Head mesh has 3 morph targets: Angry, Surprised, Sad.
Y-up, feet at y = 0. World-space bounding box ~6.62 x 4.60 x 3.12 units
(4.60 units tall, width measured in the T-pose bind stance).

---

## Pitcher

The pitcher reuses `batter.glb` (RobotExpressive, CC0) with a tinted material
clone, so the scene ships a single third-party asset. The Khronos
`RiggedFigure` (CC-BY 4.0) was evaluated and deliberately not shipped: it
would add an attribution obligation and does not match the batter's style.

---

## Assets explicitly NOT used

- **Ready Player Me** avatars — runtime assets require the RPM SDK and are
  governed by RPM's Terms of Service, not an open redistribution license.
- **Adobe Mixamo** characters and animations — the Mixamo license does not
  permit open redistribution of the character files.
