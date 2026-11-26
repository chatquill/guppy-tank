import { BED, EGGS, HEATER_SETTINGS, LIMITS, MAX_TANKS, WATER } from '../data/config';
import { BACKGROUNDS, DECOR, SUBSTRATES } from '../data/decor';
import { FOODS } from '../data/foods';
import { SPECIES } from '../data/species';
import { createTank } from './tank';
import type { Clutch, Decor, Fish, Food, Genes, Mulm, SaveFile, Tank } from './types';
import { clamp, randomGenes } from './util';

const SAVE_VERSION = 3;
const LIGHT_MODES = ['auto', 'on', 'off', 'clock'];
const CLUTCH_KINDS = { scatter: 1, stick: 1, cave: 1, nest: 1, clutch: 1 };

const has = (table: object, key: unknown): boolean => typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);
const isObject = (value: unknown): boolean => typeof value === 'object' && value !== null;
/** A saved list, without anything that is not an object and never longer than the game itself would let it grow. */
const listOf = <T>(value: unknown, most: number): T[] => (Array.isArray(value) ? (value as T[]).filter(isObject).slice(0, most) : []);
const numberOr = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

function mendGenes(species: string, saved: Partial<Genes> | undefined): Genes {
    const genes = { ...randomGenes(species), ...saved };
    const looks = SPECIES[species].looks;
    const index = (value: number, count: number): number => (Number.isInteger(value) && value >= 0 && value < count ? value : 0);
    return { ...genes, male: index(genes.male, looks.m.length), female: index(genes.female, looks.f.length) };
}

const FISH_NUMBERS = ['id', 'x', 'y', 'd', 'age', 'lifespan', 'growth', 'hunger'] as const;
const knownFish = (f: Fish): boolean => has(SPECIES, f.species) && typeof f.mode === 'string' && FISH_NUMBERS.every((key) => Number.isFinite(f[key]));
const safeTank = (data: Partial<Tank> | null | undefined): Tank | null => {
    try {
        return mendTank(data);
    } catch {
        return null; // one tank past mending must not take the others with it
    }
};

/** Fill in anything an older or damaged save lacks, so an animal can never be half-made. */
function mendFish(saved: Fish): Fish {
    const fish: Fish = {
        ...saved,
        kick: numberOr(saved.kick, 0), beat: numberOr(saved.beat, 0), lean: numberOr(saved.lean, 0),
        stress: numberOr(saved.stress, 0), torn: numberOr(saved.torn, 0), sick: numberOr(saved.sick, 0),
        chaseCooldown: numberOr(saved.chaseCooldown, 0),
        illness: saved.illness === 'ich' || saved.illness === 'finrot' ? saved.illness : '',
        genes: mendGenes(saved.species, saved.genes),
    };
    if (fish.pregnancy) fish.pregnancy = { ...fish.pregnancy, father: mendGenes(fish.species, fish.pregnancy.father) };
    return fish;
}

const mendDecor = (saved: Decor): Decor => ({ ...saved, size: clamp(numberOr(saved.size, 1), 0.1, 2), runner: numberOr(saved.runner, 300) });

function mendClutch(saved: Clutch): Clutch {
    return { ...saved, mother: mendGenes(saved.species, saved.mother), father: mendGenes(saved.species, saved.father) };
}

/** One tank from saved data. Returns null if it is too damaged to use. */
function mendTank(data: Partial<Tank> | null | undefined): Tank | null {
    if (!isObject(data) || !data || !Array.isArray(data.fish) || !Array.isArray(data.decor)) return null;
    const fresh = createTank();
    const settings = { ...fresh.settings, ...data.settings, volume: { ...fresh.settings.volume, ...data.settings?.volume } };
    if (!SUBSTRATES.includes(settings.substrate)) settings.substrate = fresh.settings.substrate;
    if (!BACKGROUNDS.includes(settings.background)) settings.background = fresh.settings.background;
    if (!BED.grains.includes(settings.grain)) settings.grain = fresh.settings.grain;
    if (!BED.shapes.includes(settings.bedShape)) settings.bedShape = fresh.settings.bedShape;
    if (!has(BED.depths, settings.bedDepth)) settings.bedDepth = fresh.settings.bedDepth;
    if (!LIGHT_MODES.includes(settings.lightMode)) settings.lightMode = fresh.settings.lightMode;
    if (!HEATER_SETTINGS.includes(settings.heaterTemp)) settings.heaterTemp = fresh.settings.heaterTemp;
    const tank: Tank = {
        ...fresh, ...data, settings, version: fresh.version,
        name: typeof data.name === 'string' && data.name !== '' ? data.name : fresh.name,
        nextId: Math.max(1, Math.floor(numberOr(data.nextId, 1))), time: Math.max(0, numberOr(data.time, fresh.time)),
        waste: clamp(numberOr(data.waste, 0), 0, 1000), mulmDebt: clamp(numberOr(data.mulmDebt, 0), 0, 10),
        oxygen: clamp(numberOr(data.oxygen, 1), 0, 1), temp: clamp(numberOr(data.temp, fresh.temp), 0, 40),
        algae: clamp(numberOr(data.algae, 0), 0, 1),
        medicine: Math.max(0, numberOr(data.medicine, 0)), salt: clamp(numberOr(data.salt, 0), 0, 1),
        fish: listOf<Fish>(data.fish, LIMITS.animals).filter(knownFish).map(mendFish),
        bucket: listOf<Fish>(data.bucket, LIMITS.animals).filter(knownFish).map(mendFish),
        decor: listOf<Decor>(data.decor, LIMITS.decor).filter((dc) => has(DECOR, dc.kind) && Number.isFinite(dc.x) && Number.isFinite(dc.d)).map(mendDecor),
        food: listOf<Food>(data.food, LIMITS.food).filter((f) => has(FOODS, f.type) && FOODS[f.type].sprites.includes(f.sprite)),
        mulm: listOf<Mulm>(data.mulm, WATER.maxMulm).filter((m) => Number.isFinite(m.id) && Number.isFinite(m.x) && Number.isFinite(m.d)),
        clutches: listOf<Clutch>(data.clutches, EGGS.maxClutches).filter((c) => has(SPECIES, c.species) && has(CLUTCH_KINDS, c.kind)
            && Number.isFinite(c.x) && Number.isFinite(c.y)).map(mendClutch),
    };
    // Never hand out a number something in the tank already has.
    const ids = [...tank.fish, ...tank.bucket, ...tank.decor, ...tank.food, ...tank.mulm, ...tank.clutches].map((thing) => numberOr(thing.id, 0));
    tank.nextId = Math.max(tank.nextId, ...ids.map((id) => Math.floor(id) + 1));
    return tank;
}

export function newSave(first: Tank): SaveFile {
    return { version: SAVE_VERSION, current: 0, tanks: [first], net: [] };
}

export function serialize(save: SaveFile): string {
    return JSON.stringify(save);
}

/** Read a save back. Returns null if it is missing or too damaged to use. A save from before there were several tanks becomes tank one. */
export function deserialize(text: string | null | undefined): SaveFile | null {
    if (!text) return null;
    try {
        const data = JSON.parse(text) as Partial<SaveFile> & Partial<Tank>;
        if (Array.isArray(data.fish)) {
            const only = safeTank(data);
            return only ? newSave(only) : null;
        }
        if (data.version !== SAVE_VERSION || !Array.isArray(data.tanks)) return null;
        const tanks = data.tanks.slice(0, MAX_TANKS).map(safeTank).filter((tank): tank is Tank => tank !== null).slice(0, MAX_TANKS);
        if (tanks.length === 0) return null;
        tanks.forEach((tank, i) => { if (tank.name === '') tank.name = `Tank ${i + 1}`; });
        return {
            version: SAVE_VERSION, tanks, current: clamp(Math.floor(numberOr(data.current, 0)), 0, tanks.length - 1),
            net: listOf<Fish>(data.net, LIMITS.animals).filter(knownFish).map(mendFish),
        };
    } catch {
        return null;
    }
}
