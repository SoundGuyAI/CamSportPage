# Sound asset licenses — `public/sounds/`

## Attribution required

**None.** Every shipped asset is **CC0 1.0 Universal (Public Domain Dedication)**, so the game
is under no legal obligation to display an attribution line. The credits below are courtesy
credits only — keep them in this file; no UI string is required.

CC0 1.0 full text: <https://creativecommons.org/publicdomain/zero/1.0/>

## Assets

| File | Asset name | Author | Source | License |
|---|---|---|---|---|
| `crowd_ambience.ogg` | Fenway Ambience 1 | Douglas711 | <https://freesound.org/s/424295/> | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `pitch_whoosh.ogg` | Clean fast Swoosh | Danjocross | <https://freesound.org/s/507466/> | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `catcher_mitt.ogg` | Glove Catch 1 FF014 | martinimeniscus | <https://freesound.org/s/164499/> | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `bat_crack_perfect.ogg` | Bat_hit2 | hashtagsmcgee | <https://freesound.org/s/851452/> | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `bat_crack_contact.ogg` | Bat Hit 9 FF095 | martinimeniscus | <https://freesound.org/s/162886/> | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `bat_foul_tip.ogg` | Hit a ball | Breviceps | <https://freesound.org/s/457039/> | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `whiff.ogg` | Basic Melee Swing / Miss / Whoosh | SypherZent | <https://freesound.org/s/420668/> | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `crowd_cheer_big.ogg` | MLB Crowd Cheer - 09032022 | tylermyers1992 | <https://freesound.org/s/649156/> | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `crowd_cheer_small.ogg` | Voice_Crowd_Small_Expression_Applause_Cheer_Stereo | Nox_Sound | <https://freesound.org/s/752709/> | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `crowd_ohh.ogg` | crowd `oh` — disappointed | mrrap4food | <https://freesound.org/s/619007/> | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `crowd_boo.ogg` | Voice_Crowd_Small_Expression_Boo_Stereo | Nox_Sound | <https://freesound.org/s/752707/> | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `applause_end.ogg` | Folk Music Concert Applause | qubodup | <https://freesound.org/s/854882/> | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `ui_click.ogg` | UI Audio — `click1.ogg` | Kenney (<https://kenney.nl>) | <https://kenney.nl/assets/ui-audio> | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

### Notes on provenance

- Freesound assets were taken from the public CDN preview streams
  (`https://cdn.freesound.org/previews/...-hq.ogg`), which require no login. The CC0 dedication
  was verified on each individual sound page (not on a search listing).
- The Kenney "UI Audio" pack ships a `License.txt` stating: *"License: (Creative Commons Zero,
  CC0) ... free to use in personal, educational and commercial projects. Support us by crediting
  Kenney or www.kenney.nl (this is not mandatory)."*
- No Pixabay, Sonniss/GDC, "free for personal use", or otherwise unclear-license material is
  included.

## Processing applied

All files were re-encoded with ffmpeg 8.1.2 to **Ogg Vorbis, mono, 44.1 kHz**, trimmed to the
useful region, short in/out fades added to avoid clicks, and peak-normalized to **-3.0 dBFS**.

- `crowd_ambience.ogg` — 12.00 s seamless loop cut from 12.0–25.0 s of the source; the trailing
  1 s is triangular-crossfaded over the leading 1 s so the loop point is continuous.
- `bat_crack_contact.ogg` — gentle 7.5 kHz low-pass so it reads as duller than
  `bat_crack_perfect.ogg`.
- `bat_foul_tip.ogg` — 350 Hz high-pass so it reads as a thin glancing tick.
- Crowd reactions are <= 4 s; impacts are <= 1.5 s.
