# Guppy Tank

A relaxing, realistic 2D guppy aquarium made with the Estella editor. There is nothing to win: you keep a tank,
feed the fish, watch them breed, and arrange the plants and rocks however you like. It can also run as a live
desktop wallpaper.

## What is in the tank

- **Guppies only**, male and female, in real strains cut from photographs. They are true to life in size.
- **Life cycle:** fish grow with time and food, court, give birth to live fry, age and die. Age can be frozen per fish,
  and breeding and old age can be switched off.
- **Fry and parents:** hungry adults eat fry. Fry bolt for the nearest plant or cave and stay hidden while an adult is
  close, so a planted tank raises many more young than a bare one.
- **Water:** waste, oxygen, temperature and algae. Dirty water turns cloudy; the filter, plants, water changes,
  the gravel vacuum and the algae scrubber keep it clean. The vacuum can catch fry, which go in a bucket you pour back.
- **Decoration:** 41 scanned plants, rocks, pieces of wood and ornaments. Drag them anywhere, push them toward the
  back glass, flip, rotate, remove. Four substrates, three grain sizes, five bed shapes, three bed depths, three backdrops.
- **Day and night**, sounds with separate volumes, auto-save every few seconds.

## Controls

| Action | How |
|---|---|
| Feed | Click the water |
| Menus | Move the mouse to the bottom edge of the screen |
| Look at a fish | Click it (rename, freeze its age, remove it) |
| Tap the glass | Right-click the water |
| Put a tool away | Esc, or the last button on the toolbar |
| Hide every menu | H |
| Pause | Space |

## Running it

**In the editor:** open this folder in Estella and press Play.

**From the exported build** (`dist/web`, included in this repository), on Windows:

| Double-click | What it does |
|---|---|
| `wallpaper/Play.cmd` | Opens the tank in its own window |
| `wallpaper/Start wallpaper.cmd` | Puts the tank behind your desktop icons as a live wallpaper (view only) |
| `wallpaper/Stop.cmd` | Closes either of those |

These use Microsoft Edge or Google Chrome with a private profile, and a small file server that only listens on this
computer (port 47815). Play and the wallpaper share one save.

**In Wallpaper Engine:** run `wallpaper/Build-WallpaperEngine.ps1`, then in Wallpaper Engine choose
*Open Wallpaper > Open from File* and pick `dist/wallpaper-engine/project.json` (or run the script with `-Open`).
There the tank stays playable from the desktop: click to feed, and the menus rise above the taskbar. It has no
keyboard there, so fish cannot be renamed, and it keeps its own save, separate from Play.

After changing the game, export the Web build to `dist/web` again from the editor.

## Layout

| Folder | Contents |
|---|---|
| `src/sim` | The simulation: plain data and functions, no engine code. Covered by `tests/sim.test.ts`. |
| `src/view` | Draws whatever state the simulation is in |
| `src/game` | Input, menus, sound, saving |
| `src/data` | Every tunable number, the fish strains, foods and decoration catalogue |
| `assets` | Finished pictures, sounds and the scene |
| `art-src` | The scripts and source photographs that produce the pictures (see its README) |
| `wallpaper` | Launchers for the window, the desktop wallpaper and Wallpaper Engine |

Run the tests with:

```
node --import ./tests/register.mjs --test tests/sim.test.ts
```

## Credits and licences

The fish come from photographs on Wikimedia Commons, several of them CC BY-SA, and the scanned decoration and gravel
from Poly Haven (CC0). Authors, links and licences are listed in [CREDITS.md](CREDITS.md); the fish sprite sheets made
from CC BY-SA photographs are shared under the same licence.
