import { SPECIES } from '../data/species';
import type { Sex, Stage } from '../data/species';
import type { Fish, Genes, Tank, Temperament } from './types';
import { FISH_NAMES, chance, pick, rand } from './util';

const TEMPERAMENTS: Temperament[] = ['bold', 'curious', 'shy', 'skittish', 'calm'];
const START_GROWTH: Record<Stage, number> = { baby: 0, young: 1, adult: 2 };

/** Put a new animal into the tank at a given spot. */
export function makeFish(tank: Tank, kind: string, stage: Stage, sex: Sex, genes: Genes, x: number, y: number, d: number): Fish {
    const species = SPECIES[kind];
    const growth = START_GROWTH[stage];
    const age = growth >= 2 ? species.stageSeconds.baby + species.stageSeconds.young
        : growth >= 1 ? species.stageSeconds.baby : 0;
    const fish: Fish = {
        id: tank.nextId++, name: pick(FISH_NAMES), species: kind, sex, genes, temperament: pick(TEMPERAMENTS),
        age, lifespan: rand(species.lifespanSeconds[0], species.lifespanSeconds[1]), growth, frozen: false,
        hunger: 0.3, health: 1, stress: 0, torn: 0, illness: '', sick: 0, chaseCooldown: rand(8, 20),
        x, y, d, vx: 0, vy: 0, facing: chance(0.5) ? 1 : -1, turn: 0,
        mode: 'wander', modeTime: 99, think: rand(0, 0.5), pause: 0, tx: x, ty: y, td: d, targetId: 0,
        peck: 0, pecks: 0, courtCooldown: rand(10, 30), pregnancy: null, deadTime: 0, hidden: false,
        swimPhase: rand(0, 6), kick: rand(0, 0.5), beat: 0, lean: 0,
    };
    tank.fish.push(fish);
    return fish;
}
