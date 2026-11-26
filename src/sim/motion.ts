import { BEHAVIOUR, TANK } from '../data/config';
import { SPECIES } from '../data/species';
import type { Fish } from './types';
import { ceilingY, clamp, floorY, lerp, lookOf, rand } from './util';

export const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by);

/** Screen length of an animal at the front glass, growing smoothly with age. */
export function bodyLength(f: Fish): number {
    const L = SPECIES[f.species].lengthPx;
    const adult = f.sex === 'm' ? L.adultM : L.adultF;
    const g = f.growth;
    const base = g < 1 ? lerp(L.baby, L.young, g) : lerp(L.young, adult, clamp(g - 1, 0, 1));
    // A variety's own size only shows once the animal is grown.
    const variety = lerp(1, lookOf(f.species, f.sex, f.genes).scale ?? 1, clamp(g - 1, 0, 1));
    return base * f.genes.size * variety;
}

/** How high above the gravel an animal's middle sits when it stands on the bottom. */
export const standing = (f: Fish): number => 4 + bodyLength(f) * 0.2;

export function setTarget(f: Fish, x: number, y: number, d: number): void {
    const margin = bodyLength(f) * 0.4;
    const low = SPECIES[f.species].zone === 'water' ? 14 : standing(f);
    const depth = clamp(d, 0.03, 0.97);
    f.tx = clamp(x, TANK.left + margin, TANK.right - margin);
    f.ty = clamp(y, floorY(depth, f.tx) + low, ceilingY(depth) - 12);
    f.td = depth;
}

// Fish do not glide at a steady pace: they flick the tail, coast, and flick again.
const DRAG = 2.6; // how quickly a coasting fish slows, per second

/** Swimming: tail kicks toward the target, turning round first when it lies behind. */
export function swim(f: Fish, dt: number, speed: number): void {
    const dx = f.tx - f.x;
    const dy = f.ty - f.y;
    const dd = Math.hypot(dx, dy) || 1;
    const arrive = clamp(dd / 50, 0, 1);
    const paused = f.pause > 0 || f.peck > 0;
    const wantX = paused ? 0 : (dx / dd) * speed * arrive;
    const wantY = paused ? 0 : (dy / dd) * speed * arrive * 0.75;

    // A fish cannot swim backwards: when it wants to go the other way it turns round first.
    if (f.turn > 0) {
        f.turn -= dt;
        if (f.turn <= 0) {
            f.turn = 0;
            f.facing = f.facing === 1 ? -1 : 1;
            f.kick = 0;
        }
    } else if (Math.abs(wantX) > 5 && Math.sign(wantX) !== f.facing) {
        f.turn = BEHAVIOUR.turnSeconds;
    }

    f.kick -= dt;
    if (f.kick <= 0 && f.turn <= 0) {
        const want = Math.hypot(wantX, wantY);
        if (want > 3) {
            // Faster swimming means harder and more frequent kicks; each one overshoots the wanted speed, then drag takes over.
            const gap = clamp(34 / want, 0.16, 0.7) * rand(0.7, 1.4);
            const push = 1 + DRAG * gap * 0.5;
            f.vx = lerp(f.vx, wantX * push, 0.85);
            f.vy = lerp(f.vy, wantY * push, 0.85) + rand(-0.06, 0.06) * want;
            f.kick = gap;
            f.beat = clamp(0.45 + want / 160, 0, 1);
        } else {
            f.kick = rand(0.3, 0.9);
            f.beat = Math.max(f.beat, 0.12); // sculling in place
            f.vy += rand(-4, 4);
        }
    }
    const slow = Math.exp(-DRAG * dt);
    f.vx *= slow;
    f.vy *= slow;
    f.beat *= Math.exp(-3.2 * dt);

    const forward = f.turn > 0 ? 0.3 : Math.sign(f.vx) === f.facing || Math.abs(f.vx) < 4 ? 1 : 0.2;
    f.x += f.vx * forward * dt;
    f.y += f.vy * dt + Math.sin(f.swimPhase * 0.21) * 1.6 * dt;
    const dive = f.mode === 'hide' ? BEHAVIOUR.hideDepthSpeed : 0.12; // a bolting fry darts between the stems
    f.d += clamp(f.td - f.d, -dive * dt, dive * dt);
    f.x = clamp(f.x, TANK.left + 10, TANK.right - 10);
    const low = SPECIES[f.species].zone === 'water' ? 8 : standing(f);
    f.y = clamp(f.y, floorY(f.d, f.x) + low, ceilingY(f.d) - 6);
    f.lean = 0;
    f.swimPhase += dt * (2.5 + 26 * f.beat);
}

const ON_BED = 14; // a target this close to the gravel means "walk along the bottom"

/** Crawling and clinging: a steady creep straight to the target, following the gravel when the way lies along it. */
const PLANE_APART = 0.04; // further apart than this in depth, two spots are on different surfaces
const LET_GO_SINK = 55; // px a second
const CROSS_PER_SEC = 0.2; // how fast a walker crosses the tank front to back

export function creep(f: Fish, dt: number, speed: number): void {
    // It cannot cross open water. Bound for another surface, it first climbs down to the gravel, walks across, then climbs.
    const bedHere = floorY(f.d, f.x) + standing(f);
    const elsewhere = Math.abs(f.td - f.d) > PLANE_APART;
    const descending = elsewhere && f.y > bedHere + 4;
    const dx = descending ? 0 : f.tx - f.x;
    const dy = (descending || elsewhere ? bedHere : f.ty) - f.y;
    const dd = Math.hypot(dx, dy);
    const moving = (dd > 2 || elsewhere) && f.pause <= 0 && f.peck <= 0 && speed > 0;
    f.turn = 0;
    if (moving && dd > 0.01) {
        // Coming down it simply lets go and sinks, which is quicker than any crawl.
        const pace = descending ? Math.max(speed, LET_GO_SINK) : speed;
        const step = Math.min(dd, pace * dt);
        f.vx = (dx / dd) * pace;
        f.vy = (dy / dd) * pace;
        f.x += (dx / dd) * step;
        f.y += (dy / dd) * step;
        if (Math.abs(dx) > 1) f.facing = dx > 0 ? 1 : -1;
    } else {
        f.vx = 0;
        f.vy = 0;
    }
    if (moving && !descending) f.d += clamp(f.td - f.d, -CROSS_PER_SEC * dt, CROSS_PER_SEC * dt);
    f.x = clamp(f.x, TANK.left + 10, TANK.right - 10);
    const bed = floorY(f.d, f.x) + standing(f);
    const alongBed = f.ty - floorY(f.td, f.tx) < standing(f) + ON_BED && f.y - bed < 30;
    if (f.y < bed || alongBed) f.y = bed;
    f.y = Math.min(f.y, ceilingY(f.d) - 6);
    // Off the gravel it is climbing glass, wood or a leaf: the body points the way it goes.
    if (moving) f.lean = f.y > bed + 6 ? Math.atan2(dy, Math.abs(dx)) : 0;
    else if (f.y <= bed + 6) f.lean = 0;
    f.beat = moving ? 0.25 : 0.03;
    f.swimPhase += dt * (1 + 14 * f.beat);
}
