import type { Entity, World } from 'esengine';
import { BEHAVIOUR, SOCIAL } from '../data/config';
import { SPECIES } from '../data/species';
import { game } from '../game/state';
import { bodyLength } from '../sim/fish';
import type { Fish } from '../sim/types';
import { clamp, lookOf } from '../sim/util';
import { EntitySet, layerOf, scaleOf, setTexture, shadeOf, spawnSprite, updateSprite } from './sprites';
import type { SpriteProps } from './sprites';

// Every sheet is 4 x 4 frames of one tail beat, cut from a photograph of the real animal.
const SHEET = { cols: 4, rows: 4, frameW: 256, frameH: 160, frames: 16 };
const LENGTH_IN_FRAME = 0.92; // how much of a frame's width the animal spans
const COLOURS = { from: 1.15, to: 2 }; // growth over which a young male's adult colours come through
const EDGE_ON = 0.14; // how narrow a fish looks at the middle of a turn, facing the glass
const HIDDEN = { r: 1, g: 1, b: 1, a: 0 };

const fishSet = new EntitySet();
const has = (sheet: string): boolean => game.textures.has(sheet);

interface Sheets {
    body: string;
    over: string; // the adult colours showing through a young fish, '' when there is nothing to blend
    mix: number;
    spots: string; // white-spot sheet for this body, '' if it has none
}

function sheetsOf(f: Fish): Sheets {
    const species = SPECIES[f.species];
    if (f.growth < 1) return { body: species.frySprite, over: '', mix: 0, spots: '' };
    const look = lookOf(f.species, f.sex, f.genes).sprite;
    const ragged = `${look}_torn`;
    const adult = f.torn > SOCIAL.tornShownAbove && has(ragged) ? ragged : look;
    const spots = has(`${look}_ich`) ? `${look}_ich` : '';
    // Males are plain like the females at first; their colours come in little by little as they mature.
    if (species.youngSprite && f.sex === 'm' && f.growth < COLOURS.to) {
        return { body: species.youngSprite, over: adult, mix: clamp((f.growth - COLOURS.from) / (COLOURS.to - COLOURS.from), 0, 1), spots };
    }
    return { body: adult, over: '', mix: 0, spots };
}

function createFish(world: World, f: Fish): Entity[] {
    const sheets = sheetsOf(f);
    const blank = { x: f.x, y: f.y, w: 10, h: 10, layer: layerOf(f.d), color: HIDDEN };
    return [
        spawnSprite(world, `fish-${f.id}`, sheets.body, blank),
        spawnSprite(world, `fish-colours-${f.id}`, sheets.body, blank),
        spawnSprite(world, `fish-spots-${f.id}`, sheets.body, blank),
    ];
}

/** Take down every fish sprite, for when a different tank comes on screen. */
export function clearFish(world: World): void {
    fishSet.sync(world, [], () => []);
}

export function syncFish(world: World): void {
    const fish = game.tank.fish;
    const byId = new Map(fish.map((f) => [f.id, f]));
    fishSet.sync(world, fish.map((f) => f.id), (id) => createFish(world, byId.get(id) as Fish));

    for (const f of fish) {
        const [body, colours, spots] = fishSet.get(f.id);
        const dead = f.mode === 'dead';
        const isFish = SPECIES[f.species].body === 'fish';
        const sheets = sheetsOf(f);

        // Turning round, the fish swings through facing the glass: it narrows to a sliver, then widens the other way.
        const turned = f.turn > 0 ? 1 - f.turn / BEHAVIOUR.turnSeconds : 0;
        const swing = Math.cos(turned * Math.PI);
        const facing = swing >= 0 ? f.facing : -f.facing;
        const width = (bodyLength(f) / LENGTH_IN_FRAME) * scaleOf(f.d);
        // A sick fish holds its fins tight against its body.
        const clamped = 1 - 0.14 * clamp(f.sick * 1.5, 0, 1);
        const height = width * (SHEET.frameH / SHEET.frameW) * (f.pregnancy ? 1.1 : 1) * clamped;

        // Fear and illness wash the colour out.
        const tone = dead ? 0.7 : f.genes.tone * (1 - 0.22 * f.stress) * (1 - 0.15 * f.sick);
        const shade = shadeOf(f.d);
        // Pecking tips a fish nose-down; otherwise it leans into its climb or dive. Climbers point the way they go.
        const tilt = f.lean !== 0 ? f.lean : f.peck > 0 && isFish ? -0.7 : isFish ? Math.max(-0.45, Math.min(0.45, f.vy / 110)) : 0;
        const frame = dead ? 0 : Math.floor((f.swimPhase / (Math.PI * 2)) * SHEET.frames) % SHEET.frames;
        const props: SpriteProps = {
            x: f.x, y: f.y, w: width * Math.max(EDGE_ON, Math.abs(swing)), h: height, layer: layerOf(f.d), order: 100 + (f.id % 600) * 3,
            color: { r: shade.r * tone, g: shade.g * tone, b: shade.b * tone, a: dead ? 0.9 : 1 },
            rot: dead ? 0 : tilt * facing, flipX: facing < 0, flipY: dead && isFish,
            frame: { index: frame, cols: SHEET.cols, rows: SHEET.rows },
        };
        setTexture(world, body, sheets.body);
        updateSprite(world, body, props);
        if (sheets.over) setTexture(world, colours, sheets.over);
        updateSprite(world, colours, { ...props, order: (props.order ?? 0) + 1, color: { ...(props.color ?? HIDDEN), a: sheets.over ? sheets.mix : 0 } });
        const spotted = f.illness === 'ich' && sheets.spots !== '' && !dead;
        if (spotted) setTexture(world, spots, sheets.spots);
        updateSprite(world, spots, { ...props, order: (props.order ?? 0) + 2, color: { r: shade.r, g: shade.g, b: shade.b, a: spotted ? clamp(f.sick * 1.8, 0, 1) : 0 } });
    }
}

/** The animal under a point, nearest the front glass first. */
export function fishAt(x: number, y: number): Fish | null {
    let best: Fish | null = null;
    for (const f of game.tank.fish) {
        const reach = Math.max(22, bodyLength(f) * scaleOf(f.d) * 0.55);
        if (Math.abs(f.x - x) < reach && Math.abs(f.y - y) < Math.max(16, reach * 0.5) && (!best || f.d > best.d)) best = f;
    }
    return best;
}
