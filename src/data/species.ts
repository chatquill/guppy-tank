// Species facts. Guppies only for now; another species is another entry here.
// Real-world figures are noted beside the compressed in-game values.

export type Stage = 'baby' | 'young' | 'adult';
export type Sex = 'm' | 'f';

export interface SpeciesData {
    name: string;
    livebearer: boolean;
    stageSeconds: { baby: number; young: number }; // time to leave each stage when well fed
    lifespanSeconds: [number, number]; // each fish draws its own value from this range
    lengthPx: { baby: number; young: number; adultM: number; adultF: number }; // body length on screen at the front glass
    swimSpeed: { baby: number; young: number; adult: number };
    hungerPerSec: { baby: number; young: number; adult: number };
    bioload: { baby: number; young: number; adult: number }; // waste per second
    crowding: { baby: number; young: number; adult: number }; // adult-equivalents
    gestationSeconds: [number, number];
    broodSize: [number, number];
    storedBroods: [number, number]; // females keep sperm for several broods
    eatsOwnFry: boolean;
    preferredLevel: [number, number]; // fraction of water height, 0 bottom .. 1 surface
}

export const SPECIES: Record<string, SpeciesData> = {
    guppy: {
        name: 'Guppy',
        livebearer: true,
        // Real: fry are juveniles at about 4 weeks, mature at 2-3 months.
        stageSeconds: { baby: 240, young: 360 },
        // Real: 2-3 years, roughly 10-14 times the time to maturity.
        lifespanSeconds: [6000, 8400],
        // The tank is about 80 cm wide on screen (22 px per cm): fry 0.8 cm, males 4 cm, females 5.5 cm.
        lengthPx: { baby: 18, young: 52, adultM: 90, adultF: 120 },
        swimSpeed: { baby: 60, young: 85, adult: 80 },
        hungerPerSec: { baby: 1 / 150, young: 1 / 200, adult: 1 / 260 },
        bioload: { baby: 0.004, young: 0.012, adult: 0.025 },
        crowding: { baby: 0.5, young: 0.75, adult: 1 },
        // Real: 21-30 days, about a third of the time to maturity.
        gestationSeconds: [240, 320],
        // Real: 5-20 for young females, 20-50 for large ones. Kept at the low end so one tank is not overrun.
        broodSize: [4, 14],
        storedBroods: [1, 2],
        eatsOwnFry: true,
        preferredLevel: [0.3, 0.92],
    },
};
