# Art pipeline

Everything under `assets/` is produced by the scripts here. Run them from this folder.

| Step | Command | Makes |
|---|---|---|
| Fish | `python fish_photo.py source/fish-cutouts render/fishphoto` | swim-cycle sheets from the cut-out photos |
| Water, glass, gravel | `python gen_env.py source/ground render/env` | gravel in three grain sizes, surface, caustics, light shafts, backdrops |
| Scanned decor | `blender -b -P decor_scan.py -- <polyhaven-models> render/scan` | rocks, wood, plants, ornaments |
| Equipment, food, tools | `blender -b -P decor.py`, `python gen2d.py` | heater, filter, air stone, food, cleaning tools |
| Sound | `python gen_audio.py` | hum, bubbles, clicks, music |
| Pack | `python pack.py` | copies it all into `assets/` and writes `src/data/decorSizes.ts` |

`source/fish-photos` holds the original photographs and `source/fish-cutouts` the same with the background removed
(rembg, model `isnet-general-use`). The Poly Haven models are not stored here because of their size: each sprite's
model is named in `JOBS` in `decor_scan.py` and can be downloaded again from polyhaven.com (glTF, 1k).
Sources and licences are listed in `../CREDITS.md`.
