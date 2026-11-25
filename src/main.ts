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
import { FEMALE_LOOKS, FRY_SPRITE, MALE_LOOKS, YOUNG_SPRITE } from './data/strains';
import { updateAudio } from './game/audio';
import { handleInput } from './game/input';
import { SAVE_KEY, game } from './game/state';
import { buildUi, updateUi } from './game/ui';
import { deserialize, isNight, serialize, starterTank, stepTank } from './sim/tank';
import { syncFish } from './view/fishView';
import { LAYER, spawnSprite, updateSprite } from './view/sprites';
import { buildTank, syncTank } from './view/tankView';

const DECOR_EXTRA = ['heater_on', 'heater_off', 'filter'];
const ENV = ['bg_black', 'bg_frosted', 'bg_blue', 'light_fall', 'glass_edge', 'glass_reflection', 'surface', 'caustics_a', 'caustics_b', 'rays',
    'bubble', 'mote', 'shadow', 'mulm', 'algae', 'white', 'bucket', 'vacuum', 'scrubber'];
const MATERIALS = ['additive', 'multiply', 'sway'];

function texturePaths(): Map<string, string> {
    const paths = new Map<string, string>();
    for (const look of [...MALE_LOOKS, ...FEMALE_LOOKS]) paths.set(look.sprite, `assets/textures/fish/${look.sprite}.png`);
    for (const name of [YOUNG_SPRITE, FRY_SPRITE]) paths.set(name, `assets/textures/fish/${name}.png`);
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
let tools: { vacuum: Entity; scrubber: Entity; bucket: Entity } | null = null;

const loadSystem = defineSystem([Res(Assets)], (assets) => {
    const jobs = [...texturePaths()].map(async ([name, path]) => {
        const result = await assets.loadTexture(path);
        // A texture can arrive at a reduced size first and sharpen later: lay things out by its full size.
        const full = assets.textureFullSize(result.handle) ?? result;
        game.textures.set(name, { handle: result.handle, width: full.width, height: full.height });
    });
    for (const name of MATERIALS) {
        jobs.push(assets.loadMaterial(`assets/materials/${name}.esmaterial`).then((result) => { game.materials.set(name, result.handle); }));
    }
    Promise.all(jobs).then(() => { loaded = true; }).catch((error: unknown) => {
        loadError = error instanceof Error ? error.message : String(error);
    });
}, { name: 'LoadAquariumArt' });

function loadSave(): void {
    const saved = Storage.getString(SAVE_KEY);
    game.tank = deserialize(saved) ?? starterTank();
}

function buildTools(world: World): void {
    const hidden = { x: 0, y: 0, w: 1, h: 1, layer: LAYER.tools, color: { r: 1, g: 1, b: 1, a: 0 } };
    tools = {
        vacuum: spawnSprite(world, 'vacuum', 'vacuum', hidden),
        scrubber: spawnSprite(world, 'scrubber', 'scrubber', hidden),
        bucket: spawnSprite(world, 'bucket', 'bucket', hidden),
    };
}

function updateTools(world: World): void {
    if (!tools) return;
    const show = (on: boolean): { r: number; g: number; b: number; a: number } => ({ r: 1, g: 1, b: 1, a: on ? 1 : 0 });
    updateSprite(world, tools.vacuum, { x: game.mouseX, y: game.mouseY + 212, w: 44, h: 440, layer: LAYER.tools, color: show(game.tool === 'vacuum') });
    updateSprite(world, tools.scrubber, { x: game.mouseX, y: game.mouseY, w: 66, h: 44, layer: LAYER.tools, color: show(game.tool === 'scrub') });
    const bucketShown = game.tool === 'vacuum' || game.tank.bucket.length > 0;
    updateSprite(world, tools.bucket, { x: 850, y: -462, w: 110, h: 110, layer: LAYER.tools, color: show(bucketShown) });
}

const frameSystem = defineSystem(
    [GetWorld(), Res(Time), Res(Input), Res(UICameraInfo), Res(UIEvents), Res(Audio)],
    (world, time, input, camera, events, audio) => {
        if (!game.ready) {
            if (loadError) throw new Error(`Aquarium art failed to load: ${loadError}`);
            const root = world.findEntityByName('UI');
            if (!loaded || root === null) return;
            game.uiRoot = root;
            loadSave();
            buildTank(world);
            buildTools(world);
            buildUi(world, events);
            game.ready = true;
            return;
        }
        const dt = Math.min(time.delta, 0.25);
        if (camera.valid && !game.wallpaper) handleInput(input, camera.worldMouseX, camera.worldMouseY, input.isPointerOverUI());
        const tank = game.tank;
        const speed = TIME.speeds[tank.settings.speedIndex] ?? 1;
        stepTank(tank, dt * speed);
        syncTank(world, dt * Math.min(speed, 2), isNight(tank));
        syncFish(world);
        updateTools(world);
        updateUi(world, dt);
        if (!game.wallpaper) updateAudio(audio);

        game.saveTimer += dt;
        if (game.saveTimer >= TIME.autosaveEvery) {
            game.saveTimer = 0;
            Storage.setString(SAVE_KEY, serialize(tank));
        }
    },
    { name: 'AquariumFrame' },
);

addStartupSystem(loadSystem);
addSystemToSchedule(Schedule.Update, frameSystem);
