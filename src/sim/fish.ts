import { BEHAVIOUR, DEATH, FOOD, TANK } from '../data/config';
import { DECOR } from '../data/decor';
import { FOODS } from '../data/foods';
import { SPECIES } from '../data/species';
import type { Decor, Env, Fish, Food, SimEvent, Tank } from './types';
import { stageOf } from './types';
import { ceilingY, chance, clamp, floorY, lerp, pick, rand } from './util';

const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by);

/** Screen length of a fish at the front glass, growing smoothly with age. */
export function bodyLength(f: Fish): number {
    const L = SPECIES[f.species].lengthPx;
    const adult = f.sex === 'm' ? L.adultM : L.adultF;
    const g = f.growth;
    const base = g < 1 ? lerp(L.baby, L.young, g) : lerp(L.young, adult, clamp(g - 1, 0, 1));
    return base * f.genes.size;
}

/** The space inside a plant or cave where a fry is out of sight. */
interface Shelter {
    x: number;
    y: number;
    rx: number;
    ry: number;
    d: number;
    cave: boolean;
}

function shelterOf(dc: Decor): Shelter | null {
    const data = DECOR[dc.kind];
    if (data.cover <= 0) return null;
    const base = floorY(dc.d, dc.x);
    // A plant shelters fry through its whole height; a cave only in its hollow.
    if (data.category === 'plant') {
        return { x: dc.x, y: base + data.height * 0.45, rx: data.cover * 0.8, ry: data.height * 0.4, d: dc.d, cave: false };
    }
    return { x: dc.x, y: base + data.height * 0.35, rx: data.cover, ry: data.cover, d: dc.d, cave: true };
}

function shelters(tank: Tank, caveOnly = false): Shelter[] {
    const found: Shelter[] = [];
    for (const dc of tank.decor) {
        const shelter = shelterOf(dc);
        if (shelter && (shelter.cave || !caveOnly)) found.push(shelter);
    }
    return found;
}

const within = (s: Shelter, x: number, y: number): boolean => ((x - s.x) / s.rx) ** 2 + ((y - s.y) / s.ry) ** 2 < 1;

/** Fry tucked into a plant or cave cannot be seen by hungry adults. */
export function isHidden(f: Fish, tank: Tank): boolean {
    return shelters(tank).some((s) => Math.abs(s.d - f.d) < BEHAVIOUR.coverDepth && within(s, f.x, f.y));
}

/** Aim for a spot well inside a shelter, low down where the growth is thickest. */
function tuckInto(f: Fish, s: Shelter): void {
    setTarget(f, s.x + rand(-0.45, 0.45) * s.rx, s.y + rand(-0.6, 0.25) * s.ry, s.d);
}

function canEat(f: Fish, food: Food): boolean {
    const stages = FOODS[food.type].eatenBy[f.species];
    return !!stages && stages.includes(stageOf(f));
}

function bestFood(f: Fish, tank: Tank): Food | null {
    let best: Food | null = null;
    let bestScore = 0;
    for (const food of tank.food) {
        if (!canEat(f, food)) continue;
        const dd = dist(f.x, f.y, food.x, food.y);
        if (dd > FOOD.seekRadius) continue;
        const score = FOODS[food.type].appeal / (120 + dd);
        if (score > bestScore) {
            bestScore = score;
            best = food;
        }
    }
    return best;
}

function nearestExposedFry(f: Fish, tank: Tank): Fish | null {
    let best: Fish | null = null;
    let bestD = BEHAVIOUR.huntSightRadius;
    for (const o of tank.fish) {
        if (o.mode === 'dead' || o.growth >= 0.8 || o.hidden) continue;
        const dd = dist(f.x, f.y, o.x, o.y);
        if (dd < bestD) {
            bestD = dd;
            best = o;
        }
    }
    return best;
}

function setTarget(f: Fish, x: number, y: number, d: number): void {
    const margin = bodyLength(f) * 0.4;
    f.tx = clamp(x, TANK.left + margin, TANK.right - margin);
    f.ty = clamp(y, floorY(d, x) + 14, ceilingY(d) - 12);
    f.td = clamp(d, 0.05, 0.95);
}

function wanderTarget(f: Fish, tank: Tank): void {
    const [lo, hi] = SPECIES[f.species].preferredLevel;
    const d = rand(0.08, 0.92);
    const bottom = floorY(d, f.x);
    const level = chance(0.2) ? rand(0.08, 1) : rand(lo, hi);
    let x = rand(TANK.left, TANK.right);
    let y = bottom + (TANK.surfaceY - bottom) * level;
    // Fry live in and around the plants when there are any, moving from one clump to the next.
    if (f.growth < 1 && chance(BEHAVIOUR.fryCoverHabit)) {
        const spots = shelters(tank);
        const close = spots.filter((spot) => Math.abs(spot.x - f.x) < BEHAVIOUR.fryRoam);
        if (spots.length > 0) {
            tuckInto(f, pick(close.length > 0 ? close : spots));
            return;
        }
    }
    // Guppies keep loose company: lean toward where the others are.
    const others = tank.fish.filter((o) => o !== f && o.mode !== 'dead');
    if (others.length > 0) {
        const cx = others.reduce((s, o) => s + o.x, 0) / others.length;
        const cy = others.reduce((s, o) => s + o.y, 0) / others.length;
        x = lerp(x, cx, BEHAVIOUR.schoolPull);
        y = lerp(y, cy, BEHAVIOUR.schoolPull);
    }
    setTarget(f, x, y, d);
}

/** Head for the shelter that can be reached soonest, preferring one that is not past the fish it is fleeing. */
function hideTarget(f: Fish, tank: Tank, caveOnly: boolean, from: Fish | null = null): boolean {
    let best: Shelter | null = null;
    let bestCost = Infinity;
    for (const s of shelters(tank, caveOnly)) {
        let cost = dist(f.x, f.y, s.x, s.y) + Math.abs(s.d - f.d) * BEHAVIOUR.depthCost;
        if (from && dist(from.x, from.y, s.x, s.y) < dist(f.x, f.y, s.x, s.y)) cost += BEHAVIOUR.pastThreatCost;
        if (cost < bestCost) {
            bestCost = cost;
            best = s;
        }
    }
    if (!best) return false;
    tuckInto(f, best);
    return true;
}

function forageTarget(f: Fish, tank: Tank): void {
    // Fry pick at the leaves they are hiding among rather than cross open water.
    if (f.growth < 1 && chance(0.5) && hideTarget(f, tank, false)) {
        f.pecks = 3;
        return;
    }
    if (tank.decor.length > 0 && chance(0.4)) {
        const dc = pick(tank.decor);
        const data = DECOR[dc.kind];
        setTarget(f, dc.x + rand(-0.4, 0.4) * data.width, floorY(dc.d, dc.x) + data.height * rand(0.1, 0.7), dc.d);
    } else {
        const d = rand(0.1, 0.9);
        setTarget(f, f.x + rand(-350, 350), floorY(d, f.x) + 16, d);
    }
    f.pecks = 3;
}

/** Decide what the fish wants to do. Runs a couple of times a second, not every frame. */
function decide(f: Fish, tank: Tank, env: Env): void {
    const stage = stageOf(f);
    const species = SPECIES[f.species];
    const reacting = f.mode === 'flee' || f.mode === 'approach' || f.mode === 'freeze';
    if (reacting && f.modeTime > 0) return;

    const enter = (mode: Fish['mode']): boolean => {
        const changed = f.mode !== mode;
        if (changed) {
            f.mode = mode;
            f.modeTime = 0;
            f.targetId = 0;
        }
        return changed;
    };

    if (env.gasping) {
        enter('gasp');
        setTarget(f, f.x + rand(-60, 60), TANK.surfaceY, f.d);
        return;
    }
    if (stage === 'baby') {
        // A hungry fry takes chances: it lets adults come much closer before it gives up feeding.
        const safe = BEHAVIOUR.frySafeDistance * (f.hunger > BEHAVIOUR.fryBoldAbove ? BEHAVIOUR.fryBoldFactor : 1);
        const threat = tank.fish.find((o) => o.mode !== 'dead' && o.growth >= 2
            && ((o.mode === 'hunt' && o.targetId === f.id) || dist(o.x, o.y, f.x, f.y) < safe));
        if (threat) {
            // Already out of sight: stay put until the adult has gone. Otherwise bolt for the nearest cover.
            if (f.hidden && f.mode === 'hide') return;
            if (hideTarget(f, tank, false, threat)) {
                enter('hide');
                return;
            }
        }
    }
    if (f.hunger > BEHAVIOUR.hungryAbove) {
        const food = bestFood(f, tank);
        if (food) {
            enter('food');
            f.targetId = food.id;
            return;
        }
    }
    if (env.night) {
        if (enter('rest') || chance(0.05)) {
            const d = rand(0.1, 0.9);
            if (!(stage === 'baby' && hideTarget(f, tank, false))) setTarget(f, f.x + rand(-200, 200), floorY(d, f.x) + rand(40, 160), d);
        }
        return;
    }
    if (stage === 'adult' && species.eatsOwnFry && f.hunger > BEHAVIOUR.huntAbove) {
        const fry = nearestExposedFry(f, tank);
        if (fry) {
            enter('hunt');
            f.targetId = fry.id;
            return;
        }
    }
    if (stage === 'adult' && f.sex === 'm' && env.canBreed && f.courtCooldown <= 0 && f.hunger < 0.5) {
        const mate = tank.fish.find((o) => o.sex === 'f' && o.species === f.species && stageOf(o) === 'adult'
            && o.mode !== 'dead' && !o.pregnancy && o.hunger < 0.5);
        if (mate) {
            enter('court');
            f.targetId = mate.id;
            return;
        }
    }
    if (f.hunger > BEHAVIOUR.forageAbove) {
        if (enter('forage')) forageTarget(f, tank);
        return;
    }
    if (stage === 'baby' && f.mode === 'hide' && chance(0.9)) return; // fry linger in cover
    if (enter('wander')) wanderTarget(f, tank);
}

/** Per-mode work: track moving targets, eat, peck, catch. Returns the speed multiplier. */
function act(f: Fish, tank: Tank, dt: number, events: SimEvent[]): number {
    const reach = BEHAVIOUR.huntCatchRadius + bodyLength(f) * 0.25;
    const near = dist(f.x, f.y, f.tx, f.ty) < reach;
    switch (f.mode) {
        case 'food': {
            const food = tank.food.find((o) => o.id === f.targetId);
            if (!food) {
                f.think = 0;
                return 1;
            }
            setTarget(f, food.x, food.y, food.d);
            if (dist(f.x, f.y, food.x, food.y) < FOOD.eatRadius + bodyLength(f) * 0.3 && Math.abs(f.d - food.d) < 0.2) {
                f.hunger = clamp(f.hunger - FOODS[food.type].nutrition, 0, 1);
                f.peck = 0.25;
                food.bites -= 1;
                events.push({ kind: 'ate', x: food.x, y: food.y });
                if (food.bites <= 0) tank.food.splice(tank.food.indexOf(food), 1);
                f.think = 0;
            }
            return 1.5;
        }
        case 'hunt': {
            const fry = tank.fish.find((o) => o.id === f.targetId);
            if (!fry || fry.hidden || fry.mode === 'dead') {
                f.mode = 'wander';
                f.think = 0;
                return 1;
            }
            setTarget(f, fry.x, fry.y, fry.d);
            f.modeTime += dt;
            const caught = dist(f.x, f.y, fry.x, fry.y) < reach && Math.abs(f.d - fry.d) < 0.2;
            if (caught && chance(BEHAVIOUR.huntCatchChance)) {
                tank.fish.splice(tank.fish.indexOf(fry), 1);
                f.hunger = clamp(f.hunger - 0.35, 0, 1);
                f.peck = 0.3;
                events.push({ kind: 'fryEaten', x: fry.x, y: fry.y });
            }
            // Fry are quick: a lunge that misses, or a long chase, and the adult loses interest for a while.
            if (caught || f.modeTime > BEHAVIOUR.huntGiveUpAfter) {
                f.mode = 'wander';
                f.modeTime = 99;
                f.think = BEHAVIOUR.huntRestSeconds;
            }
            return 1.7;
        }
        case 'court': {
            const mate = tank.fish.find((o) => o.id === f.targetId);
            if (!mate || mate.pregnancy || mate.mode === 'dead') {
                f.mode = 'wander';
                f.think = 0;
                return 1;
            }
            // Display just ahead of her, shimmying.
            setTarget(f, mate.x + mate.facing * 50 + Math.sin(tank.time * 6) * 14, mate.y - 10, mate.d);
            if (dist(f.x, f.y, mate.x, mate.y) < 110) f.modeTime += dt;
            if (f.modeTime > BEHAVIOUR.courtSeconds) {
                const gest = SPECIES[mate.species];
                if (chance(BEHAVIOUR.mateChance)) {
                    mate.pregnancy = {
                        timer: rand(gest.gestationSeconds[0], gest.gestationSeconds[1]),
                        broodsLeft: Math.round(rand(gest.storedBroods[0], gest.storedBroods[1])),
                        father: { ...f.genes }, dropping: 0, dropTimer: 0,
                    };
                    events.push({ kind: 'mated' });
                }
                f.courtCooldown = BEHAVIOUR.courtCooldown;
                f.mode = 'wander';
                f.think = 0;
            }
            return 1.3;
        }
        case 'forage':
            if (near && f.peck <= 0) {
                if (f.pecks > 0) {
                    f.peck = 0.5;
                    f.pecks -= 1;
                } else {
                    forageTarget(f, tank);
                }
            }
            return 0.8;
        case 'wander':
            if (near || f.modeTime > 14) {
                f.modeTime = 0;
                if (chance(0.3)) f.pause = rand(0.6, 2.5);
                wanderTarget(f, tank);
            }
            f.modeTime += dt;
            return 1;
        case 'flee':
        case 'approach':
            f.modeTime -= dt;
            return f.mode === 'flee' ? 2.4 : 1.2;
        case 'freeze':
            f.modeTime -= dt;
            return 0;
        case 'rest':
            return 0.25;
        case 'gasp':
            return 0.5;
        case 'hide':
            return near ? 0.15 : BEHAVIOUR.fryBoltSpeed;
        default:
            return 1;
    }
}

// Guppies do not glide at a steady pace: they flick the tail, coast, and flick again.
const DRAG = 2.6; // how quickly a coasting fish slows, per second

function move(f: Fish, dt: number, speed: number): void {
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
    f.y = clamp(f.y, floorY(f.d, f.x) + 8, ceilingY(f.d) - 6);
    f.swimPhase += dt * (2.5 + 26 * f.beat);
}

function updateDead(f: Fish, tank: Tank, dt: number): void {
    f.deadTime += dt;
    const bottom = floorY(f.d, f.x) + 6;
    if (f.deadTime < DEATH.floatAfter) {
        f.y = Math.max(bottom, f.y - DEATH.sinkSpeed * dt);
    } else {
        f.y = Math.min(TANK.surfaceY - 4, f.y + DEATH.floatSpeed * dt);
    }
    f.vx = 0;
    f.vy = 0;
    if (f.deadTime > DEATH.decayAfter) tank.fish.splice(tank.fish.indexOf(f), 1);
}

export function killFish(f: Fish, events: SimEvent[]): void {
    f.mode = 'dead';
    f.deadTime = 0;
    f.turn = 0;
    f.pregnancy = null;
    events.push({ kind: 'died', name: f.name });
}

export function updateFish(f: Fish, tank: Tank, env: Env, dt: number, events: SimEvent[]): void {
    if (f.mode === 'dead') {
        updateDead(f, tank, dt);
        return;
    }
    const species = SPECIES[f.species];
    const stage = stageOf(f);
    f.hunger = clamp(f.hunger + species.hungerPerSec[stage] * env.activity * dt, 0, 1);
    if (!f.frozen) {
        f.age += dt;
        if (f.growth < 2) {
            const stageTime = f.growth < 1 ? species.stageSeconds.baby : species.stageSeconds.young;
            // Growth needs food as well as time: a hungry fish grows at about a third of the pace.
            f.growth = Math.min(2, f.growth + (dt / stageTime) * lerp(1, 0.35, f.hunger));
        }
        if (tank.settings.oldAge && f.age >= f.lifespan) {
            killFish(f, events);
            return;
        }
    }
    f.courtCooldown = Math.max(0, f.courtCooldown - dt);
    f.pause = Math.max(0, f.pause - dt);
    f.peck = Math.max(0, f.peck - dt);
    f.hidden = stage === 'baby' && isHidden(f, tank);

    f.think -= dt;
    if (f.think <= 0) {
        f.think = rand(0.35, 0.65);
        decide(f, tank, env);
    }
    const multiplier = act(f, tank, dt, events);
    const old = f.age > f.lifespan * 0.85 ? 0.7 : 1;
    move(f, dt, species.swimSpeed[stage] * multiplier * env.activity * old);
}

/** A tap on the glass: every nearby fish reacts according to its temperament. */
export function reactToTap(f: Fish, tank: Tank, x: number, y: number): void {
    if (f.mode === 'dead' || dist(f.x, f.y, x, y) > BEHAVIOUR.tapRadius) return;
    f.targetId = 0;
    f.pause = 0;
    switch (f.temperament) {
        case 'bold':
        case 'curious':
            f.mode = 'approach';
            f.modeTime = f.temperament === 'bold' ? 4 : 6;
            setTarget(f, x + rand(-40, 40), y + rand(-30, 30), 0.9);
            break;
        case 'shy':
            f.mode = 'flee';
            f.modeTime = 5;
            if (!hideTarget(f, tank, true) && !hideTarget(f, tank, false)) setTarget(f, f.x + Math.sign(f.x - x || 1) * 500, f.y, 0.15);
            break;
        case 'skittish':
            f.mode = 'flee';
            f.modeTime = 2.5;
            setTarget(f, f.x + Math.sign(f.x - x || 1) * 420, f.y + rand(-120, 120), rand(0.1, 0.5));
            break;
        default:
            f.mode = 'freeze';
            f.modeTime = 1.5;
    }
}
