# Guppy Tank

A relaxing, realistic 2D aquarium made with the Estella editor. There is nothing to win: you keep up to four tanks,
feed the fish, watch them breed, and arrange the plants and rocks however you like. It can also run as a live
desktop wallpaper.

## What is in the tank

- **Fourteen kinds of animal**, every one cut from photographs of the real thing and true to life in size:
  guppies (ten strains), Endler's livebearers, platies, mollies, swordtails, corydoras, bristlenose plecos,
  otocinclus, neon tetras, harlequin rasboras, bettas, dwarf gouramis, cherry shrimp and ramshorn snails.
- **Each behaves as its kind does.** Tetras and rasboras move as a shoal and sulk when there are too few. Corydoras
  root along the gravel and dash up for air. Plecos and otos cling to the glass and clear algae; the pleco hides by
  day. Shrimp and snails clean up dirt. Two male bettas fight to the death, and a betta tears the fins of male guppies.
- **Life cycle:** animals grow with time and food, age and die. Young male guppies colour up gradually. Age can be
  frozen per animal, and breeding, old age and illness can each be switched off.
- **Breeding, each in its own way:** livebearers give birth; tetras scatter eggs into plants; corydoras stick them to
  the glass; plecos need a cave, which the male guards; bettas and gouramis build a bubble nest; shrimp carry their
  eggs; well-fed snails lay everywhere. Most fish eat eggs and fry, so a planted tank raises many more young.
- **Water:** waste, oxygen, temperature and algae. Dirty water turns cloudy; the filter, plants, water changes,
  the gravel vacuum and the algae scrubber keep it clean. The vacuum can catch fry, which go in a bucket you pour back.
- **Health:** poor water, cold and bullying bring white spot and fin rot, which spread and kill if ignored. Treat
  with medicine (deadly to shrimp and snails), salt (hard on corydoras, plecos and plants) or by turning the heater up.
- **Plants grow:** they go in small, reach full size in a few minutes, overgrow if left, and some send out runners.
  Cut them back with the scissors.
- **Decoration:** 41 scanned plants, rocks, pieces of wood and ornaments. Drag them anywhere, push them toward the
  back glass, flip, rotate, remove. Four substrates, three grain sizes, five bed shapes, three bed depths, three backdrops.
- **Several tanks:** up to four, each with its own layout, water and animals. All of them keep running. A net moves
  animals from one to another.
- **Advice, not rules:** the Add fish menu says what a keeper would tell you about each animal in your tank as it
  stands, and how full the tank is. Nothing stops you ignoring it.
- **Day and night** (on a short cycle, or following the real time), sounds with separate volumes, auto-save every
  few seconds.

## Controls

| Action | How |
|---|---|
| Feed | Click the water |
| Menus | Move the mouse to the bottom edge of the screen |
| Look at an animal | Click it (rename, freeze its age, catch it, remove it) |
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

These use Microsoft Edge or Google Chrome with a private profile, and a small helper that only listens on this
computer (port 47815). The helper serves the game and keeps the one save that every way of running it shares, in
`%LOCALAPPDATA%\GuppyTank\save.json`.

**In Wallpaper Engine:** run `wallpaper/Build-WallpaperEngine.ps1`, then in Wallpaper Engine choose
*Open Wallpaper > Open from File* and pick `dist/wallpaper-engine/project.json` (or run the script with `-Open`).
There the tank stays playable from the desktop: click to feed, and the menus rise above the taskbar. It has no
keyboard there, so fish cannot be renamed. Its settings in Wallpaper Engine choose which tank to show, whether the
menus and sound are on, and whether day and night follow the real time.

For Wallpaper Engine to share the save with the Play window, the helper has to be running. Double-click
`wallpaper/Install helper.cmd` once to have it start whenever you sign in (`Remove helper.cmd` undoes that). Without
it the Wallpaper Engine tank simply keeps a save of its own. The helper only answers the game's own pages: the
Wallpaper Engine build carries a key kept in `%LOCALAPPDATA%\GuppyTank\key.txt`, so if that file is ever deleted,
run `Build-WallpaperEngine.ps1` again.

Only one window looks after the tanks at a time: the one you last clicked in. Any other open copy follows it.

After changing the game, export the Web build to `dist/web` again from the editor.

## Layout

| Folder | Contents |
|---|---|
| `src/sim` | The simulation: plain data and functions, no engine code. Covered by the tests in `tests/`. |
| `src/view` | Draws whatever state the simulation is in |
| `src/game` | Input, menus, sound, saving, the shared save |
| `src/data` | Every tunable number, the species, foods and decoration catalogue |
| `assets` | Finished pictures, sounds and the scene |
| `art-src` | The scripts and source photographs that produce the pictures (see its README) |
| `wallpaper` | Launchers for the window, the desktop wallpaper and Wallpaper Engine |

Run the tests with:

```
node --import ./tests/register.mjs --test tests/sim.test.ts tests/life.test.ts
```

## Credits and licences

The animals and equipment come from photographs on Wikimedia Commons, several of them CC BY-SA, and the scanned decoration and gravel
from Poly Haven (CC0). Authors, links and licences are listed in [CREDITS.md](CREDITS.md); the fish sprite sheets made
from CC BY-SA photographs are shared under the same licence.
