import { EGGS, TANK } from '../data/config';
import { SPECIES } from '../data/species';
import type { Sex } from '../data/species';
import { dist } from './motion';
import { shelters } from './shelter';
import type { Shelter } from './shelter';
import { makeFish } from './spawn';
import type { Clutch, Env, Fish, SimEvent, Tank } from './types';
import { stageOf } from './types';
import { ceilingY, chance, clamp, floorY, inheritGenes, rand } from './util';

const EGGS_PER_FRY = 3; // most eggs never make a fish, even when nothing eats them

const between = (range: [number, number]): number => rand(range[0], range[1]);

/** The eggs or empty nest a male is watching over. */
export function wardOf(f: Fish, tank: Tank): Clutch | null {
    return tank.clutches.find((c) => c.guard === f.id) ?? null;
}

function nearest(spots: Shelter[], x: number, y: number): Shelter | null {
    let best: Shelter | null = null;
    for (const s of spots) if (!best || dist(x, y, s.x, s.y) < dist(x, y, best.x, best.y)) best = s;
    return best;
}

/** The female a male could court right now, if the pair has what its way of breeding needs. */
export function findMate(f: Fish, tank: Tank, env: Env): Fish | null {
    const species = SPECIES[f.species];
    if (!env.canBreed || f.sex !== 'm' || stageOf(f) !== 'adult' || f.courtCooldown > 0 || f.hunger >= 0.5) return null;
    if (species.spawning === 'clutch') return null; // snails need no courtship
    const eggLayer = species.spawning !== 'live' && species.spawning !== 'carry';
    if (eggLayer && tank.clutches.length >= EGGS.maxClutches) return null;
    const ward = wardOf(f, tank);
    if (species.spawning === 'nest' && (!ward || ward.eggs > 0)) return null; // no nest yet, or already tending eggs
    if (species.spawning === 'cave' && (ward || shelters(tank, true).length === 0)) return null;
    return tank.fish.find((o) => o.sex === 'f' && o.species === f.species && stageOf(o) === 'adult' && o.mode !== 'dead'
        && o.hunger < 0.5 && (eggLayer ? o.courtCooldown <= 0 : !o.pregnancy)
        && !tank.fish.some((rival) => rival !== f && rival.mode === 'court' && rival.targetId === o.id)) ?? null;
}

/** Does this male want to build a bubble nest? */
export function wantsNest(f: Fish, tank: Tank, env: Env): boolean {
    return env.canBreed && SPECIES[f.species].spawning === 'nest' && f.sex === 'm' && stageOf(f) === 'adult' && !wardOf(f, tank)
        && tank.clutches.length < EGGS.maxClutches
        && tank.fish.some((o) => o.species === f.species && o.sex === 'f' && stageOf(o) === 'adult' && o.mode !== 'dead');
}

export function buildNest(f: Fish, tank: Tank): void {
    tank.clutches.push({
        id: tank.nextId++, species: f.species, kind: 'nest', x: f.x, y: ceilingY(f.d) - 8, d: f.d,
        eggs: 0, hatch: 0, age: 0, guard: f.id, mother: { ...f.genes }, father: { ...f.genes },
    });
}

/** Where a pair leaves its eggs. Null when this pair has nowhere to put them. */
function eggSite(tank: Tank, male: Fish, female: Fish): Pick<Clutch, 'kind' | 'x' | 'y' | 'd' | 'guard'> | null {
    const kind = SPECIES[female.species].spawning;
    const plants = shelters(tank).filter((s) => !s.cave);
    const inPlant = (s: Shelter, high: boolean): { x: number; y: number; d: number } =>
        ({ x: s.x + rand(-0.4, 0.4) * s.rx, y: s.y + (high ? rand(0, 0.6) : rand(-0.6, 0.1)) * s.ry, d: s.d });
    if (kind === 'scatter') {
        const plant = nearest(plants, female.x, female.y);
        if (plant) return { kind: 'scatter', ...inPlant(plant, false), guard: 0 };
        return { kind: 'scatter', x: female.x, y: floorY(female.d, female.x) + 6, d: female.d, guard: 0 };
    }
    if (kind === 'stick') {
        const plant = nearest(plants, female.x, female.y);
        if (plant && chance(0.5)) return { kind: 'stick', ...inPlant(plant, true), guard: 0 };
        const x = clamp(female.x + rand(-80, 80), TANK.left + 40, TANK.right - 40);
        return { kind: 'stick', x, y: rand(floorY(1, x) + 90, TANK.surfaceY - 130), d: 0.96, guard: 0 };
    }
    if (kind === 'cave') {
        const cave = nearest(shelters(tank, true), male.x, male.y);
        return cave ? { kind: 'cave', x: cave.x, y: cave.y - cave.ry * 0.4, d: cave.d, guard: male.id } : null;
    }
    return null;
}

/** The end of a successful courtship: a pregnancy, or eggs somewhere in the tank. */
export function conceive(tank: Tank, male: Fish, female: Fish, events: SimEvent[]): void {
    const species = SPECIES[female.species];
    if (species.spawning === 'live' || species.spawning === 'carry') {
        female.pregnancy = {
            timer: between(species.gestationSeconds), broodsLeft: Math.round(between(species.storedBroods)),
            father: { ...male.genes }, dropping: 0, dropTimer: 0,
        };
        events.push({ kind: 'mated' });
        return;
    }
    const eggs = Math.round(between(species.broodSize)) * EGGS_PER_FRY;
    const hatch = between(species.eggSeconds);
    const nest = species.spawning === 'nest' ? wardOf(male, tank) : null;
    if (nest) {
        Object.assign(nest, { eggs, hatch, mother: { ...female.genes }, father: { ...male.genes } });
    } else {
        const site = eggSite(tank, male, female);
        if (!site) return;
        tank.clutches.push({
            id: tank.nextId++, species: female.species, ...site, eggs, hatch, age: 0, mother: { ...female.genes }, father: { ...male.genes },
        });
    }
    female.courtCooldown = between(species.gestationSeconds);
    events.push({ kind: 'mated' }, { kind: 'spawned', x: female.x, y: female.y });
}

/** Can a passing fish find and eat these eggs? */
export function raidable(c: Clutch, tank: Tank): boolean {
    if (c.eggs <= 0 || c.kind === 'clutch') return false; // snail jelly is left alone
    return !(c.kind === 'cave' && tank.fish.some((f) => f.id === c.guard && f.mode !== 'dead')); // the male blocks the entrance
}

function birth(tank: Tank, mother: Fish, env: Env, dt: number, events: SimEvent[]): void {
    const p = mother.pregnancy;
    if (!p) return;
    const species = SPECIES[mother.species];
    if (p.dropping > 0) {
        p.dropTimer -= dt;
        if (p.dropTimer > 0) return;
        p.dropTimer = rand(0.8, 2.2);
        p.dropping -= 1;
        const sex: Sex = chance(0.5) ? 'm' : 'f';
        makeFish(tank, mother.species, 'baby', sex, inheritGenes(mother.genes, p.father), mother.x, mother.y - 8, mother.d);
        events.push({ kind: 'born', x: mother.x, y: mother.y });
        if (p.dropping === 0) {
            p.broodsLeft -= 1;
            if (p.broodsLeft <= 0) mother.pregnancy = null;
            else p.timer = between(species.gestationSeconds);
        }
        return;
    }
    if (env.overcrowded || !tank.settings.breeding) return; // a crowded tank holds the brood back
    p.timer -= dt;
    if (p.timer <= 0) {
        // Older, larger females carry bigger broods.
        const maturity = clamp((mother.age / mother.lifespan) * 2.5, 0, 1);
        const [lo, hi] = species.broodSize;
        p.dropping = Math.round(lo + (hi - lo) * maturity * rand(0.6, 1));
    }
}

/** Any two well-fed snails are enough: the fuller they are, the more clutches appear. */
function snailsLay(tank: Tank, env: Env): void {
    const snails = tank.fish.filter((f) => SPECIES[f.species].spawning === 'clutch' && f.mode !== 'dead');
    const adults = snails.filter((f) => stageOf(f) === 'adult');
    if (!env.canBreed || adults.length < 2 || snails.length >= EGGS.maxSnails) return;
    for (const f of adults) {
        if (f.courtCooldown > 0 || f.hunger > EGGS.snailLayBelow || tank.clutches.length >= EGGS.maxClutches) continue;
        const species = SPECIES[f.species];
        const mate = adults.find((o) => o !== f) as Fish;
        tank.clutches.push({
            id: tank.nextId++, species: f.species, kind: 'clutch', x: f.x, y: f.y, d: f.d,
            eggs: Math.round(between(species.broodSize)) * EGGS_PER_FRY, hatch: between(species.eggSeconds), age: 0, guard: 0,
            mother: { ...f.genes }, father: { ...mate.genes },
        });
        f.courtCooldown = between(species.gestationSeconds);
    }
}

function hatch(tank: Tank, c: Clutch, events: SimEvent[]): void {
    const count = Math.ceil(c.eggs / EGGS_PER_FRY);
    for (let i = 0; i < count; i++) {
        const y = c.kind === 'nest' ? c.y - 10 : c.y;
        makeFish(tank, c.species, 'baby', chance(0.5) ? 'm' : 'f', inheritGenes(c.mother, c.father), c.x + rand(-14, 14), y + rand(-8, 8), c.d);
    }
    events.push({ kind: 'hatched', x: c.x, y: c.y });
}

/** Births, eggs hatching, nests ageing and snails laying. */
export function updateBreeding(tank: Tank, env: Env, dt: number, events: SimEvent[]): void {
    for (const mother of [...tank.fish]) if (mother.pregnancy && mother.mode !== 'dead') birth(tank, mother, env, dt, events);
    snailsLay(tank, env);
    for (const c of [...tank.clutches]) {
        c.age += dt;
        if (c.guard && !tank.fish.some((f) => f.id === c.guard && f.mode !== 'dead')) c.guard = 0;
        if (c.eggs > 0) {
            c.hatch -= dt;
            if (c.hatch > 0) continue;
            hatch(tank, c, events);
        } else if (c.kind === 'nest' && c.guard && c.age < EGGS.nestLifeSeconds) {
            continue; // an empty nest waits for a female
        }
        tank.clutches.splice(tank.clutches.indexOf(c), 1);
    }
}
