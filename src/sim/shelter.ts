import { BEHAVIOUR } from '../data/config';
import { DECOR } from '../data/decor';
import { dist, setTarget } from './motion';
import type { Decor, Fish, Tank } from './types';
import { floorY, rand } from './util';

/** The space inside a plant or cave where a small animal is out of sight. */
export interface Shelter {
    x: number;
    y: number;
    rx: number;
    ry: number;
    d: number;
    cave: boolean;
}

function shelterOf(dc: Decor): Shelter | null {
    const data = DECOR[dc.kind];
    if (data.cover <= 0) return null;
    const base = floorY(dc.d, dc.x);
    // A plant shelters fry through its whole height, and more of them as it grows; a cave only in its hollow.
    if (data.category === 'plant') {
        const height = data.height * dc.size;
        return { x: dc.x, y: base + height * 0.45, rx: data.cover * 0.8 * dc.size, ry: height * 0.4, d: dc.d, cave: false };
    }
    return { x: dc.x, y: base + data.height * 0.35, rx: data.cover, ry: data.cover, d: dc.d, cave: true };
}

export function shelters(tank: Tank, caveOnly = false): Shelter[] {
    const found: Shelter[] = [];
    for (const dc of tank.decor) {
        const shelter = shelterOf(dc);
        if (shelter && (shelter.cave || !caveOnly)) found.push(shelter);
    }
    return found;
}

const within = (s: Shelter, x: number, y: number): boolean => ((x - s.x) / s.rx) ** 2 + ((y - s.y) / s.ry) ** 2 < 1;

/** Is this point tucked into a plant or cave? */
export function isCovered(tank: Tank, x: number, y: number, d: number): boolean {
    return shelters(tank).some((s) => Math.abs(s.d - d) < BEHAVIOUR.coverDepth && within(s, x, y));
}

/** Aim for a spot well inside a shelter, low down where the growth is thickest. */
export function tuckInto(f: Fish, s: Shelter): void {
    setTarget(f, s.x + rand(-0.45, 0.45) * s.rx, s.y + rand(-0.6, 0.25) * s.ry, s.d);
}

/** Head for the shelter that can be reached soonest, preferring one that is not past the fish it is fleeing. */
export function hideTarget(f: Fish, tank: Tank, caveOnly: boolean, from: Fish | null = null): boolean {
    let best: Shelter | null = null;
    let bestCost = Infinity;
    for (const s of shelters(tank, caveOnly)) {
        let cost = dist(f.x, f.y, s.x, s.y) + Math.abs(s.d - f.d) * BEHAVIOUR.depthCost;
        if (from && dist(from.x, from.y, s.x, s.y) < dist(f.x, f.y, s.x, s.y)) cost += BEHAVIOUR.pastThreatCost;
        if (cost < bestCost) {
            bestCost = cost;
            best = s;
        }
    }
    if (!best) return false;
    tuckInto(f, best);
    return true;
}
