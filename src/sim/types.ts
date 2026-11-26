import type { Sex, Stage } from '../data/species';

// The whole aquarium is one plain-JSON object so saving is JSON.stringify.
// The simulation mutates it in place each frame: it is the single owner of
// this state, and copying hundreds of objects sixty times a second buys nothing.

export interface Genes {
    male: number; // index into the species' male looks: what a male shows, and a female carries unseen
    female: number; // index into the female looks: what a female shows, and a male carries unseen
    size: number; // around 1
    tone: number; // how bright this individual's colours are, around 1
}

export type Temperament = 'bold' | 'curious' | 'shy' | 'skittish' | 'calm';
export type FishMode =
    | 'wander' | 'food' | 'forage' | 'hunt' | 'court' | 'hide' | 'graze' | 'raid' | 'chase' | 'guard' | 'build'
    | 'flee' | 'approach' | 'freeze' | 'rest' | 'gasp' | 'dead';
export type Illness = '' | 'ich' | 'finrot';

export interface Pregnancy {
    timer: number;
    broodsLeft: number;
    father: Genes;
    dropping: number; // fry still to be born in the birth under way
    dropTimer: number;
}

export interface Fish {
    id: number;
    name: string;
    species: string;
    sex: Sex;
    genes: Genes;
    temperament: Temperament;
    age: number;
    lifespan: number;
    growth: number; // 0..1 baby, 1..2 young, 2 adult
    frozen: boolean;
    hunger: number; // 0 full .. 1 starving (never lethal)
    health: number;
    stress: number; // 0 at ease .. 1 terrified
    torn: number; // fin damage, 0 whole .. 1 in rags
    illness: Illness;
    sick: number; // how far the illness has gone, 0..1
    chaseCooldown: number; // seconds until it picks another quarrel
    x: number;
    y: number;
    d: number; // depth: 0 back glass .. 1 front glass
    vx: number;
    vy: number;
    facing: 1 | -1;
    turn: number; // seconds left in a turn-around, 0 when not turning
    mode: FishMode;
    modeTime: number;
    think: number; // seconds until the next decision
    pause: number;
    tx: number;
    ty: number;
    td: number;
    targetId: number;
    peck: number;
    pecks: number;
    courtCooldown: number;
    pregnancy: Pregnancy | null;
    deadTime: number;
    hidden: boolean;
    swimPhase: number;
    kick: number; // seconds until the next tail kick
    beat: number; // how hard the tail is working right now, 0..1
    lean: number; // radians a climbing animal's body is tipped up or down
}

export interface Food {
    id: number;
    type: string;
    sprite: string;
    x: number;
    y: number;
    d: number;
    floatLeft: number;
    resting: boolean;
    restLeft: number;
    bites: number;
    phase: number;
}

export interface Decor {
    id: number;
    kind: string;
    x: number;
    d: number;
    flip: boolean;
    rot: number; // degrees
    size: number; // plants grow: a fraction of the sprite's full size. Everything else stays at 1
    runner: number; // seconds until a spreading plant sends out its next runner
}

/** Eggs somewhere in the tank: scattered in a plant, stuck to the glass, in a cave or under a bubble nest. */
export interface Clutch {
    id: number;
    species: string;
    kind: 'scatter' | 'stick' | 'cave' | 'nest' | 'clutch';
    x: number;
    y: number;
    d: number;
    eggs: number;
    hatch: number; // seconds until the eggs hatch (counts down once there are eggs)
    age: number;
    guard: number; // id of the male watching over it, 0 for none
    mother: Genes;
    father: Genes;
}

export interface Mulm {
    id: number;
    x: number;
    d: number;
}

export interface Settings {
    breeding: boolean;
    oldAge: boolean;
    speedIndex: number;
    illness: boolean;
    lightMode: 'auto' | 'on' | 'off' | 'clock'; // clock: lit during the real day
    heaterTemp: number; // one of HEATER_SETTINGS
    filterOn: boolean;
    heaterOn: boolean;
    airOn: boolean;
    substrate: string;
    grain: string; // one of BED.grains
    bedShape: string; // one of BED.shapes
    bedDepth: string; // a key of BED.depths
    background: string;
    volume: { filter: number; bubbles: number; feed: number; music: number };
}

export type SimEvent =
    | { kind: 'ate'; x: number; y: number }
    | { kind: 'born'; x: number; y: number }
    | { kind: 'died'; name: string }
    | { kind: 'fryEaten'; x: number; y: number }
    | { kind: 'mated' }
    | { kind: 'spawned'; x: number; y: number }
    | { kind: 'hatched'; x: number; y: number }
    | { kind: 'nipped'; x: number; y: number }
    | { kind: 'sick'; name: string };

export interface Tank {
    version: number;
    name: string;
    nextId: number;
    time: number;
    fish: Fish[];
    food: Food[];
    decor: Decor[];
    mulm: Mulm[];
    clutches: Clutch[];
    bucket: Fish[];
    waste: number; // dissolved, 0..100+
    mulmDebt: number; // fractional sediment waiting to become a visible speck
    oxygen: number; // 0..1
    temp: number;
    algae: number; // 0..1
    medicine: number; // seconds of treatment left in the water
    salt: number; // 0..1, diluted by water changes
    settings: Settings;
}

// What every fish needs to know about the tank this frame.
export interface Env {
    night: boolean;
    quality: number; // 1 clean .. 0 lethal
    gasping: boolean;
    overcrowded: boolean;
    activity: number; // slowed by cold water
    canBreed: boolean;
    medicated: boolean;
}

/** Everything that is saved: up to four tanks, and any fish waiting in the net between them. */
export interface SaveFile {
    version: number;
    current: number;
    tanks: Tank[];
    net: Fish[];
}

export const stageOf = (f: Fish): Stage => (f.growth < 1 ? 'baby' : f.growth < 2 ? 'young' : 'adult');
