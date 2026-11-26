import { Light, Transform } from 'esengine';
import type { Entity, World } from 'esengine';
import { TANK, VIEW, WATER } from '../data/config';
import { DECOR } from '../data/decor';
import { game } from '../game/state';
import { waterQuality } from '../sim/tank';
import type { Clutch, Decor } from '../sim/types';
import { bedRise, ceilingY, floorY, lerp, shapeBed } from '../sim/util';
import { EntitySet, LAYER, layerOf, scaleOf, setTexture, shadeOf, spawnSprite, texture, updateSprite } from './sprites';
import type { Rgba } from './sprites';

// The tank as seen through its front pane (world units, origin at screen centre).
const GLASS = { inner: 930, outer: 960 }; // the side panes, seen edge-on
const RIM = { topFrom: 474, bottomTo: -512 }; // black trim above the air gap and under the gravel
const SUBSTRATE = { textureWidth: 2048, edgeRows: 26 }; // rows of the face picture that stand above the gravel line
// The bed is drawn in narrow upright slices so that its top can rise and fall.
const BED_STRIPS = 192;
const CAUSTIC_STRIPS = 96;
const SURFACE_BAND = 46; // how far down the mirrored underside of the surface reaches
const EQUIP_DEPTH = 0.08;
const FILTER_X = 838;
const HEATER_X = -850;
const HEATER_HEIGHT = 280; // on screen at the front glass; the width follows the photograph
const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };
const TRIM: Rgba = { r: 0.022, g: 0.024, b: 0.026, a: 1 };

interface Statics {
    background: Entity;
    floor: Entity[];
    face: Entity[];
    causticsA: Entity[];
    causticsB: Entity[];
    surfaceA: Entity;
    surfaceB: Entity;
    cloud: Entity;
    rays: Entity[];
    night: Entity;
    heater: Entity;
    filter: Entity;
    algae: { entity: Entity; x: number; y: number; size: number }[];
}

interface Bubble {
    entity: Entity;
    x: number;
    y: number;
    d: number;
    speed: number;
    size: number;
    phase: number;
    alive: boolean;
}

interface Mote {
    entity: Entity;
    x: number;
    y: number;
    d: number;
    phase: number;
}

interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

let statics: Statics | null = null;
const decorSet = new EntitySet();
const foodSet = new EntitySet();
const mulmSet = new EntitySet();
const clutchSet = new EntitySet();
const bubbles: Bubble[] = [];
const motes: Mote[] = [];
let bubbleDebt = 0;
let clock = 0;

const waterWidth = GLASS.inner * 2;
const WATER_RECT: Rect = { x: 0, y: (RIM.topFrom + RIM.bottomTo) / 2, w: waterWidth, h: RIM.topFrom - RIM.bottomTo };
const NIGHT_RECT: Rect = { ...WATER_RECT, w: GLASS.outer * 2 }; // the panes' edges go dark with the water
const strips = (count: number): number[] => Array.from({ length: count }, (_, i) => i);

/** One slice of the bed's top, from the front glass back to the far glass. */
function floorStrip(i: number, count: number): Rect {
    const x = -GLASS.inner + ((i + 0.5) * waterWidth) / count;
    const h = bedRise() + 6;
    return { x, y: floorY(1, x) + h / 2, w: waterWidth / count + 0.6, h };
}
const BAND_RECT: Rect = { x: 0, y: TANK.surfaceY - SURFACE_BAND / 2, w: waterWidth, h: SURFACE_BAND };
const CAUSTIC_TILES = { a: { x: 7, y: 0.5 }, b: { x: 5, y: 0.36 } };
// Shafts of lamp light, one sheet deep in the tank and one nearer the glass, so fish pass between them.
const RAYS = [{ d: 0.3, tile: 0.8, drift: 0.004, alpha: 0.2 }, { d: 0.8, tile: 0.55, drift: -0.003, alpha: 0.13 }];
const RAY_RECT: Rect = { x: 0, y: TANK.surfaceY - 380, w: waterWidth, h: 760 };
const HAZE_DEPTHS = [0.25, 0.55]; // thin veils of water colour: the further back, the more of them lie in front
const HAZE: Rgba = { r: 0.07, g: 0.12, b: 0.1, a: 0.16 };
const BAND_TILES = { a: { x: 1, y: 1 }, b: { x: 0.7, y: 1 } };

/** The glass, trim and dark room around the water: none of it ever changes. */
function buildFrame(world: World): void {
    const box = (name: string, x: number, y: number, w: number, h: number, color: Rgba): Entity =>
        spawnSprite(world, name, 'white', { x, y, w, h, layer: LAYER.frame, color });
    const far = 2000;
    const half = VIEW.height / 2;
    box('room-left', -GLASS.outer - far / 2, 0, far, far, BLACK);
    box('room-right', GLASS.outer + far / 2, 0, far, far, BLACK);
    box('room-top', 0, half + far / 2, far * 3, far, BLACK);
    box('room-bottom', 0, -half - far / 2, far * 3, far, BLACK);
    box('rim-top', 0, (RIM.topFrom + half) / 2, GLASS.outer * 2, half - RIM.topFrom, TRIM);
    box('rim-top-edge', 0, RIM.topFrom + 1.5, GLASS.outer * 2, 3, { r: 0.12, g: 0.13, b: 0.13, a: 1 });
    box('rim-bottom', 0, (RIM.bottomTo - half) / 2, GLASS.outer * 2, RIM.bottomTo + half, TRIM);
    box('rim-bottom-edge', 0, RIM.bottomTo - 1.5, GLASS.outer * 2, 3, { r: 0.1, g: 0.11, b: 0.11, a: 1 });
    const edgeWidth = GLASS.outer - GLASS.inner;
    for (const side of [-1, 1]) {
        spawnSprite(world, 'glass-edge', 'glass_edge', {
            x: side * (GLASS.inner + edgeWidth / 2), y: WATER_RECT.y, w: edgeWidth, h: WATER_RECT.h, layer: LAYER.glassEdge, flipX: side > 0,
        });
    }
    spawnSprite(world, 'glass', 'glass_reflection', { ...WATER_RECT, layer: LAYER.glass });
}

const bedTexture = (part: string): string => `${part}_${game.tank.settings.substrate}_${game.tank.settings.grain}`;
let bedLaid = '';

/** Put the gravel where the settings say. Only does any work when one of them has changed. */
function layBed(world: World): void {
    if (!statics) return;
    const s = game.tank.settings;
    const key = [s.substrate, s.grain, s.bedShape, s.bedDepth].join('|');
    if (key === bedLaid) return;
    bedLaid = key;
    const faceScale = waterWidth / SUBSTRATE.textureWidth;
    const faceHeight = texture(bedTexture('substrate')).height * faceScale;
    const { floor, face } = statics;
    floor.forEach((entity, i) => {
        const frame = { index: i, cols: BED_STRIPS, rows: 1 };
        const top = floorStrip(i, BED_STRIPS);
        setTexture(world, entity, bedTexture('floor'));
        updateSprite(world, entity, { ...top, layer: LAYER.floor, frame });
        setTexture(world, face[i], bedTexture('substrate'));
        updateSprite(world, face[i], {
            x: top.x, y: floorY(1, top.x) + SUBSTRATE.edgeRows * faceScale - faceHeight / 2, w: top.w, h: faceHeight, layer: LAYER.substrate, frame,
        });
    });
}

/** A sheet of moving light laid over the bed, slice by slice. */
function driftCaustics(world: World, entities: Entity[], tile: { x: number; y: number }, scroll: { x: number; y: number }, alpha: number): void {
    const count = entities.length;
    entities.forEach((entity, i) => {
        updateSprite(world, entity, {
            ...floorStrip(i, count), layer: LAYER.caustics, tile: { x: tile.x / count, y: tile.y }, scroll: { x: scroll.x + (i * tile.x) / count, y: scroll.y },
            color: { r: 1, g: 1, b: 1, a: alpha },
        });
    });
}

export function buildTank(world: World): void {
    const s = game.tank.settings;
    shapeBed(s.bedShape, s.bedDepth);
    bedLaid = '';
    const filterTex = texture('filter');
    const heaterTex = texture('heater_on');
    const equipScale = scaleOf(EQUIP_DEPTH) * 0.75;
    const heaterHeight = HEATER_HEIGHT * equipScale;
    const algae = [];
    for (let i = 0; i < 22; i++) {
        const entry = { x: lerp(TANK.left, TANK.right, Math.random()), y: lerp(-330, 380, Math.random()), size: lerp(200, 420, Math.random()) };
        algae.push({ ...entry, entity: spawnSprite(world, 'algae', 'algae', { ...entry, w: entry.size, h: entry.size, layer: LAYER.algae }) });
    }
    statics = {
        background: spawnSprite(world, 'background', s.background, { ...WATER_RECT, layer: LAYER.background }),
        floor: strips(BED_STRIPS).map(() => spawnSprite(world, 'floor', bedTexture('floor'), { x: 0, y: 0, w: 1, h: 1, layer: LAYER.floor })),
        face: strips(BED_STRIPS).map(() => spawnSprite(world, 'substrate', bedTexture('substrate'), { x: 0, y: 0, w: 1, h: 1, layer: LAYER.substrate })),
        // Two nets of light drifting across each other read as the moving surface above.
        causticsA: strips(CAUSTIC_STRIPS).map(() => spawnSprite(world, 'caustics-a', 'caustics_a', { x: 0, y: 0, w: 1, h: 1, layer: LAYER.caustics, material: 'additive' })),
        causticsB: strips(CAUSTIC_STRIPS).map(() => spawnSprite(world, 'caustics-b', 'caustics_b', { x: 0, y: 0, w: 1, h: 1, layer: LAYER.caustics, material: 'additive' })),
        surfaceA: spawnSprite(world, 'surface-a', 'surface', { ...BAND_RECT, layer: LAYER.ceiling, flipY: true, tile: BAND_TILES.a }),
        surfaceB: spawnSprite(world, 'surface-b', 'surface', { ...BAND_RECT, layer: LAYER.ceiling, flipY: true, tile: BAND_TILES.b }),
        rays: RAYS.map((ray) => spawnSprite(world, 'rays', 'rays', { ...RAY_RECT, layer: layerOf(ray.d), material: 'additive', tile: { x: ray.tile, y: 1 } })),
        cloud: spawnSprite(world, 'cloud', 'white', { ...WATER_RECT, layer: LAYER.cloud, color: { r: 0, g: 0, b: 0, a: 0 } }),
        night: spawnSprite(world, 'night', 'white', { ...NIGHT_RECT, layer: LAYER.night, material: 'multiply' }),
        heater: spawnSprite(world, 'heater', 'heater_on', {
            x: HEATER_X, y: TANK.surfaceY - 150, w: heaterHeight * (heaterTex.width / heaterTex.height), h: heaterHeight, layer: layerOf(EQUIP_DEPTH), color: shadeOf(EQUIP_DEPTH),
        }),
        filter: spawnSprite(world, 'filter', 'filter', {
            x: FILTER_X, y: TANK.surfaceY - (filterTex.height * equipScale) / 2 + 30, w: filterTex.width * equipScale, h: filterTex.height * equipScale,
            layer: layerOf(EQUIP_DEPTH), color: shadeOf(EQUIP_DEPTH),
        }),
        algae,
    };
    // The dry strip between the waterline and the rim, lit by the lamp above it.
    spawnSprite(world, 'air-gap', 'white', {
        x: 0, y: (TANK.surfaceY + RIM.topFrom) / 2, w: waterWidth, h: RIM.topFrom - TANK.surfaceY, layer: LAYER.ceiling, color: { r: 0.09, g: 0.1, b: 0.1, a: 1 },
    });
    // Light falls off with depth: multiplied over everything in the water.
    spawnSprite(world, 'light-fall', 'light_fall', { ...WATER_RECT, layer: LAYER.lightFall, material: 'multiply' });
    for (const d of HAZE_DEPTHS) spawnSprite(world, 'haze', 'white', { ...WATER_RECT, layer: layerOf(d), order: -5, color: HAZE });
    buildFrame(world);
    // The swaying-plant shader is a lit one: give it plain white light so plants show their own colours.
    const ambient = world.spawn('plant-light');
    world.insert(ambient, Transform, { position: { x: 0, y: 0, z: 0 } });
    world.insert(ambient, Light, { type: 2, color: { r: 1, g: 1, b: 1, a: 1 }, intensity: 1 });
    for (let i = 0; i < 34; i++) {
        const mote = { x: lerp(TANK.left, TANK.right, Math.random()), y: lerp(-380, 400, Math.random()), d: Math.random(), phase: Math.random() * 6 };
        motes.push({ ...mote, entity: spawnSprite(world, 'mote', 'mote', { x: mote.x, y: mote.y, w: 3, h: 3, layer: layerOf(mote.d) }) });
    }
}

function decorProps(dc: Decor): Rect {
    const data = DECOR[dc.kind];
    const scale = scaleOf(dc.d) * dc.size;
    const h = data.height * scale;
    // Everything sits a little way into the gravel rather than on top of it.
    return { x: dc.x, y: floorY(dc.d, dc.x) + h / 2 - Math.min(14, h * 0.06), w: data.width * scale, h };
}

function syncDecor(world: World): void {
    const decor = game.tank.decor;
    const byId = new Map(decor.map((dc) => [dc.id, dc]));
    decorSet.sync(world, decor.map((dc) => dc.id), (id) => {
        const dc = byId.get(id) as Decor;
        const data = DECOR[dc.kind];
        const p = decorProps(dc);
        return [
            spawnSprite(world, `decor-${id}`, data.sprite, { ...p, layer: layerOf(dc.d), material: data.category === 'plant' ? 'sway' : undefined }),
            spawnSprite(world, `decor-shadow-${id}`, 'shadow', { ...p, layer: LAYER.caustics }),
        ];
    });
    for (const dc of decor) {
        const held = dc.id === game.heldDecor;
        const p = decorProps(dc);
        const [sprite, shadow] = decorSet.get(dc.id);
        updateSprite(world, sprite, {
            ...p, layer: layerOf(dc.d), order: dc.id % 90, color: shadeOf(dc.d, held ? 0.75 : 1), flipX: dc.flip, rot: (dc.rot * Math.PI) / 180,
        });
        // Lit from straight above, things only darken the gravel right at their foot.
        updateSprite(world, shadow, {
            x: p.x, y: floorY(dc.d, dc.x) - 2, w: p.w * 1.05, h: Math.max(10, p.w * 0.1), layer: LAYER.caustics, order: 10,
            color: { r: 0, g: 0, b: 0, a: 0.55 },
        });
    }
}

function syncFoodAndMulm(world: World): void {
    const { food, mulm } = game.tank;
    const foodById = new Map(food.map((f) => [f.id, f]));
    foodSet.sync(world, food.map((f) => f.id), (id) => {
        const f = foodById.get(id);
        return [spawnSprite(world, 'food', f ? f.sprite : 'food_pellet', { x: 0, y: 0, w: 8, h: 8, layer: LAYER.depthFirst })];
    });
    for (const f of food) {
        const tex = texture(f.sprite);
        const scale = scaleOf(f.d) * 0.6;
        const fade = f.resting ? Math.min(1, f.restLeft / 6) : 1;
        updateSprite(world, foodSet.get(f.id)[0], {
            x: f.x, y: f.y, w: tex.width * scale, h: tex.height * scale, layer: layerOf(f.d), order: 2000,
            color: shadeOf(f.d, fade), rot: f.resting ? 0 : Math.sin(f.phase * 2) * 0.6,
        });
    }
    mulmSet.sync(world, mulm.map((m) => m.id), () =>
        [spawnSprite(world, 'mulm', 'mulm', { x: 0, y: 0, w: 30, h: 15, layer: LAYER.depthFirst })]);
    for (const m of mulm) {
        const scale = scaleOf(m.d);
        updateSprite(world, mulmSet.get(m.id)[0], {
            x: m.x, y: floorY(m.d, m.x) + 2, w: 30 * scale, h: 15 * scale, layer: layerOf(m.d), order: 1, color: shadeOf(m.d, 0.9),
        });
    }
}

// What eggs look like where they lie: [texture, width, height] at the front glass.
const CLUTCH_ART: Record<Clutch['kind'], [string, number, number]> = {
    scatter: ['eggs', 42, 28], stick: ['eggs', 42, 28], cave: ['eggs', 42, 28], nest: ['nest', 170, 42], clutch: ['clutch', 26, 26],
};
const FULL_CLUTCH = 12; // eggs at which a cluster is drawn at its full size

function syncClutches(world: World): void {
    const clutches = game.tank.clutches;
    const byId = new Map(clutches.map((c) => [c.id, c]));
    clutchSet.sync(world, clutches.map((c) => c.id), (id) => {
        const art = CLUTCH_ART[(byId.get(id) as Clutch).kind];
        return [spawnSprite(world, `clutch-${id}`, art[0], { x: 0, y: 0, w: 1, h: 1, layer: LAYER.depthFirst })];
    });
    for (const c of clutches) {
        const [, w, h] = CLUTCH_ART[c.kind];
        // A bubble nest is its full size from the start; a cluster of eggs shrinks as it is eaten.
        const fill = c.kind === 'nest' ? 1 : lerp(0.45, 1, Math.min(1, c.eggs / FULL_CLUTCH));
        const scale = scaleOf(c.d) * fill;
        // Eggs laid deep in a cave can only just be made out.
        const alpha = c.kind === 'cave' ? 0.45 : c.kind === 'nest' ? 0.85 : 0.95;
        updateSprite(world, clutchSet.get(c.id)[0], { x: c.x, y: c.y, w: w * scale, h: h * scale, layer: layerOf(c.d), order: 95, color: shadeOf(c.d, alpha) });
    }
}

function emitBubble(world: World, x: number, y: number, d: number): void {
    const spare = bubbles.find((b) => !b.alive);
    const size = lerp(3, 9, Math.random() ** 2);
    const values = { x, y, d, speed: lerp(150, 260, Math.random()), size, phase: Math.random() * 6, alive: true };
    if (spare) Object.assign(spare, values);
    else if (bubbles.length < 110) bubbles.push({ ...values, entity: spawnSprite(world, 'bubble', 'bubble', { x, y, w: size, h: size, layer: layerOf(d) }) });
}

function updateBubbles(world: World, dt: number): void {
    const s = game.tank.settings;
    bubbleDebt += dt;
    while (bubbleDebt > 0.045) {
        bubbleDebt -= 0.045;
        if (s.airOn) {
            for (const dc of game.tank.decor) {
                if (DECOR[dc.kind].category === 'bubbler' && dc.id !== game.heldDecor) {
                    emitBubble(world, dc.x + (Math.random() - 0.5) * 22 * scaleOf(dc.d), floorY(dc.d, dc.x) + 24, dc.d);
                }
            }
        }
        // The filter's outlet stirs the surface and pushes a few bubbles down.
        if (s.filterOn && Math.random() < 0.3) emitBubble(world, FILTER_X - 40 - Math.random() * 70, TANK.surfaceY - 50 - Math.random() * 40, EQUIP_DEPTH + 0.05);
    }
    for (const b of bubbles) {
        if (b.alive) {
            // Bigger bubbles rise faster and wobble more.
            b.y += b.speed * (0.7 + b.size / 14) * dt;
            b.phase += dt * 9;
            b.x += Math.sin(b.phase) * (10 + b.size * 2) * dt;
            if (b.y > ceilingY(b.d) - 3) b.alive = false;
        }
        const size = b.size * scaleOf(b.d);
        updateSprite(world, b.entity, {
            x: b.x, y: b.y, w: size * (1 + 0.12 * Math.sin(b.phase * 1.7)), h: size, layer: layerOf(b.d), order: 3000, color: shadeOf(b.d, b.alive ? 0.9 : 0),
        });
    }
    for (const m of motes) {
        m.phase += dt * 0.4;
        m.x += Math.sin(m.phase) * 5 * dt + (s.filterOn ? -4 * dt : 0);
        m.y += Math.cos(m.phase * 0.7) * 3 * dt - 1.5 * dt;
        if (m.x < TANK.left) m.x = TANK.right;
        if (m.y < -390) m.y = 400;
        const size = 2.6 * scaleOf(m.d);
        updateSprite(world, m.entity, { x: m.x, y: m.y, w: size, h: size, layer: layerOf(m.d), order: 2500, color: shadeOf(m.d, 0.28 + 0.2 * Math.sin(m.phase * 3)) });
    }
}

function updateStatics(world: World, dt: number, night: boolean): void {
    if (!statics) return;
    const tank = game.tank;
    const s = tank.settings;
    game.darkness += Math.max(-dt / 3, Math.min(dt / 3, (night ? 1 : 0) - game.darkness));
    const dark = game.darkness;

    setTexture(world, statics.background, s.background);
    layBed(world);

    // The lamp's ripples fade with the light.
    const lit = 1 - dark;
    driftCaustics(world, statics.causticsA, CAUSTIC_TILES.a, { x: clock * 0.021, y: clock * 0.012 }, 0.5 * lit);
    driftCaustics(world, statics.causticsB, CAUSTIC_TILES.b, { x: 1000 - clock * 0.016, y: clock * 0.009 }, 0.38 * lit);
    updateSprite(world, statics.surfaceA, { ...BAND_RECT, layer: LAYER.ceiling, flipY: true, tile: BAND_TILES.a, scroll: { x: clock * 0.012, y: 0 }, color: { r: 1, g: 1, b: 1, a: 0.9 } });
    updateSprite(world, statics.surfaceB, { ...BAND_RECT, layer: LAYER.ceiling, flipY: true, tile: BAND_TILES.b, scroll: { x: 1000 - clock * 0.019, y: 0 }, order: 1, color: { r: 1, g: 1, b: 1, a: 0.45 } });

    RAYS.forEach((ray, i) => {
        updateSprite(world, (statics as Statics).rays[i], {
            ...RAY_RECT, layer: layerOf(ray.d), order: -4, tile: { x: ray.tile, y: 1 }, scroll: { x: 1000 + clock * ray.drift, y: 0 },
            color: { r: 1, g: 1, b: 1, a: ray.alpha * lit },
        });
    });

    // Poor water turns cloudy and greenish long before it becomes dangerous.
    const murk = Math.max(0, (WATER.cloudyBelow - waterQuality(tank)) / WATER.cloudyBelow);
    updateSprite(world, statics.cloud, { ...WATER_RECT, layer: LAYER.cloud, color: { r: 0.42, g: 0.47, b: 0.3, a: murk * 0.6 } });
    // Night: only a little cold light from the room reaches the tank.
    updateSprite(world, statics.night, {
        ...NIGHT_RECT, layer: LAYER.night, color: { r: lerp(1, 0.13, dark), g: lerp(1, 0.17, dark), b: lerp(1, 0.27, dark), a: 1 },
    });
    setTexture(world, statics.heater, s.heaterOn && tank.temp < s.heaterTemp - 0.2 ? 'heater_on' : 'heater_off');
    for (const patch of statics.algae) {
        updateSprite(world, patch.entity, { x: patch.x, y: patch.y, w: patch.size, h: patch.size, layer: LAYER.algae, color: { r: 1, g: 1, b: 1, a: tank.algae * 0.85 } });
    }
}

/** Take down everything drawn for one tank's contents, for when a different tank comes on screen. */
export function clearTank(world: World): void {
    for (const set of [decorSet, foodSet, mulmSet, clutchSet]) set.sync(world, [], () => []);
    for (const b of bubbles) b.alive = false;
    bedLaid = '';
}

export function syncTank(world: World, dt: number, night: boolean): void {
    clock += dt;
    // Tanks that are not on screen run too, and each shapes the gravel its own way.
    shapeBed(game.tank.settings.bedShape, game.tank.settings.bedDepth);
    updateStatics(world, dt, night);
    syncDecor(world);
    syncFoodAndMulm(world);
    syncClutches(world);
    updateBubbles(world, dt);
}

/** The decoration under a point, front-most first. */
export function decorAt(x: number, y: number): Decor | null {
    let best: Decor | null = null;
    for (const dc of game.tank.decor) {
        const p = decorProps(dc);
        if (Math.abs(x - p.x) < p.w * 0.4 && Math.abs(y - p.y) < p.h * 0.5 && (!best || dc.d > best.d)) best = dc;
    }
    return best;
}
