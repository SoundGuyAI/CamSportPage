# Texture Licenses — `public/textures/`

Every other texture in the scene is drawn procedurally on a `<canvas>` at
runtime (see `src/scene/textures.ts`). This folder holds the only downloaded
image asset.

---

## `grass004-color.jpg` — ambientCG "Grass004" albedo

| Field | Value |
|---|---|
| Asset name | Grass004 (Color / albedo map) |
| Author | ambientCG (Lennart Demes) |
| Source page | https://ambientcg.com/view?id=Grass004 |
| Direct download | https://ambientcg.com/get?file=Grass004_1K-JPG.zip (`Grass004_1K-JPG_Color.jpg`) |
| License | CC0 1.0 Universal (Public Domain Dedication) — https://creativecommons.org/publicdomain/zero/1.0/ |
| License stated at | https://ambientcg.com/license ("All assets on ambientCG.com are available under the Creative Commons CC0 1.0 Universal License.") |

**Attribution required:** None. CC0 1.0 waives all copyright and imposes no
conditions. The following credit is voluntary:

```
"Grass004" by ambientCG. CC0 1.0.
```

**Modifications:** the shipped file is the 1K JPG colour map only (the
AmbientOcclusion / Displacement / Normal / Roughness maps and the `.blend`,
`.mtlx`, `.tres`, `.usdc` bundles from the zip are not used), resized
1024 × 1024 → 512 × 512 and re-encoded as JPEG quality 80 to bring it from
1.99 MB down to 79 KB. The tile is seamless; the resize preserves that.

**How it is used:** `src/scene/textures.ts` downsamples it to a ~24 px tile,
normalises the tile to its own mean so the average multiply is exactly 1.0, and
multiplies it over the procedural field map right after the mow stripes are
drawn (repeat period 7.5 ft, sRGB, renderer-max anisotropy, one shared
material). If the file 404s or fails to decode, the field silently keeps the
purely procedural stripes.
