// Guppy Tank: a relaxing aquarium. The simulation in src/sim knows nothing about
// the engine; this file loads the art, runs the simulation each frame and has the
// view draw whatever state it is in.
import {
    Assets, Audio, GetWorld, Input, Res, Schedule, Storage, Time, UICameraInfo, UIEvents, addStartupSystem, addSystemToSchedule, defineSystem,
} from 'esengine';
import type { Entity, World } from 'esengine';
import './components';
import { BED, TIME } from './data/config';
import { DECOR, SUBSTRATES } from './data/decor';
import { FOODS } from './data/foods';
import { SPECIES, speciesSprites } from './data/species';
import { updateAudio } from './game/audio';
import { handleInput } from './game/input';
import { OLD_SAVE_KEY, SAVE_KEY, game, hostOptions, showTank, useSave } from './game/state';
import { connect, updateSync } from './game/sync';
import { buildUi, updateUi } from './game/ui';
import { deserialize, newSave, serialize } from './sim/save';
import { isNight, starterTank, stepTank } from './sim/tank';
import type { SaveFile } from './sim/types';
import { clearFish, syncFish } from './view/fishView';
import { LAYER, spawnSprite, updateSprite } from './view/sprites';
import { buildTank, clearTank, syncTank } from './view/tankView';

const DECOR_EXTRA = ['heater_on', 'heater_off', 'filter'];
const ENV = ['bg_black', 'bg_frosted', 'bg_blue', 'light_fall', 'glass_edge', 'glass_reflection', 'surface', 'caustics_a', 'caustics_b', 'rays',
    'bubble', 'mote', 'shadow', 'mulm', 'algae', 'white', 'bucket', 'vacuum', 'scrubber', 'net', 'scissors', 'eggs', 'nest', 'clutch'];
const MATERIALS = ['additive', 'multiply', 'sway'];
const FISH_VARIANTS = ['_ich', '_torn']; // extra sheets a fish may have: spots to lay over it, and the same fish with ragged fins
const CONNECT_WAIT = 2; // seconds to give the save helper to answer before starting without it

function fishSheets(): string[] {
    return [...new Set(Object.values(SPECIES).flatMap(speciesSprites))];
}

function texturePaths(): Map<string, string> {
    const paths = new Map<string, string>();
    for (const name of fishSheets()) paths.set(name, `assets/textures/fish/${name}.png`);
    for (const data of Object.values(DECOR)) paths.set(data.sprite, `assets/textures/decor/${data.sprite}.png`);
    for (const name of DECOR_EXTRA) paths.set(name, `assets/textures/decor/${name}.png`);
    for (const name of ENV) paths.set(name, `assets/textures/env/${name}.png`);
    for (const name of SUBSTRATES) {
        for (const grain of BED.grains) {
            for (const part of ['substrate', 'floor']) paths.set(`${part}_${name}_${grain}`, `assets/textures/env/${part}_${name}_${grain}.png`);
        }
    }
    for (const food of Object.values(FOODS)) for (const sprite of food.sprites) paths.set(sprite, `assets/textures/env/${sprite}.png`);
    return paths;
}

let loaded = false;
let loadError = '';
let shared: SaveFile | null = null;
let connected = false;
let waited = 0;
let shownEpoch = -1;
let tools: { vacuum: Entity; scrubber: Entity; bucket: Entity; net: Entity; scissors: Entity } | null = null;

const loadSystem = defineSystem([Res(Assets)], (assets) => {
    const load = async (name: string, path: string): Promise<void> => {
        const result = await assets.loadTexture(path);
        // A texture can arrive at a reduced size first and sharpen later: lay things out by its full size.
        const full = assets.textureFullSize(result.handle) ?? result;
        game.textures.set(name, { handle: result.handle, width: full.width, height: full.height });
    };
    const jobs = [...texturePaths()].map(([name, path]) => load(name, path));
    // Not every fish has every extra sheet: one that is missing is simply not used.
    for (const name of fishSheets()) {
        for (const variant of FISH_VARIANTS) jobs.push(load(name + variant, `assets/textures/fish/${name}${variant}.png`).catch(() => undefined));
    }
    for (const name of MATERIALS) {
        jobs.push(assets.loadMaterial(`assets/materials/${name}.esmaterial`).then((result) => { game.materials.set(name, result.handle); }));
    }
    Promise.all(jobs).then(() => { loaded = true; }).catch((error: unknown) => {
        loadError = error instanceof Error ? error.message : String(error);
    });
    connect().then((save) => { shared = save; }).catch(() => undefined).finally(() => { connected = true; });
}, { name: 'LoadAquariumArt' });

function loadSave(): void {
    const local = deserialize(Storage.getString(SAVE_KEY)) ?? deserialize(Storage.getString(OLD_SAVE_KEY));
    useSave(shared ?? local ?? newSave(starterTank()));
}

function buildTools(world: World): void {
    const hidden = { x: 0, y: 0, w: 1, h: 1, layer: LAYER.tools, color: { r: 1, g: 1, b: 1, a: 0 } };
    tools = {
        vacuum: spawnSprite(world, 'vacuum', 'vacuum', hidden),
        scrubber: spawnSprite(world, 'scrubber', 'scrubber', hidden),
        bucket: spawnSprite(world, 'bucket', 'bucket', hidden),
        net: spawnSprite(world, 'net', 'net', hidden),
        scissors: spawnSprite(world, 'scissors', 'scissors', hidden),
    };
}

function updateTools(world: World): void {
    if (!tools) return;
    const show = (on: boolean): { r: number; g: number; b: number; a: number } => ({ r: 1, g: 1, b: 1, a: on ? 1 : 0 });
    updateSprite(world, tools.vacuum, { x: game.mouseX, y: game.mouseY + 212, w: 44, h: 440, layer: LAYER.tools, color: show(game.tool === 'vacuum') });
    updateSprite(world, tools.scrubber, { x: game.mouseX, y: game.mouseY, w: 66, h: 44, layer: LAYER.tools, color: show(game.tool === 'scrub') });
    // The net's hoop and the scissors' tips sit at the pointer; their handles reach up out of the water.
    updateSprite(world, tools.net, { x: game.mouseX, y: game.mouseY + 170, w: 108, h: 420, layer: LAYER.tools, color: show(game.tool === 'net') });
    updateSprite(world, tools.scissors, { x: game.mouseX, y: game.mouseY + 140, w: 85, h: 300, layer: LAYER.tools, color: show(game.tool === 'trim') });
    const bucketShown = game.tool === 'vacuum' || game.tank.bucket.length > 0;
    updateSprite(world, tools.bucket, { x: 850, y: -462, w: 110, h: 110, layer: LAYER.tools, color: show(bucketShown) });
}

let appliedOptions = '';

/** Settings chosen in Wallpaper Engine (or by any page that hosts the game) override the game's own. */
function applyHostOptions(): void {
    const options = hostOptions();
    // Only when they change: otherwise they would undo whatever the player picks in the tank's own menus.
    const asked = JSON.stringify(options);
    if (asked === appliedOptions) return;
    appliedOptions = asked;
    game.menusOff = options.menus === false;
    game.muted = options.sound === false;
    const wanted = Number(options.tank);
    if (Number.isInteger(wanted) && wanted >= 1) showTank(Math.min(wanted, game.save.tanks.length) - 1);
    if (options.realclock !== undefined) {
        const light = game.tank.settings;
        if (options.realclock && light.lightMode !== 'clock') light.lightMode = 'clock';
        else if (!options.realclock && light.lightMode === 'clock') light.lightMode = 'auto';
    }
}

/** Every tank lives on, watched or not. The one on screen goes last so the gravel is left shaped for it. */
function stepTanks(dt: number): void {
    for (const tank of game.save.tanks) {
        if (tank !== game.tank) stepTank(tank, dt * (TIME.speeds[tank.settings.speedIndex] ?? 1));
    }
    stepTank(game.tank, dt * (TIME.speeds[game.tank.settings.speedIndex] ?? 1));
}

const frameSystem = defineSystem(
    [GetWorld(), Res(Time), Res(Input), Res(UICameraInfo), Res(UIEvents), Res(Audio)],
    (world, time, input, camera, events, audio) => {
        if (!game.ready) {
            if (loadError) throw new Error(`Aquarium art failed to load: ${loadError}`);
            const root = world.findEntityByName('UI');
            waited += time.delta;
            if (!loaded || root === null || (!connected && waited < CONNECT_WAIT)) return;
            game.uiRoot = root;
            loadSave();
            buildTank(world);
            buildTools(world);
            buildUi(world, events);
            game.ready = true;
            return;
        }
        const dt = Math.min(time.delta, 0.25);
        applyHostOptions();
        if (camera.valid && !game.wallpaper) handleInput(input, camera.worldMouseX, camera.worldMouseY, input.isPointerOverUI());
        if (shownEpoch !== game.viewEpoch) {
            // A different tank has come on screen: take down everything drawn for the last one.
            shownEpoch = game.viewEpoch;
            clearFish(world);
            clearTank(world);
        }
        stepTanks(dt);
        const speed = TIME.speeds[game.tank.settings.speedIndex] ?? 1;
        syncTank(world, dt * Math.min(speed, 2), isNight(game.tank));
        syncFish(world);
        updateTools(world);
        updateUi(world, dt);
        if (!game.wallpaper) updateAudio(audio);

        game.saveTimer += dt;
        const saving = game.saveTimer >= TIME.autosaveEvery && !game.following;
        if (saving) {
            game.saveTimer = 0;
            Storage.setString(SAVE_KEY, serialize(game.save));
        }
        updateSync(dt, saving);
    },
    { name: 'AquariumFrame' },
);

addStartupSystem(loadSystem);
addSystemToSchedule(Schedule.Update, frameSystem);
