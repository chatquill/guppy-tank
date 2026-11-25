import type { Entity, World } from 'esengine';
import { BEHAVIOUR } from '../data/config';
import { FEMALE_LOOKS, FRY_SPRITE, MALE_LOOKS, YOUNG_SPRITE } from '../data/strains';
import type { Look } from '../data/strains';
import { game } from '../game/state';
import { bodyLength } from '../sim/fish';
import type { Fish } from '../sim/types';
import { EntitySet, layerOf, scaleOf, setTexture, shadeOf, spawnSprite, updateSprite } from './sprites';

// Every fish sheet is 4 x 4 frames of one tail beat, cut from a photograph of a real guppy.
const SHEET = { cols: 4, rows: 4, frameW: 256, frameH: 160, frames: 16 };
const LENGTH_IN_FRAME = 0.92; // how much of a frame's width the fish spans
const COLOURS_FROM = 1.6; // growth at which a young male shows his adult colours
const EDGE_ON = 0.14; // how narrow a fish looks at the middle of a turn, facing the glass

const fishSet = new EntitySet();

/** The strain a fish belongs to, whether or not it is old enough to show it. */
export function lookOf(f: Fish): Look {
    return f.sex === 'm' ? MALE_LOOKS[f.genes.male % MALE_LOOKS.length] : FEMALE_LOOKS[f.genes.female % FEMALE_LOOKS.length];
}

function spriteOf(f: Fish): string {
    if (f.growth < 1) return FRY_SPRITE;
    // Males are plain like the females until they start to mature.
    if (f.sex === 'm' && f.growth < COLOURS_FROM) return YOUNG_SPRITE;
    return lookOf(f).sprite;
}

function createFish(world: World, f: Fish): Entity[] {
    return [spawnSprite(world, `fish-${f.id}`, spriteOf(f), { x: f.x, y: f.y, w: 10, h: 10, layer: layerOf(f.d) })];
}

export function syncFish(world: World): void {
    const fish = game.tank.fish;
    const byId = new Map(fish.map((f) => [f.id, f]));
    fishSet.sync(world, fish.map((f) => f.id), (id) => createFish(world, byId.get(id) as Fish));

    for (const f of fish) {
        const entity = fishSet.get(f.id)[0];
        const dead = f.mode === 'dead';
        setTexture(world, entity, spriteOf(f));

        // Turning round, the fish swings through facing the glass: it narrows to a sliver, then widens the other way.
        const turned = f.turn > 0 ? 1 - f.turn / BEHAVIOUR.turnSeconds : 0;
        const swing = Math.cos(turned * Math.PI);
        const facing = swing >= 0 ? f.facing : -f.facing;
        const width = (bodyLength(f) / LENGTH_IN_FRAME) * scaleOf(f.d);
        const height = width * (SHEET.frameH / SHEET.frameW) * (f.pregnancy ? 1.1 : 1);

        const tone = dead ? 0.7 : f.genes.tone;
        const shade = shadeOf(f.d);
        // Pecking tips the fish nose-down; the rest of the time it leans into its climb or dive.
        const tilt = f.peck > 0 ? -0.7 : Math.max(-0.45, Math.min(0.45, f.vy / 110));
        const frame = dead ? 0 : Math.floor((f.swimPhase / (Math.PI * 2)) * SHEET.frames) % SHEET.frames;
        updateSprite(world, entity, {
            x: f.x, y: f.y, w: width * Math.max(EDGE_ON, Math.abs(swing)), h: height, layer: layerOf(f.d), order: 100 + (f.id % 900),
            color: { r: shade.r * tone, g: shade.g * tone, b: shade.b * tone, a: dead ? 0.9 : 1 },
            rot: dead ? 0 : tilt * facing, flipX: facing < 0, flipY: dead,
            frame: { index: frame, cols: SHEET.cols, rows: SHEET.rows },
        });
    }
}

/** The fish under a point, nearest the front glass first. */
export function fishAt(x: number, y: number): Fish | null {
    let best: Fish | null = null;
    for (const f of game.tank.fish) {
        const reach = Math.max(22, bodyLength(f) * scaleOf(f.d) * 0.55);
        if (Math.abs(f.x - x) < reach && Math.abs(f.y - y) < Math.max(16, reach * 0.5) && (!best || f.d > best.d)) best = f;
    }
    return best;
}
