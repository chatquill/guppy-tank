import { SOCIAL } from '../data/config';
import { SPECIES } from '../data/species';
import { bodyLength, dist } from './motion';
import type { Fish, SimEvent, Tank } from './types';
import { stageOf } from './types';
import { clamp } from './util';

const alive = (f: Fish): boolean => f.mode !== 'dead';

/** How many of its own kind a fish has for company, itself included. Fry do not count. */
export function company(f: Fish, tank: Tank): number {
    return tank.fish.filter((o) => o.species === f.species && alive(o) && o.growth >= 1).length;
}

/** The fish the rest of a shoal follows: the eldest of the group. Null for the leader itself and for loners. */
export function shoalLeader(f: Fish, tank: Tank): Fish | null {
    if (SPECIES[f.species].shoal <= 0 || f.growth < 1) return null;
    let leader: Fish | null = null;
    for (const o of tank.fish) {
        if (o.species === f.species && alive(o) && o.growth >= 1 && (!leader || o.id < leader.id)) leader = o;
    }
    return leader && leader !== f ? leader : null;
}

/** Fins worth nipping: the trailing finnage of a grown, long-finned fish. */
export function longFinned(f: Fish): boolean {
    return stageOf(f) === 'adult' && SPECIES[f.species].longFins.includes(f.sex) && bodyLength(f) >= SOCIAL.longFinMinPx;
}

/** Who, if anyone, this fish will go for right now. */
export function pickRival(f: Fish, tank: Tank): Fish | null {
    const temper = SPECIES[f.species].aggression;
    if (!temper || f.chaseCooldown > 0 || stageOf(f) !== 'adult') return null;
    const nippy = temper.nipsWhenFew && company(f, tank) < SPECIES[f.species].shoal;
    const fights = f.sex === 'm';
    let best: Fish | null = null;
    let bestD: number = SOCIAL.chaseSight;
    for (const o of tank.fish) {
        if (o === f || !alive(o) || o.hidden || stageOf(o) !== 'adult') continue;
        const ownRival = fights && temper.rivals && o.species === f.species && o.sex === 'm';
        const otherRival = fights && temper.rivalSpecies.includes(o.species) && o.sex === 'm';
        const finTarget = o.species !== f.species && longFinned(o) && ((fights && temper.bulliesLongFins) || nippy);
        if (!ownRival && !otherRival && !finTarget) continue;
        const dd = dist(f.x, f.y, o.x, o.y);
        if (dd < bestD) {
            bestD = dd;
            best = o;
        }
    }
    return best;
}

/** One bite: torn fins, a fright, and from a real fighter an injury. A guarding fish bites only to drive off. */
export function nip(f: Fish, victim: Fish, guarding: boolean, events: SimEvent[]): void {
    const temper = SPECIES[f.species].aggression;
    const tear = guarding || !temper ? 0.02 : temper.tear;
    const harm = guarding || !temper ? 0 : temper.harm;
    // Short fins give a nipper little to take hold of.
    victim.torn = clamp(victim.torn + tear * (longFinned(victim) ? 1 : 0.35), 0, 1);
    victim.health = clamp(victim.health - harm, 0, 1);
    victim.stress = clamp(victim.stress + SOCIAL.nipStress, 0, 1);
    events.push({ kind: 'nipped', x: victim.x, y: victim.y });
}
