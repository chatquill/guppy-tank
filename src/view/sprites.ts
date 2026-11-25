import { Sprite, Transform } from 'esengine';
import type { Entity, World } from 'esengine';
import { game } from '../game/state';
import type { TextureInfo } from '../game/state';
import { lerp } from '../sim/util';

export interface Rgba {
    r: number;
    g: number;
    b: number;
    a: number;
}

export const WHITE: Rgba = { r: 1, g: 1, b: 1, a: 1 };

// Draw layers, back to front. Things inside the water take a layer from their depth.
export const LAYER = {
    background: 0, ceiling: 2, floor: 3, caustics: 4, depthFirst: 10, depthSpan: 20, substrate: 32, lightFall: 34, cloud: 36,
    algae: 37, glassEdge: 38, night: 39, frame: 40, glass: 42, tools: 44,
};

export const layerOf = (d: number): number => LAYER.depthFirst + Math.round(d * LAYER.depthSpan);
/** Things further back are drawn smaller ... */
export const scaleOf = (d: number): number => lerp(0.72, 1, d);
/** ... and a little dimmer and cooler: clear water does not fog, it just soaks up light. */
export const shadeOf = (d: number, alpha = 1): Rgba =>
    ({ r: lerp(0.56, 1, d), g: lerp(0.66, 1, d), b: lerp(0.66, 1, d), a: alpha });

export function material(name: string): number {
    const found = game.materials.get(name);
    if (found === undefined) throw new Error(`Material not loaded: ${name}`);
    return found;
}

export function texture(name: string): TextureInfo {
    const found = game.textures.get(name);
    if (!found) throw new Error(`Texture not loaded: ${name}`);
    return found;
}

export interface SpriteProps {
    x: number;
    y: number;
    w: number;
    h: number;
    layer: number;
    order?: number;
    color?: Rgba;
    rot?: number; // radians
    flipX?: boolean;
    flipY?: boolean;
    frame?: { index: number; cols: number; rows: number };
    tile?: { x: number; y: number }; // repeat the texture this many times (needs a repeating texture)
    scroll?: { x: number; y: number }; // slide a repeating texture, in texture widths
    material?: string; // set once, when the sprite is made
}

function applySprite(world: World, entity: Entity, p: SpriteProps): void {
    world.update(entity, Transform, (t) => {
        t.position.x = p.x;
        t.position.y = p.y;
        const half = (p.rot ?? 0) / 2;
        t.rotation = { x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) };
    });
    world.update(entity, Sprite, (s) => {
        s.size = { x: p.w, y: p.h };
        s.layer = p.layer;
        s.order = p.order ?? 0;
        s.color = p.color ?? WHITE;
        s.flipX = p.flipX ?? false;
        s.flipY = p.flipY ?? false;
        if (p.frame) {
            const { index, cols, rows } = p.frame;
            // Sheets are laid out left to right, top to bottom; texture v runs upward.
            s.uvScale = { x: 1 / cols, y: 1 / rows };
            s.uvOffset = { x: (index % cols) / cols, y: 1 - (Math.floor(index / cols) + 1) / rows };
        } else if (p.tile) {
            s.uvScale = { x: p.tile.x, y: p.tile.y };
            if (p.scroll) s.uvOffset = { x: ((p.scroll.x % 1) + 1) % 1, y: ((p.scroll.y % 1) + 1) % 1 };
        }
    });
}

export function spawnSprite(world: World, name: string, textureName: string, p: SpriteProps): Entity {
    const entity = world.spawn(name);
    world.insert(entity, Transform, { position: { x: p.x, y: p.y, z: 0 } });
    world.insert(entity, Sprite, {
        texture: texture(textureName).handle, size: { x: p.w, y: p.h }, layer: p.layer,
        ...(p.material ? { material: material(p.material) } : {}),
    });
    applySprite(world, entity, p);
    return entity;
}

export const updateSprite = applySprite;

export function setTexture(world: World, entity: Entity, textureName: string): void {
    const handle = texture(textureName).handle;
    world.update(entity, Sprite, (s) => {
        if (s.texture !== handle) s.texture = handle;
    });
}

/**
 * Keeps one group of entities per simulation object: creates them when the
 * object appears, hands them back each frame for updating, and removes them
 * when the object is gone.
 */
export class EntitySet {
    private readonly items = new Map<number, Entity[]>();

    sync(world: World, ids: readonly number[], create: (id: number) => Entity[]): void {
        const live = new Set(ids);
        for (const [id, entities] of this.items) {
            if (live.has(id)) continue;
            for (const e of entities) if (world.valid(e)) world.despawn(e);
            this.items.delete(id);
        }
        for (const id of ids) if (!this.items.has(id)) this.items.set(id, create(id));
    }

    get(id: number): Entity[] {
        return this.items.get(id) ?? [];
    }

    replace(world: World, id: number, entities: Entity[]): void {
        for (const e of this.get(id)) if (world.valid(e)) world.despawn(e);
        this.items.set(id, entities);
    }
}

export function hslToRgb(h: number, s: number, l: number, a = 1): Rgba {
    const k = (n: number): number => (n + h * 12) % 12;
    const amp = s * Math.min(l, 1 - l);
    const f = (n: number): number => l - amp * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return { r: f(0), g: f(8), b: f(4), a };
}

export const mulColor = (a: Rgba, b: Rgba): Rgba => ({ r: a.r * b.r, g: a.g * b.g, b: a.b * b.b, a: a.a * b.a });
