import type { Sex, Stage } from '../data/species';

// The whole aquarium is one plain-JSON object so saving is JSON.stringify.
// The simulation mutates it in place each frame: it is the single owner of
// this state, and copying hundreds of objects sixty times a second buys nothing.

export interface Genes {
    male: number; // index into MALE_LOOKS: the strain a male shows, and a female carries unseen
    female: number; // index into FEMALE_LOOKS: what a female shows, and a male carries unseen
    size: number; // around 1
    tone: number; // how bright this individual's colours are, around 1
}

export type Temperament = 'bold' | 'curious' | 'shy' | 'skittish' | 'calm';
export type FishMode =
    | 'wander' | 'food' | 'forage' | 'hunt' | 'court' | 'hide'
    | 'flee' | 'approach' | 'freeze' | 'rest' | 'gasp' | 'dead';

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
    lightMode: 'auto' | 'on' | 'off';
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
    | { kind: 'mated' };

export interface Tank {
    version: number;
    nextId: number;
    time: number;
    fish: Fish[];
    food: Food[];
    decor: Decor[];
    mulm: Mulm[];
    bucket: Fish[];
    waste: number; // dissolved, 0..100+
    mulmDebt: number; // fractional sediment waiting to become a visible speck
    oxygen: number; // 0..1
    temp: number;
    algae: number; // 0..1
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
}

export const stageOf = (f: Fish): Stage => (f.growth < 1 ? 'baby' : f.growth < 2 ? 'young' : 'adult');
