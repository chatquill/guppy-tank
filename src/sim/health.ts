import { HEALTH, SOCIAL, WATER } from '../data/config';
import { SPECIES } from '../data/species';
import { company } from './social';
import type { Env, Fish, SimEvent, Tank } from './types';
import { stageOf } from './types';
import { chance, clamp } from './util';

export function killFish(f: Fish, events: SimEvent[]): void {
    f.mode = 'dead';
    f.deadTime = 0;
    f.turn = 0;
    f.lean = 0;
    f.pregnancy = null;
    events.push({ kind: 'died', name: f.name });
}

/** One dose of medicine: it works for a few minutes, and it is poison to shrimp and snails. */
export function doseMedicine(tank: Tank): void {
    tank.medicine = HEALTH.medicineSeconds;
}

/** A measure of aquarium salt. It stays until water changes dilute it. */
export function addSalt(tank: Tank): void {
    tank.salt = clamp(tank.salt + HEALTH.saltPerDose, 0, 1);
}

/** How a fish's nerves change this second: frights wear off, bad company and bad water do not. */
function stressRate(f: Fish, tank: Tank, env: Env): number {
    const species = SPECIES[f.species];
    let rate = -SOCIAL.calmPerSec;
    if (env.overcrowded) rate += SOCIAL.calmPerSec + SOCIAL.crowdStressPerSec;
    if (env.quality < WATER.cloudyBelow) rate += SOCIAL.calmPerSec + (WATER.cloudyBelow - env.quality) * 0.02 * species.delicate;
    if (species.scaleless && tank.salt > 0.3) rate += SOCIAL.calmPerSec + 0.004 * tank.salt;
    const lonely = species.shoal > 0 && stageOf(f) !== 'baby' && company(f, tank) < species.shoal;
    if (lonely && f.stress < SOCIAL.lonelyStressMax) rate += SOCIAL.calmPerSec + SOCIAL.lonelyStressPerSec;
    return rate;
}

/** Catching an illness, or the one it has running its course. Returns the health it costs per second. */
function illness(f: Fish, tank: Tank, env: Env, sickCount: number, dt: number, events: SimEvent[]): number {
    const species = SPECIES[f.species];
    if (!tank.settings.illness || species.body !== 'fish') {
        f.illness = '';
        f.sick = 0;
        return 0;
    }
    if (f.illness === '') {
        if (env.medicated) return 0;
        const risk = (f.stress > 0.5 ? 2 : 0) + (env.quality < HEALTH.dirtyBelow ? 2 * species.delicate : 0)
            + (tank.temp < HEALTH.coldBelow ? 3 : 0) + sickCount * HEALTH.spreadPerSick;
        if (risk > 0 && chance(HEALTH.ichChancePerSec * risk * dt)) f.illness = 'ich';
        else if (f.torn > SOCIAL.tornShownAbove && env.quality < 0.7 && chance(HEALTH.finrotChancePerSec * dt)) f.illness = 'finrot';
        if (f.illness !== '') {
            f.sick = 0.05;
            events.push({ kind: 'sick', name: f.name });
        }
        return 0;
    }
    let rate = HEALTH.progressPerSec;
    if (env.medicated) rate -= HEALTH.medicineCurePerSec;
    rate -= HEALTH.saltCurePerSec * tank.salt * (f.illness === 'finrot' ? 1 : 0.4);
    if (f.illness === 'ich' && tank.temp >= HEALTH.heatFrom) rate -= HEALTH.heatCurePerSec;
    // A mild case in clean, calm water is thrown off without help.
    if (f.sick < HEALTH.mildBelow && env.quality > 0.8 && f.stress < 0.3) rate -= HEALTH.progressPerSec + HEALTH.recoverPerSec;
    f.sick = clamp(f.sick + rate * dt, 0, 1);
    if (f.illness === 'finrot') f.torn = Math.max(f.torn, f.sick);
    if (f.sick <= 0) f.illness = '';
    return f.sick > HEALTH.weakAbove ? HEALTH.harmPerSec * ((f.sick - HEALTH.weakAbove) / (1 - HEALTH.weakAbove)) : 0;
}

/** Stress, injury, illness and recovery for every animal in the tank. */
export function updateHealth(tank: Tank, env: Env, dt: number, events: SimEvent[]): void {
    const living = tank.fish.filter((f) => f.mode !== 'dead');
    const sickCount = living.filter((f) => f.illness === 'ich').length;
    for (const f of living) {
        const species = SPECIES[f.species];
        f.stress = clamp(f.stress + stressRate(f, tank, env) * dt, 0, 1);

        let harm = 0;
        if (env.quality < Math.min(WATER.harmBelow * species.delicate, WATER.cloudyBelow)) harm += WATER.harmPerSec * species.delicate;
        if (tank.oxygen < 0.15 && !species.breathesAir) harm += WATER.harmPerSec;
        if (f.stress > SOCIAL.harmAbove) harm += SOCIAL.harmPerSec;
        if (species.body !== 'fish' && env.medicated) harm += HEALTH.medicineHarmToInverts;
        if (species.scaleless && tank.salt > 0.5) harm += HEALTH.saltHarmPerSec * tank.salt;
        harm += illness(f, tank, env, sickCount, dt, events);

        if (env.quality > 0.6 && f.illness !== 'finrot') f.torn = clamp(f.torn - SOCIAL.tornHealPerSec * dt, 0, 1);
        f.health = clamp(f.health + (harm > 0 ? -harm : WATER.healPerSec) * dt, 0, 1);
        if (f.health <= 0) killFish(f, events);
    }
    tank.medicine = Math.max(0, tank.medicine - dt);
}
