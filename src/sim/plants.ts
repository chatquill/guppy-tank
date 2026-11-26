import { PLANTS, TANK } from '../data/config';
import { DECOR } from '../data/decor';
import type { Decor, Env, Tank } from './types';
import { chance, clamp, rand } from './util';

const isPlant = (dc: Decor): boolean => DECOR[dc.kind].category === 'plant';
const tallness = (dc: Decor): number => DECOR[dc.kind].height * dc.size;

/** A plant standing under a much taller neighbour gets less light. */
function shaded(plant: Decor, plants: Decor[]): boolean {
    return plants.some((o) => o !== plant && Math.abs(o.x - plant.x) < PLANTS.shadeReach && Math.abs(o.d - plant.d) < 0.25
        && tallness(o) > tallness(plant) * 1.5 && tallness(o) > 260);
}

/** Plants grow in the light, feed on the fish's waste, overgrow if left, and some send out runners. */
export function updatePlants(tank: Tank, env: Env, dt: number): void {
    const plants = tank.decor.filter(isPlant);
    const light = env.night ? PLANTS.nightGrowth : 1;
    const food = 0.6 + Math.min(1, tank.waste / 40) * 0.8;
    const salt = tank.salt > 0.3 ? PLANTS.saltGrowth : 1;
    let count = plants.length;
    for (const plant of plants) {
        const dim = shaded(plant, plants);
        const rate = PLANTS.growPerSec * light * food * salt * (dim ? PLANTS.shadedGrowth : 1);
        const limit = dim ? PLANTS.fullSize : PLANTS.maxSize;
        // Past its full size a plant only creeps on.
        if (plant.size < limit) plant.size = Math.min(limit, plant.size + rate * dt * (plant.size < PLANTS.fullSize ? 1 : 0.3));
        if (!DECOR[plant.kind].runners || plant.size < PLANTS.fullSize || count >= PLANTS.maxPlants) continue;
        plant.runner -= dt * light * salt;
        if (plant.runner > 0) continue;
        plant.runner = rand(PLANTS.runnerEvery[0], PLANTS.runnerEvery[1]);
        const side = chance(0.5) ? -1 : 1;
        tank.decor.push({
            id: tank.nextId++, kind: plant.kind,
            x: clamp(plant.x + side * rand(PLANTS.runnerReach[0], PLANTS.runnerReach[1]), TANK.left + 40, TANK.right - 40),
            d: clamp(plant.d + rand(-0.08, 0.08), 0, 1), flip: chance(0.5), rot: 0,
            size: PLANTS.minSize, runner: rand(PLANTS.runnerEvery[0], PLANTS.runnerEvery[1]),
        });
        count += 1;
    }
}

/** Cut a plant back. Returns false if the thing is not a plant. */
export function trimPlant(tank: Tank, id: number): boolean {
    const plant = tank.decor.find((dc) => dc.id === id);
    if (!plant || !isPlant(plant)) return false;
    plant.size = Math.max(PLANTS.minSize, plant.size * PLANTS.trimTo);
    return true;
}

/** How much waste the plants take up, counted in full-grown plants. */
export function plantMass(tank: Tank): number {
    return tank.decor.reduce((sum, dc) => sum + (DECOR[dc.kind].cleans ? dc.size : 0), 0);
}
