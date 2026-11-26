import { TANK } from '../data/config';
import { SPECIES } from '../data/species';
import { shelters } from './shelter';
import { crowding } from './tank';
import type { Tank } from './types';

/** How full the tank is: 1 is the most it holds comfortably. */
export const stockingLevel = (tank: Tank): number => crowding(tank) / TANK.capacity;

export function stockingWord(level: number): string {
    return level < 0.35 ? 'lightly stocked' : level < 0.75 ? 'comfortable' : level < 1 ? 'nearly full' : 'overcrowded';
}

const grown = (tank: Tank, kind: string, sex?: string): number =>
    tank.fish.filter((f) => f.species === kind && f.mode !== 'dead' && f.growth >= 1 && (!sex || f.sex === sex)).length;

/** What a keeper would tell you before you add this animal to this tank. Advice only: nothing stops you. */
export function adviceFor(tank: Tank, kind: string): string[] {
    const species = SPECIES[kind];
    const present = [...new Set(tank.fish.filter((f) => f.mode !== 'dead').map((f) => f.species))].filter((o) => o !== kind);
    const advice: string[] = [];
    const have = grown(tank, kind);
    if (species.shoal > 0 && have < species.shoal) advice.push(`Keep ${species.shoal} or more: you have ${have}.`);
    if (species.aggression?.rivals && grown(tank, kind, 'm') >= 1) advice.push(`You already have a male: a second male ${species.name.toLowerCase()} means fighting.`);
    for (const other of present) {
        const theirs = SPECIES[other];
        const name = theirs.plural;
        if (species.aggression?.rivalSpecies.includes(other) || theirs.aggression?.rivalSpecies.includes(kind)) advice.push(`Males will fight your ${name}.`);
        if (species.aggression?.bulliesLongFins && theirs.longFins.length > 0) advice.push(`Will tear the fins of your male ${name}.`);
        if (theirs.aggression?.bulliesLongFins && species.longFins.length > 0) advice.push(`Your ${name} will tear the males' fins.`);
        if (theirs.aggression?.nipsWhenFew && species.longFins.length > 0 && grown(tank, other) < theirs.shoal) advice.push(`Your ${name} are too few and may nip long fins.`);
        if (species.body === 'shrimp' && theirs.eatsShrimp) advice.push(`Your ${name} will eat them.`);
        if (species.eatsShrimp && theirs.body === 'shrimp') advice.push(`Will eat your ${name}.`);
    }
    if (species.spawning === 'cave' && shelters(tank, true).length === 0) advice.push('Needs a cave, pot or hollow log to hide and breed in.');
    if (species.body === 'shrimp' && shelters(tank).length < 3) advice.push('Add more plants: shrimp need cover.');
    if (species.delicate > 1.5 && tank.waste > 25) advice.push('Your water is not clean enough for it yet.');
    if (species.body !== 'fish' && tank.medicine > 0) advice.push('There is medicine in the water: it would die.');
    if (stockingLevel(tank) + species.crowding.adult / TANK.capacity > 1) advice.push('The tank is full: this would overcrowd it.');
    return advice;
}
