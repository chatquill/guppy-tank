import { BED, FOOD, TANK, TIME, VACUUM, WATER } from '../data/config';
import { BACKGROUNDS, DECOR, SUBSTRATES } from '../data/decor';
import { FOODS } from '../data/foods';
import { SPECIES } from '../data/species';
import type { Sex, Stage } from '../data/species';
import { FEMALE_LOOKS, MALE_LOOKS } from '../data/strains';
import { killFish, reactToTap, updateFish } from './fish';
import type { Decor, Env, Fish, Food, Genes, Mulm, SimEvent, Tank, Temperament } from './types';
import { stageOf } from './types';
import { FISH_NAMES, chance, clamp, floorY, inheritGenes, pick, rand, randInt, randomGenes, shapeBed } from './util';

const TEMPERAMENTS: Temperament[] = ['bold', 'curious', 'shy', 'skittish', 'calm'];
const START_GROWTH: Record<Stage, number> = { baby: 0, young: 1, adult: 2 };

export function createTank(): Tank {
    return {
        version: 1, nextId: 1, time: TIME.dayLength * 0.1,
        fish: [], food: [], decor: [], mulm: [], bucket: [],
        waste: 0, mulmDebt: 0, oxygen: 1, temp: WATER.heaterTemp, algae: 0,
        settings: {
            breeding: true, oldAge: true, speedIndex: 1, lightMode: 'auto',
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
    for (const sex of ['m', 'f', 'f', 'm', 'f'] as Sex[]) addFish(tank, 'adult', sex);
    return tank;
}

function makeFish(tank: Tank, stage: Stage, sex: Sex, genes: Genes, x: number, y: number, d: number): Fish {
    const species = SPECIES.guppy;
    const growth = START_GROWTH[stage];
    const age = growth >= 2 ? species.stageSeconds.baby + species.stageSeconds.young
        : growth >= 1 ? species.stageSeconds.baby : 0;
    const fish: Fish = {
        id: tank.nextId++, name: pick(FISH_NAMES), species: 'guppy', sex, genes, temperament: pick(TEMPERAMENTS),
        age, lifespan: rand(species.lifespanSeconds[0], species.lifespanSeconds[1]), growth, frozen: false,
        hunger: 0.3, health: 1, x, y, d, vx: 0, vy: 0, facing: chance(0.5) ? 1 : -1, turn: 0,
        mode: 'wander', modeTime: 99, think: rand(0, 0.5), pause: 0, tx: x, ty: y, td: d, targetId: 0,
        peck: 0, pecks: 0, courtCooldown: rand(10, 30), pregnancy: null, deadTime: 0, hidden: false,
        swimPhase: rand(0, 6), kick: rand(0, 0.5), beat: 0,
    };
    tank.fish.push(fish);
    return fish;
}

export function addFish(tank: Tank, stage: Stage, sex: Sex): Fish {
    // New fish are released at the surface, as if tipped in from a bag.
    return makeFish(tank, stage, sex, randomGenes(), rand(-300, 300), TANK.surfaceY - 20, rand(0.3, 0.8));
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

export function placeDecor(tank: Tank, kind: string, x: number, d: number): Decor | null {
    if (!DECOR[kind]) return null;
    const decor: Decor = { id: tank.nextId++, kind, x: clamp(x, TANK.left + 40, TANK.right - 40), d: clamp(d, 0, 1), flip: false, rot: 0 };
    tank.decor.push(decor);
    return decor;
}

export function removeDecor(tank: Tank, id: number): void {
    tank.decor = tank.decor.filter((dc) => dc.id !== id);
}

export function waterChange(tank: Tank): void {
    tank.waste *= 1 - WATER.waterChangeFraction;
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

export function isNight(tank: Tank): boolean {
    const mode = tank.settings.lightMode;
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

function updateBirths(tank: Tank, env: Env, dt: number, events: SimEvent[]): void {
    for (const mother of [...tank.fish]) {
        const p = mother.pregnancy;
        if (!p || mother.mode === 'dead') continue;
        const species = SPECIES[mother.species];
        if (p.dropping > 0) {
            p.dropTimer -= dt;
            if (p.dropTimer > 0) continue;
            p.dropTimer = rand(0.8, 2.2);
            p.dropping -= 1;
            const sex: Sex = chance(0.5) ? 'm' : 'f';
            makeFish(tank, 'baby', sex, inheritGenes(mother.genes, p.father), mother.x, mother.y - 8, mother.d);
            events.push({ kind: 'born', x: mother.x, y: mother.y });
            if (p.dropping === 0) {
                p.broodsLeft -= 1;
                if (p.broodsLeft <= 0) mother.pregnancy = null;
                else p.timer = rand(species.gestationSeconds[0], species.gestationSeconds[1]);
            }
            continue;
        }
        if (env.overcrowded || !tank.settings.breeding) continue; // a crowded tank holds the brood back
        p.timer -= dt;
        if (p.timer <= 0) {
            // Older, larger females carry bigger broods.
            const maturity = clamp((mother.age / mother.lifespan) * 2.5, 0, 1);
            const [lo, hi] = species.broodSize;
            p.dropping = Math.round(lo + (hi - lo) * maturity * rand(0.6, 1));
        }
    }
}

function updateWater(tank: Tank, env: Env, dt: number, events: SimEvent[]): void {
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

    const plants = tank.decor.filter((dc) => DECOR[dc.kind].cleans).length;
    const clearing = (s.filterOn ? WATER.filterClearRate : 0) + plants * WATER.plantClearRate;
    tank.waste = Math.max(0, tank.waste - tank.waste * clearing * dt);

    const aerated = s.filterOn || s.airOn;
    tank.oxygen = clamp(tank.oxygen + (aerated ? WATER.oxygenRisePerSec : -WATER.oxygenDropPerSec * (1 + crowding(tank) / 10)) * dt, 0, 1);
    const targetTemp = s.heaterOn ? WATER.heaterTemp : WATER.roomTemp;
    tank.temp += clamp(targetTemp - tank.temp, -WATER.tempDriftPerSec * dt, WATER.tempDriftPerSec * dt);
    if (!env.night) tank.algae = clamp(tank.algae + WATER.algaeGrowPerSec * (0.4 + tank.waste / 60) * dt / (1 + plants * 0.25), 0, 1);

    const harmful = env.quality < WATER.harmBelow || tank.oxygen < 0.15;
    for (const f of tank.fish) {
        if (f.mode === 'dead') continue;
        f.health = clamp(f.health + (harmful ? -WATER.harmPerSec : WATER.healPerSec) * dt, 0, 1);
        if (f.health <= 0) killFish(f, events);
    }
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
        updateBirths(tank, env, h, events);
        updateWater(tank, env, h, events);
    }
    return events;
}

export function serialize(tank: Tank): string {
    return JSON.stringify(tank);
}

const listOf = <T>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : []);

function mendGenes(saved: Partial<Genes> | undefined): Genes {
    const genes = { ...randomGenes(), ...saved };
    const index = (value: number, count: number): number => (Number.isInteger(value) && value >= 0 && value < count ? value : 0);
    return { ...genes, male: index(genes.male, MALE_LOOKS.length), female: index(genes.female, FEMALE_LOOKS.length) };
}

/** Fill in anything an older or damaged save lacks, so a fish can never be half-made. */
function mendFish(saved: Fish): Fish {
    const fish = { ...saved, kick: saved.kick ?? 0, beat: saved.beat ?? 0, genes: mendGenes(saved.genes) };
    if (fish.pregnancy) fish.pregnancy = { ...fish.pregnancy, father: mendGenes(fish.pregnancy.father) };
    return fish;
}

const knownFish = (f: Fish): boolean => typeof f === 'object' && f !== null && f.species in SPECIES && Number.isFinite(f.x) && Number.isFinite(f.y);

/** Read a save back. Returns null if it is missing or too damaged to use. */
export function deserialize(text: string | null | undefined): Tank | null {
    if (!text) return null;
    try {
        const fresh = createTank();
        const data = JSON.parse(text) as Partial<Tank>;
        if (data.version !== 1 || !Array.isArray(data.fish) || !Array.isArray(data.decor)) return null;
        const settings = { ...fresh.settings, ...data.settings, volume: { ...fresh.settings.volume, ...data.settings?.volume } };
        if (!SUBSTRATES.includes(settings.substrate)) settings.substrate = fresh.settings.substrate;
        if (!BACKGROUNDS.includes(settings.background)) settings.background = fresh.settings.background;
        if (!BED.grains.includes(settings.grain)) settings.grain = fresh.settings.grain;
        if (!BED.shapes.includes(settings.bedShape)) settings.bedShape = fresh.settings.bedShape;
        if (!(settings.bedDepth in BED.depths)) settings.bedDepth = fresh.settings.bedDepth;
        return {
            ...fresh, ...data, settings,
            fish: data.fish.filter(knownFish).map(mendFish),
            bucket: listOf<Fish>(data.bucket).filter(knownFish).map(mendFish),
            decor: data.decor.filter((dc) => dc && dc.kind in DECOR),
            food: listOf<Food>(data.food).filter((f) => f && f.type in FOODS && FOODS[f.type].sprites.includes(f.sprite)),
            mulm: listOf<Mulm>(data.mulm),
        };
    } catch {
        return null;
    }
}
