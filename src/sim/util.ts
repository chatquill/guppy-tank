import { BED, TANK } from '../data/config';
import { SPECIES } from '../data/species';
import type { Look, Sex } from '../data/species';
import type { Genes } from './types';

// One swappable random source so tests can run the simulation deterministically.
let source: () => number = Math.random;

export function seedRandom(seed: number): void {
    let a = seed >>> 0;
    source = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const rand = (lo = 0, hi = 1): number => lo + (hi - lo) * source();
export const randInt = (lo: number, hi: number): number => Math.floor(rand(lo, hi + 1));
export const pick = <T>(items: readonly T[]): T => items[Math.floor(source() * items.length)];
export const chance = (p: number): boolean => source() < p;
export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const bed = { front: TANK.floorFrontY, rise: TANK.floorBackRise, shape: 'level' };

/** Lay the gravel out the way the tank's settings ask. */
export function shapeBed(shape: string, depth: string): void {
    bed.shape = shape;
    bed.front = BED.depths[depth] ?? TANK.floorFrontY;
    bed.rise = shape === 'banked' ? BED.bankedRise : TANK.floorBackRise;
}

/** How far the bed stands above its base line at x. Slopes stay gentle so nothing looks stepped. */
function relief(x: number): number {
    const u = x / TANK.right;
    switch (bed.shape) {
        case 'rolling': return 22 * Math.sin(u * 3.7 + 0.6) + 7 * Math.sin(u * 8.3 + 2);
        case 'valley': return 52 * u * u + 4 * Math.sin(u * 9);
        case 'hill': return 52 * Math.exp(-((u / 0.55) ** 2)) + 4 * Math.sin(u * 9);
        case 'banked': return 6 * Math.sin(u * 5 + 1) + 6;
        default: return 3 * Math.sin(u * 8) + 2 * Math.sin(u * 19);
    }
}

/** Height of the gravel at a given depth and position (it rises toward the back glass). */
export const floorY = (d: number, x = 0): number => bed.front + (1 - d) * bed.rise + relief(x);
/** How far the bed climbs between the front glass and the back. */
export const bedRise = (): number => bed.rise;

export function randomGenes(species = 'guppy'): Genes {
    const looks = SPECIES[species].looks;
    return {
        male: randInt(0, looks.m.length - 1), female: randInt(0, looks.f.length - 1),
        size: rand(0.9, 1.1), tone: rand(0.9, 1.04),
    };
}

/** A fry's looks. Sons mostly take after the father's line and daughters after the mother's, as in real strains. */
export function inheritGenes(mother: Genes, father: Genes): Genes {
    const t = rand(0.25, 0.75);
    return {
        male: chance(0.7) ? father.male : mother.male,
        female: chance(0.7) ? mother.female : father.female,
        size: clamp(lerp(mother.size, father.size, t) + rand(-0.03, 0.03), 0.85, 1.15),
        tone: clamp(lerp(mother.tone, father.tone, t) + rand(-0.03, 0.03), 0.85, 1.06),
    };
}

/** The variety an animal belongs to, whether or not it is old enough to show it. */
export function lookOf(species: string, sex: Sex, genes: Genes): Look {
    const looks = SPECIES[species].looks[sex];
    return looks[Math.abs(sex === 'm' ? genes.male : genes.female) % looks.length];
}

/** Height of the water surface at a given depth: from below it appears to slope down toward the back. */
export const ceilingY = (d: number): number => TANK.surfaceY - (1 - d) * TANK.surfaceBackDrop;

export const FISH_NAMES = [
    'Pip', 'Mango', 'Ziggy', 'Coral', 'Finn', 'Luna', 'Pebble', 'Sunny', 'Olive', 'Bubbles', 'Rio', 'Maple',
    'Dash', 'Poppy', 'Sky', 'Clover', 'Nemo', 'Ruby', 'Jazz', 'Tango', 'Skye', 'Echo', 'Fig', 'Juno', 'Kiwi',
    'Lotus', 'Miso', 'Nori', 'Opal', 'Quill', 'Sage', 'Taro', 'Wren', 'Yuki', 'Zara', 'Basil', 'Comet', 'Dot',
];
