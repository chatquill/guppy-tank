import type { Sex, Stage } from '../src/data/species';
import { addFish, createTank, dropFood, stepTank } from '../src/sim/tank';
import type { Fish, Tank } from '../src/sim/types';
import { seedRandom } from '../src/sim/util';

/** Run the tank for a while, feeding on a schedule like an attentive owner. Returns the kinds of event that happened. */
export function run(tank: Tank, seconds: number, feedEvery = 0, food = 'brine'): string[] {
    const kinds: string[] = [];
    const steps = Math.round(seconds * 10);
    for (let i = 0; i < steps; i++) {
        if (feedEvery && i % (feedEvery * 10) === 0) dropFood(tank, food, 0, 300);
        for (const e of stepTank(tank, 0.1)) kinds.push(e.kind);
    }
    return kinds;
}

/** An empty tank with the lamp on and a fixed run of luck. */
export function quietTank(): Tank {
    seedRandom(12345);
    const tank = createTank();
    tank.settings.lightMode = 'on';
    return tank;
}

/** Add one adult per letter of `sexes`, e.g. 'mff'. */
export function add(tank: Tank, species: string, sexes: string, stage: Stage = 'adult'): Fish[] {
    return [...sexes].map((sex) => addFish(tank, species, stage, sex as Sex));
}

export const gone = (tank: Tank, f: Fish): boolean => f.mode === 'dead' || !tank.fish.includes(f);
