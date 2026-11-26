import { CLOCK, FOOD, PLANTS, TANK, TIME, VACUUM, WATER } from '../data/config';
import { DECOR } from '../data/decor';
import { FOODS } from '../data/foods';
import { SPECIES } from '../data/species';
import type { Sex, Stage } from '../data/species';
import { updateBreeding } from './breeding';
import { reactToTap, updateFish } from './fish';
import { updateHealth } from './health';
import { plantMass, updatePlants } from './plants';
import { makeFish } from './spawn';
import type { Decor, Env, Fish, SimEvent, Tank } from './types';
import { stageOf } from './types';
import { clamp, floorY, pick, rand, randInt, randomGenes, shapeBed } from './util';

export function createTank(name = 'Tank 1'): Tank {
    return {
        version: 2, name, nextId: 1, time: TIME.dayLength * 0.1,
        fish: [], food: [], decor: [], mulm: [], clutches: [], bucket: [],
        waste: 0, mulmDebt: 0, oxygen: 1, temp: WATER.heaterTemp, algae: 0, medicine: 0, salt: 0,
        settings: {
            breeding: true, oldAge: true, illness: true, speedIndex: 1, lightMode: 'auto', heaterTemp: WATER.heaterTemp,
            filterOn: true, heaterOn: true, airOn: true,
            substrate: 'gravel_natural', grain: 'medium', bedShape: 'rolling', bedDepth: 'medium', background: 'bg_black',
            volume: { filter: 0.5, bubbles: 0.5, feed: 0.7, music: 0.35 },
        },
    };
}

/** What a first-time player sees: a planted tank with a small group of guppies. */
export function starterTank(): Tank {
    const tank = createTank();
    // Tall stems against the back glass, wood and stone in the middle, low plants in front.
    const layout: [string, number, number][] = [
        ['val_tall', -760, 0.06], ['val_tall', -640, 0.12], ['hygro_tall', -520, 0.08], ['hygro_mid', -410, 0.16],
        ['hygro_tall', 600, 0.07], ['val_tall', 730, 0.1], ['stem_a', 470, 0.15], ['hygro_mid', 820, 0.2],
        ['rock_boulder', -250, 0.3], ['wood_log', 150, 0.4], ['wood_branch', 330, 0.28], ['rock_granite', 560, 0.45],
        ['sword_big', -600, 0.5], ['fern_a', 40, 0.3], ['anubias_a', 250, 0.6], ['crypt_b', -330, 0.7],
        ['rock_mossy', -470, 0.75], ['rock_river', 420, 0.8], ['grass_tuft', -120, 0.85], ['grass_small', 640, 0.9],
        ['grass_small', -700, 0.88], ['rock_small', 90, 0.92], ['airstone', 780, 0.35],
    ];
    for (const [kind, x, d] of layout) placeDecor(tank, kind, x, d);
    for (const sex of ['m', 'f', 'f', 'm', 'f'] as Sex[]) addFish(tank, 'guppy', 'adult', sex);
    return tank;
}

export function addFish(tank: Tank, species: string, stage: Stage, sex: Sex): Fish {
    // New animals are released at the surface, as if tipped in from a bag.
    const x = rand(-300, 300);
    const d = rand(0.3, 0.8);
    // Snails, shrimp and sucker-mouths cannot swim down: they are set on the gravel.
    const zone = SPECIES[species].zone;
    const y = zone === 'crawl' || zone === 'cling' ? floorY(d, x) : TANK.surfaceY - 20;
    return makeFish(tank, species, stage, sex, randomGenes(species), x, y, d);
}

export function removeFish(tank: Tank, id: number): void {
    tank.fish = tank.fish.filter((f) => f.id !== id);
}

export function dropFood(tank: Tank, type: string, x: number, y: number): void {
    const data = FOODS[type];
    if (!data) return;
    const count = randInt(data.piecesPerDrop[0], data.piecesPerDrop[1]);
    for (let i = 0; i < count; i++) {
        const d = rand(0.25, 0.85);
        // Food that floats starts at the surface; the rest falls from where you clicked.
        const startY = data.floatSeconds > 0 ? TANK.surfaceY - 4 : clamp(y, floorY(d, x) + 20, TANK.surfaceY - 4);
        tank.food.push({
            id: tank.nextId++, type, sprite: pick(data.sprites),
            x: clamp(x + rand(-45, 45), TANK.left + 20, TANK.right - 20), y: startY + rand(-6, 0), d,
            floatLeft: data.floatSeconds * rand(0.6, 1.4), resting: false, restLeft: FOOD.restSeconds,
            bites: data.bites, phase: rand(0, 6),
        });
    }
}

/** Set a decoration down. A plant can go in full-grown, or as the small young plant a shop sells. */
export function placeDecor(tank: Tank, kind: string, x: number, d: number, grown = true): Decor | null {
    const data = DECOR[kind];
    if (!data) return null;
    const decor: Decor = {
        id: tank.nextId++, kind, x: clamp(x, TANK.left + 40, TANK.right - 40), d: clamp(d, 0, 1), flip: false, rot: 0,
        size: data.category === 'plant' && !grown ? PLANTS.startSize : 1, runner: rand(PLANTS.runnerEvery[0], PLANTS.runnerEvery[1]),
    };
    tank.decor.push(decor);
    return decor;
}

export function removeDecor(tank: Tank, id: number): void {
    tank.decor = tank.decor.filter((dc) => dc.id !== id);
}

export function waterChange(tank: Tank): void {
    tank.waste *= 1 - WATER.waterChangeFraction;
    // Fresh water thins out whatever was added to the old.
    tank.salt *= 1 - WATER.waterChangeFraction;
    tank.medicine *= 1 - WATER.waterChangeFraction;
}

export function scrubAlgae(tank: Tank, amount: number): void {
    tank.algae = clamp(tank.algae - amount, 0, 1);
}

/** Hold the gravel vacuum at a point: it lifts mulm, and any fry that stray too close. */
export function vacuumAt(tank: Tank, x: number, y: number): void {
    tank.mulm = tank.mulm.filter((m) => Math.hypot(m.x - x, floorY(m.d, m.x) - y) > VACUUM.radius);
    for (const f of [...tank.fish]) {
        if (f.mode !== 'dead' && stageOf(f) === 'baby' && Math.hypot(f.x - x, f.y - y) < VACUUM.fryCatchRadius) {
            tank.fish.splice(tank.fish.indexOf(f), 1);
            tank.bucket.push(f);
        }
    }
}

/** Tip the fry caught in the bucket back into the tank, unharmed. */
export function pourBucket(tank: Tank): void {
    for (const f of tank.bucket) {
        f.x = rand(-200, 200);
        f.y = TANK.surfaceY - 30;
        f.mode = 'wander';
        f.modeTime = 99;
        tank.fish.push(f);
    }
    tank.bucket = [];
}

export function tapGlass(tank: Tank, x: number, y: number): void {
    for (const f of tank.fish) reactToTap(f, tank, x, y);
}

export function crowding(tank: Tank): number {
    return tank.fish.reduce((sum, f) => sum + (f.mode === 'dead' ? 0 : SPECIES[f.species].crowding[stageOf(f)]), 0);
}

/** Is the lamp off? `hour` is the real time of day, used when the tank follows the clock. */
export function isNight(tank: Tank, hour = new Date().getHours()): boolean {
    const mode = tank.settings.lightMode;
    if (mode === 'clock') return hour < CLOCK.lightsOn || hour >= CLOCK.lightsOff;
    if (mode !== 'auto') return mode === 'off';
    return (tank.time % TIME.dayLength) / TIME.dayLength > 1 - TIME.nightFraction;
}

export const waterQuality = (tank: Tank): number => clamp(1 - tank.waste / 100, 0, 1);

export function environment(tank: Tank): Env {
    const quality = waterQuality(tank);
    const overcrowded = crowding(tank) >= TANK.capacity;
    return {
        night: isNight(tank), quality,
        gasping: quality < WATER.gaspBelow || tank.oxygen < 0.3,
        overcrowded,
        activity: clamp((tank.temp - 14) / 12, 0.5, 1),
        canBreed: tank.settings.breeding && !overcrowded && tank.temp >= WATER.breedMinTemp && quality > WATER.gaspBelow,
        medicated: tank.medicine > 0,
    };
}

function updateFood(tank: Tank, dt: number): void {
    for (const food of [...tank.food]) {
        const data = FOODS[food.type];
        if (food.resting) {
            food.restLeft -= dt;
            if (food.restLeft <= 0) tank.food.splice(tank.food.indexOf(food), 1);
            continue;
        }
        food.phase += dt;
        if (food.floatLeft > 0) {
            food.floatLeft -= dt;
            food.x += Math.sin(food.phase * 0.8) * 6 * dt;
            continue;
        }
        food.y -= data.sinkSpeed * dt;
        food.x = clamp(food.x + Math.sin(food.phase * 2.2) * data.drift * dt, TANK.left + 12, TANK.right - 12);
        const bottom = floorY(food.d, food.x) + 6;
        if (food.y <= bottom) {
            food.y = bottom;
            food.resting = true;
        }
    }
}

function updateWater(tank: Tank, env: Env, dt: number): void {
    const s = tank.settings;
    let produced = 0;
    for (const f of tank.fish) {
        produced += f.mode === 'dead' ? WATER.deadFishWastePerSec : SPECIES[f.species].bioload[stageOf(f)];
    }
    produced += tank.food.filter((o) => o.resting).length * WATER.foodWastePerSec;
    produced += tank.mulm.length * WATER.sedimentLeakRate;
    tank.waste += produced * dt;

    // Solid waste settles on the gravel as mulm that the vacuum can lift.
    tank.mulmDebt += produced * WATER.mulmPerWaste * dt * 0.05;
    while (tank.mulmDebt >= 1 && tank.mulm.length < WATER.maxMulm) {
        tank.mulmDebt -= 1;
        tank.mulm.push({ id: tank.nextId++, x: rand(TANK.left + 30, TANK.right - 30), d: rand(0.1, 0.95) });
    }

    const plants = plantMass(tank);
    const clearing = (s.filterOn ? WATER.filterClearRate : 0) + plants * WATER.plantClearRate;
    tank.waste = Math.max(0, tank.waste - tank.waste * clearing * dt);

    const aerated = s.filterOn || s.airOn;
    tank.oxygen = clamp(tank.oxygen + (aerated ? WATER.oxygenRisePerSec : -WATER.oxygenDropPerSec * (1 + crowding(tank) / 10)) * dt, 0, 1);
    const targetTemp = s.heaterOn ? s.heaterTemp : WATER.roomTemp;
    tank.temp += clamp(targetTemp - tank.temp, -WATER.tempDriftPerSec * dt, WATER.tempDriftPerSec * dt);
    if (!env.night) tank.algae = clamp(tank.algae + WATER.algaeGrowPerSec * (0.4 + tank.waste / 60) * dt / (1 + plants * 0.25), 0, 1);
}

/** Advance the aquarium by dt seconds. Long steps are cut up so fast-forward stays stable. */
export function stepTank(tank: Tank, dt: number): SimEvent[] {
    const events: SimEvent[] = [];
    shapeBed(tank.settings.bedShape, tank.settings.bedDepth);
    let left = dt;
    while (left > 1e-6) {
        const h = Math.min(left, TIME.maxStep);
        left -= h;
        tank.time += h;
        const env = environment(tank);
        updateFood(tank, h);
        // A fry eaten earlier in this step is already gone from the tank.
        for (const f of [...tank.fish]) if (tank.fish.includes(f)) updateFish(f, tank, env, h, events);
        updateBreeding(tank, env, h, events);
        updateWater(tank, env, h);
        updateHealth(tank, env, h, events);
        updatePlants(tank, env, h);
    }
    return events;
}

/** Lift one animal out of the tank with the net. */
export function netFish(tank: Tank, id: number): Fish | null {
    const fish = tank.fish.find((f) => f.id === id && f.mode !== 'dead');
    if (!fish) return null;
    tank.fish.splice(tank.fish.indexOf(fish), 1);
    return fish;
}

/** Tip netted animals into a tank. They get new ids there, so anything that was after them elsewhere forgets them. */
export function releaseFish(tank: Tank, netted: Fish[], x: number): void {
    for (const fish of netted) {
        Object.assign(fish, {
            id: tank.nextId++, x: clamp(x + rand(-60, 60), TANK.left + 60, TANK.right - 60), y: TANK.surfaceY - 30, d: rand(0.4, 0.8),
            mode: 'wander', modeTime: 99, targetId: 0, hidden: false, lean: 0,
        });
        fish.tx = fish.x;
        fish.ty = fish.y;
        fish.td = fish.d;
        // The move is a fright.
        fish.stress = clamp(fish.stress + 0.25, 0, 1);
        tank.fish.push(fish);
    }
}
