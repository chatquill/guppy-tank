// Species facts. Every animal in the game is one entry here; the simulation reads
// nothing about a species from anywhere else. Real-world figures are noted beside
// the compressed in-game values. Lengths are on screen at the front glass, where
// the 80 cm tank gives 22 px per cm.

export type Stage = 'baby' | 'young' | 'adult';
export type Sex = 'm' | 'f';
export type Body = 'fish' | 'shrimp' | 'snail';
/** Where it lives: open water, along the gravel, stuck to glass and wood, or walking over everything. */
export type Zone = 'water' | 'bottom' | 'cling' | 'crawl';
/**
 * How it breeds. live: gives birth. carry: the female carries eggs until they hatch (shrimp).
 * scatter: eggs dropped among plants. stick: eggs stuck to glass and leaves. cave: laid in a cave the male guards.
 * nest: the male builds a bubble nest and guards it. clutch: jelly clutches laid by any well-fed adult (snails).
 */
export type Spawning = 'live' | 'carry' | 'scatter' | 'stick' | 'cave' | 'nest' | 'clutch';
export type Diet = 'small' | 'medium' | 'carnivore' | 'bottom' | 'grazer' | 'invert';
export type Group = 'Livebearers' | 'Bottom dwellers' | 'Shoaling fish' | 'Centrepiece fish' | 'Shrimp and snails';

export interface Look {
    sprite: string;
    label: string;
    scale?: number; // a smaller or larger variety than the species figure
}

export interface Aggression {
    rivals: boolean; // males fight other males of their own kind
    rivalSpecies: string[]; // other species treated as rivals
    bulliesLongFins: boolean; // harasses long-finned fish of other species
    nipsWhenFew: boolean; // turns fin-nipper when kept in too small a group
    tear: number; // fin damage per nip, 0..1
    harm: number; // health lost by the victim per nip
}

export interface SpeciesData {
    name: string;
    plural: string;
    group: Group;
    body: Body;
    zone: Zone;
    spawning: Spawning;
    diet: Diet;
    looks: { m: Look[]; f: Look[] };
    youngSprite: string; // plain juvenile sheet that males colour up from ('' = show the adult look from the start)
    frySprite: string;
    longFins: Sex[]; // which sexes carry fins that get nipped
    stageSeconds: { baby: number; young: number }; // time to leave each stage when well fed
    lifespanSeconds: [number, number]; // each animal draws its own value from this range
    lengthPx: { baby: number; young: number; adultM: number; adultF: number };
    swimSpeed: { baby: number; young: number; adult: number };
    hungerPerSec: { baby: number; young: number; adult: number };
    bioload: { baby: number; young: number; adult: number }; // waste per second
    crowding: { baby: number; young: number; adult: number }; // adult-guppy equivalents
    gestationSeconds: [number, number]; // live and carry: until the young arrive. Egg layers: rest between spawnings
    broodSize: [number, number]; // young born, or fry that hatch from one spawning
    storedBroods: [number, number]; // livebearer females keep sperm for several broods
    eggSeconds: [number, number]; // time for eggs to hatch
    mouthPx: number; // longest animal it can swallow (0 = eats no fry)
    eatsEggs: boolean;
    eatsShrimp: boolean; // takes adult shrimp as well as shrimplets
    grazes: number; // algae cleared per second, as a fraction of the whole pane
    scavenges: boolean; // feeds from food lying on the gravel
    shoal: number; // smallest group it is at ease in (0 = not a shoaling animal)
    aggression: Aggression | null;
    delicate: number; // how hard poor water hits, 1 = like a guppy
    nocturnal: boolean;
    breathesAir: boolean; // labyrinth fish and corydoras take air at the surface
    scaleless: boolean; // suffers from salt
    preferredLevel: [number, number]; // fraction of water height, 0 bottom .. 1 surface
    notes: string[]; // keeper's advice shown in the Add fish menu
}

const NO_FINS: Sex[] = [];
const peaceful = null;

// The guppy strains: every one is a photograph of a real fish, so only colour forms that exist are shown.
const GUPPY_MALES: Look[] = [
    { sprite: 'm_cobra_yellow', label: 'Yellow cobra' },
    { sprite: 'm_halfblack', label: 'Half-black' },
    { sprite: 'm_cobra_green', label: 'Green cobra' },
    { sprite: 'm_blue_grass', label: 'Blue grass' },
    { sprite: 'm_tiger', label: 'Tiger' },
    { sprite: 'm_gold', label: 'Gold' },
];
const GUPPY_FEMALES: Look[] = [
    { sprite: 'f_grey', label: 'Wild grey' },
    { sprite: 'f_gold', label: 'Gold' },
    { sprite: 'f_tuxedo', label: 'Tuxedo' },
    { sprite: 'f_snake', label: 'Snakeskin' },
];

const guppy: SpeciesData = {
    name: 'Guppy', plural: 'guppies', group: 'Livebearers', body: 'fish', zone: 'water', spawning: 'live', diet: 'small',
    looks: { m: GUPPY_MALES, f: GUPPY_FEMALES }, youngSprite: 'young', frySprite: 'fry', longFins: ['m'],
    // Real: fry are juveniles at about 4 weeks, mature at 2-3 months.
    stageSeconds: { baby: 240, young: 360 },
    // Real: 2-3 years, roughly 10-14 times the time to maturity.
    lifespanSeconds: [6000, 8400],
    // Fry 0.8 cm, males 4 cm, females 5.5 cm.
    lengthPx: { baby: 18, young: 52, adultM: 90, adultF: 120 },
    swimSpeed: { baby: 60, young: 85, adult: 80 },
    hungerPerSec: { baby: 1 / 150, young: 1 / 200, adult: 1 / 260 },
    bioload: { baby: 0.004, young: 0.012, adult: 0.025 },
    crowding: { baby: 0.5, young: 0.75, adult: 1 },
    // Real: 21-30 days, about a third of the time to maturity.
    gestationSeconds: [240, 320],
    // Real: 5-20 for young females, 20-50 for large ones. Kept at the low end so one tank is not overrun.
    broodSize: [4, 14], storedBroods: [1, 2], eggSeconds: [0, 0],
    mouthPx: 46, eatsEggs: true, eatsShrimp: false, grazes: 0, scavenges: true, shoal: 0, aggression: peaceful,
    delicate: 1, nocturnal: false, breathesAir: false, scaleless: false, preferredLevel: [0.3, 0.92],
    notes: ['Hardy and always breeding: keep two or three females to each male.', 'Hungry adults eat fry, so plant the tank well.'],
};

/** A species that differs from the guppy only where it says so. */
const like = (base: SpeciesData, changes: Partial<SpeciesData>): SpeciesData => ({ ...base, ...changes });

const tearing = (tear: number, harm: number, extra: Partial<Aggression> = {}): Aggression =>
    ({ rivals: true, rivalSpecies: [], bulliesLongFins: false, nipsWhenFew: false, tear, harm, ...extra });

const endler = like(guppy, {
    name: "Endler's livebearer", plural: 'endlers',
    looks: { m: [{ sprite: 'endler_m', label: 'Black bar' }], f: [{ sprite: 'endler_f', label: 'Silver' }] },
    youngSprite: '', longFins: NO_FINS,
    // Males 2.5 cm, females 4 cm.
    lengthPx: { baby: 14, young: 36, adultM: 55, adultF: 88 },
    swimSpeed: { baby: 65, young: 95, adult: 95 },
    bioload: { baby: 0.003, young: 0.008, adult: 0.015 }, crowding: { baby: 0.3, young: 0.45, adult: 0.6 },
    broodSize: [3, 10], mouthPx: 26,
    notes: ['Smaller and quicker than guppies, and just as ready to breed.', 'Too small to bother anyone; bettas may chase the males.'],
});

const platy = like(guppy, {
    name: 'Platy', plural: 'platies',
    looks: {
        m: [{ sprite: 'platy_red', label: 'Red' }, { sprite: 'platy_sunset', label: 'Sunset' }],
        f: [{ sprite: 'platy_red', label: 'Red' }, { sprite: 'platy_sunset', label: 'Sunset' }],
    },
    youngSprite: '', longFins: NO_FINS,
    // Males 4.5 cm, females 6 cm, deep-bodied.
    lengthPx: { baby: 18, young: 56, adultM: 100, adultF: 130 },
    swimSpeed: { baby: 55, young: 75, adult: 70 },
    lifespanSeconds: [8000, 11000],
    bioload: { baby: 0.005, young: 0.016, adult: 0.035 }, crowding: { baby: 0.5, young: 1, adult: 1.5 },
    gestationSeconds: [260, 340], broodSize: [5, 16], mouthPx: 50, grazes: 0.00015, preferredLevel: [0.2, 0.8],
    notes: ['Calm, sturdy and peaceful: a good companion for guppies.', 'Picks at algae between meals.'],
});

const molly = like(guppy, {
    name: 'Molly', plural: 'mollies', diet: 'medium',
    looks: {
        m: [{ sprite: 'molly_black', label: 'Black' }, { sprite: 'molly_dalmatian', label: 'Dalmatian' }],
        f: [{ sprite: 'molly_black', label: 'Black' }, { sprite: 'molly_dalmatian', label: 'Dalmatian' }],
    },
    youngSprite: '', longFins: ['m'],
    // Males 7 cm, females 8.5 cm.
    lengthPx: { baby: 22, young: 80, adultM: 150, adultF: 185 },
    swimSpeed: { baby: 60, young: 85, adult: 85 },
    stageSeconds: { baby: 280, young: 440 }, lifespanSeconds: [9000, 12500],
    bioload: { baby: 0.006, young: 0.025, adult: 0.06 }, crowding: { baby: 0.6, young: 1.5, adult: 2.5 },
    gestationSeconds: [300, 400], broodSize: [6, 18], mouthPx: 60, grazes: 0.0004, delicate: 1.3,
    notes: ['A big, busy fish that grazes algae all day.', 'Makes a lot of waste and sulks in poor water: keep up with water changes.'],
});

const swordtail = like(guppy, {
    name: 'Swordtail', plural: 'swordtails', diet: 'medium',
    looks: { m: [{ sprite: 'sword_m', label: 'Green' }], f: [{ sprite: 'sword_f', label: 'Red' }] },
    youngSprite: '', longFins: ['m'],
    // Males 9 cm plus the sword, females 10 cm.
    lengthPx: { baby: 22, young: 90, adultM: 250, adultF: 220 },
    swimSpeed: { baby: 65, young: 100, adult: 105 },
    stageSeconds: { baby: 280, young: 460 }, lifespanSeconds: [9000, 12500],
    bioload: { baby: 0.006, young: 0.025, adult: 0.06 }, crowding: { baby: 0.6, young: 1.5, adult: 2.5 },
    gestationSeconds: [300, 400], broodSize: [6, 18], mouthPx: 62, aggression: tearing(0.05, 0.004), preferredLevel: [0.35, 0.9],
    notes: ['Fast and strong. Males spar: keep one male, or three or more so no one is singled out.', 'Large enough to eat most fry.'],
});

const corydoras: SpeciesData = {
    name: 'Corydoras', plural: 'corydoras', group: 'Bottom dwellers', body: 'fish', zone: 'bottom', spawning: 'stick', diet: 'bottom',
    looks: {
        m: [{ sprite: 'cory_bronze', label: 'Bronze' }, { sprite: 'cory_panda', label: 'Panda', scale: 0.8 }],
        f: [{ sprite: 'cory_bronze', label: 'Bronze' }, { sprite: 'cory_panda', label: 'Panda', scale: 0.8 }],
    },
    youngSprite: '', frySprite: 'fry', longFins: NO_FINS,
    stageSeconds: { baby: 300, young: 500 },
    // Real: 5 years and more.
    lifespanSeconds: [12000, 16000],
    // Bronze corys reach 6 cm; females are a little larger.
    lengthPx: { baby: 16, young: 60, adultM: 120, adultF: 135 },
    swimSpeed: { baby: 50, young: 70, adult: 70 },
    hungerPerSec: { baby: 1 / 160, young: 1 / 220, adult: 1 / 300 },
    bioload: { baby: 0.004, young: 0.015, adult: 0.035 }, crowding: { baby: 0.4, young: 0.9, adult: 1.5 },
    gestationSeconds: [500, 800], broodSize: [3, 8], storedBroods: [1, 1], eggSeconds: [150, 210],
    mouthPx: 0, eatsEggs: true, eatsShrimp: false, grazes: 0, scavenges: true, shoal: 5, aggression: peaceful,
    delicate: 1.1, nocturnal: false, breathesAir: true, scaleless: true, preferredLevel: [0, 0.12],
    notes: ['Roots through the gravel for leftovers and darts up for a gulp of air.', 'A shoaling fish: keep five or more.', 'Dislikes salt.'],
};

const pleco: SpeciesData = {
    ...corydoras,
    name: 'Bristlenose pleco', plural: 'plecos', zone: 'cling', spawning: 'cave', diet: 'grazer',
    looks: { m: [{ sprite: 'pleco', label: 'Spotted' }], f: [{ sprite: 'pleco', label: 'Spotted' }] },
    stageSeconds: { baby: 360, young: 700 }, lifespanSeconds: [15000, 20000],
    // 11-12 cm.
    lengthPx: { baby: 18, young: 90, adultM: 250, adultF: 230 },
    swimSpeed: { baby: 40, young: 55, adult: 55 },
    hungerPerSec: { baby: 1 / 200, young: 1 / 280, adult: 1 / 380 },
    bioload: { baby: 0.006, young: 0.03, adult: 0.09 }, crowding: { baby: 0.5, young: 1.5, adult: 4 },
    gestationSeconds: [700, 1000], broodSize: [4, 10], eggSeconds: [200, 280],
    eatsEggs: false, grazes: 0.0016, shoal: 0, aggression: tearing(0.02, 0.002), delicate: 1, nocturnal: true, breathesAir: false,
    preferredLevel: [0, 0.2],
    notes: ['The best algae eater there is; feed wafers when the glass is clean.', 'Hides by day and needs a cave or wood. One male per tank.', 'A heavy waste producer.'],
};

const oto: SpeciesData = {
    ...corydoras,
    name: 'Otocinclus', plural: 'otos', zone: 'cling', spawning: 'stick', diet: 'grazer',
    looks: { m: [{ sprite: 'oto', label: 'Common' }], f: [{ sprite: 'oto', label: 'Common' }] },
    stageSeconds: { baby: 300, young: 460 }, lifespanSeconds: [8000, 11000],
    // 4 cm.
    lengthPx: { baby: 14, young: 44, adultM: 82, adultF: 92 },
    swimSpeed: { baby: 55, young: 80, adult: 80 },
    bioload: { baby: 0.003, young: 0.008, adult: 0.015 }, crowding: { baby: 0.3, young: 0.5, adult: 0.8 },
    gestationSeconds: [800, 1200], broodSize: [2, 5], eggSeconds: [140, 200],
    eatsEggs: false, grazes: 0.0007, shoal: 4, delicate: 1.7, breathesAir: false, preferredLevel: [0, 0.6],
    notes: ['A tiny algae grazer that lives on the glass and leaves.', 'Delicate: wants clean, settled water and a group of four or more.', 'Dislikes salt.'],
};

const neon: SpeciesData = {
    ...guppy,
    name: 'Neon tetra', plural: 'neon tetras', group: 'Shoaling fish', spawning: 'scatter',
    looks: { m: [{ sprite: 'neon', label: 'Neon' }], f: [{ sprite: 'neon', label: 'Neon' }] },
    youngSprite: '', longFins: NO_FINS,
    stageSeconds: { baby: 300, young: 420 }, lifespanSeconds: [10000, 13500],
    // 3.2 cm.
    lengthPx: { baby: 12, young: 40, adultM: 68, adultF: 74 },
    swimSpeed: { baby: 60, young: 95, adult: 100 },
    bioload: { baby: 0.002, young: 0.006, adult: 0.012 }, crowding: { baby: 0.25, young: 0.4, adult: 0.6 },
    gestationSeconds: [500, 800], broodSize: [2, 6], storedBroods: [1, 1], eggSeconds: [120, 170],
    mouthPx: 24, eatsEggs: true, scavenges: false, shoal: 6,
    aggression: { rivals: false, rivalSpecies: [], bulliesLongFins: false, nipsWhenFew: true, tear: 0.03, harm: 0 },
    delicate: 1.3, preferredLevel: [0.25, 0.65],
    notes: ['Moves as one glittering shoal: keep six or more.', 'In ones and twos they hide, and may nip long fins.', 'Bettas and gouramis leave them alone.'],
};

const harlequin: SpeciesData = {
    ...neon,
    name: 'Harlequin rasbora', plural: 'harlequin rasboras',
    looks: { m: [{ sprite: 'harlequin', label: 'Harlequin' }], f: [{ sprite: 'harlequin', label: 'Harlequin' }] },
    // 4 cm.
    lengthPx: { baby: 12, young: 46, adultM: 84, adultF: 90 },
    swimSpeed: { baby: 60, young: 90, adult: 90 },
    bioload: { baby: 0.002, young: 0.008, adult: 0.015 }, crowding: { baby: 0.25, young: 0.5, adult: 0.8 },
    mouthPx: 26, delicate: 1.1, preferredLevel: [0.4, 0.8],
    aggression: null,
    notes: ['A calm, tight shoal for the upper water: keep six or more.', 'Lays its eggs under broad leaves.', 'One of the safest tank mates for a betta.'],
};

const betta: SpeciesData = {
    ...guppy,
    name: 'Betta', plural: 'bettas', group: 'Centrepiece fish', spawning: 'nest', diet: 'carnivore',
    looks: {
        m: [{ sprite: 'betta_m_red', label: 'Red halfmoon', scale: 1.3 }, { sprite: 'betta_m_blue', label: 'Blue' }],
        f: [{ sprite: 'betta_f', label: 'Plain' }],
    },
    youngSprite: '', longFins: ['m'],
    stageSeconds: { baby: 300, young: 480 }, lifespanSeconds: [7000, 9500],
    // 6.5 cm with fins; females 5 cm.
    lengthPx: { baby: 14, young: 60, adultM: 150, adultF: 110 },
    swimSpeed: { baby: 50, young: 70, adult: 60 },
    bioload: { baby: 0.004, young: 0.015, adult: 0.035 }, crowding: { baby: 0.4, young: 0.9, adult: 1.5 },
    gestationSeconds: [600, 900], broodSize: [4, 10], storedBroods: [1, 1], eggSeconds: [140, 190],
    mouthPx: 60, eatsEggs: true, eatsShrimp: true, scavenges: false,
    aggression: { rivals: true, rivalSpecies: ['gourami'], bulliesLongFins: true, nipsWhenFew: false, tear: 0.1, harm: 0.03 },
    breathesAir: true, preferredLevel: [0.5, 0.97],
    notes: ['One male per tank: two will fight to the death.', 'Takes bright, long-finned male guppies for rivals and tears their fins.', 'Eats shrimp and fry. Builds a bubble nest at the surface.'],
};

const gourami: SpeciesData = {
    ...betta,
    name: 'Dwarf gourami', plural: 'dwarf gouramis', diet: 'medium',
    looks: { m: [{ sprite: 'gourami_m', label: 'Striped' }], f: [{ sprite: 'gourami_f', label: 'Olive' }] },
    // 7 cm.
    lengthPx: { baby: 14, young: 64, adultM: 155, adultF: 135 },
    swimSpeed: { baby: 50, young: 65, adult: 60 },
    lifespanSeconds: [9000, 12000],
    bioload: { baby: 0.005, young: 0.02, adult: 0.045 }, crowding: { baby: 0.4, young: 1, adult: 2 },
    mouthPx: 56,
    aggression: { rivals: true, rivalSpecies: ['betta'], bulliesLongFins: false, nipsWhenFew: false, tear: 0.06, harm: 0.012 },
    preferredLevel: [0.35, 0.95],
    notes: ['A slow, curious fish for the upper water.', 'Males quarrel with each other and with bettas: keep a single male.', 'Eats shrimp and small fry.'],
};

const shrimp: SpeciesData = {
    ...guppy,
    name: 'Cherry shrimp', plural: 'cherry shrimp', group: 'Shrimp and snails', body: 'shrimp', zone: 'crawl', spawning: 'carry', diet: 'invert',
    looks: { m: [{ sprite: 'shrimp_cherry', label: 'Cherry', scale: 0.8 }], f: [{ sprite: 'shrimp_cherry', label: 'Cherry' }] },
    youngSprite: '', frySprite: 'shrimp_cherry', longFins: NO_FINS,
    stageSeconds: { baby: 200, young: 300 },
    // Real: about 18 months.
    lifespanSeconds: [4000, 5500],
    // 2.5 cm.
    lengthPx: { baby: 9, young: 30, adultM: 55, adultF: 55 },
    swimSpeed: { baby: 22, young: 30, adult: 30 },
    hungerPerSec: { baby: 1 / 240, young: 1 / 300, adult: 1 / 360 },
    bioload: { baby: 0.0005, young: 0.002, adult: 0.004 }, crowding: { baby: 0.05, young: 0.1, adult: 0.15 },
    gestationSeconds: [240, 320], broodSize: [5, 12], storedBroods: [1, 1],
    mouthPx: 0, eatsEggs: false, grazes: 0.0002, scavenges: true, delicate: 1.7, preferredLevel: [0, 0.1],
    notes: ['Cleans up leftovers and algae and breeds on its own.', 'Bettas and gouramis eat them; most fish eat the young. Give them moss and plants.', 'Medicine kills shrimp.'],
};

const snail: SpeciesData = {
    ...shrimp,
    name: 'Ramshorn snail', plural: 'ramshorn snails', body: 'snail', spawning: 'clutch',
    looks: { m: [{ sprite: 'snail_ramshorn', label: 'Brown' }], f: [{ sprite: 'snail_ramshorn', label: 'Brown' }] },
    frySprite: 'snail_ramshorn',
    stageSeconds: { baby: 180, young: 260 },
    // Real: about a year.
    lifespanSeconds: [3000, 4200],
    // 1.8 cm across.
    lengthPx: { baby: 7, young: 20, adultM: 40, adultF: 40 },
    swimSpeed: { baby: 6, young: 9, adult: 9 },
    gestationSeconds: [160, 240], broodSize: [3, 7], eggSeconds: [120, 180],
    eatsEggs: true, grazes: 0.0003, delicate: 0.7, preferredLevel: [0, 1],
    notes: ['Eats algae, leftovers and dead leaves.', 'Every well-fed snail lays eggs: overfeed the tank and they take it over.', 'Nothing here eats them. Medicine kills snails.'],
};

export const SPECIES: Record<string, SpeciesData> = {
    guppy, endler, platy, molly, swordtail, corydoras, pleco, oto, neon, harlequin, betta, gourami, shrimp, snail,
};

/** The order species appear in the Add fish menu. */
export const SPECIES_ORDER = Object.keys(SPECIES);

/** Every sprite sheet a species can show. */
export function speciesSprites(data: SpeciesData): string[] {
    const names = [...data.looks.m, ...data.looks.f].map((look) => look.sprite);
    return [...new Set([...names, data.frySprite, ...(data.youngSprite ? [data.youngSprite] : [])])];
}
