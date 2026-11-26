import { BEHAVIOUR, DEATH, EGGS, FOOD, HEALTH, SOCIAL, TANK } from '../data/config';
import { DECOR } from '../data/decor';
import { FOODS } from '../data/foods';
import { SPECIES } from '../data/species';
import { buildNest, conceive, findMate, raidable, wantsNest, wardOf } from './breeding';
import { killFish } from './health';
import { bodyLength, creep, dist, setTarget, standing, swim } from './motion';
import { hideTarget, isCovered, shelters, tuckInto } from './shelter';
import { company, longFinned, nip, pickRival, shoalLeader } from './social';
import type { Clutch, Env, Fish, Food, SimEvent, Tank } from './types';
import { stageOf } from './types';
import { ceilingY, chance, clamp, floorY, lerp, pick, rand } from './util';

export { bodyLength } from './motion';
export { killFish } from './health';

const FRONT_GLASS = 0.97;
const BACK_GLASS = 0.03;
const NEAR_BED = 200; // a bottom feeder takes sinking food once it is this close to the gravel
const GRAZE_SECONDS = 7;

const alive = (f: Fish): boolean => f.mode !== 'dead';
const walks = (f: Fish): boolean => SPECIES[f.species].zone === 'crawl' || SPECIES[f.species].zone === 'cling';

function canEat(f: Fish, food: Food): boolean {
    const species = SPECIES[f.species];
    const stages = FOODS[food.type].eatenBy[species.diet];
    if (!stages || !stages.includes(stageOf(f))) return false;
    if (food.resting) return species.scavenges;
    if (species.zone === 'water') return true;
    return species.zone === 'bottom' && food.floatLeft <= 0 && food.y - floorY(food.d, food.x) < NEAR_BED;
}

function bestFood(f: Fish, tank: Tank): Food | null {
    const species = SPECIES[f.species];
    // A slow animal does not set out for food it could never reach before it is gone.
    const reach = species.zone === 'water' ? FOOD.seekRadius : Math.min(FOOD.seekRadius, species.swimSpeed.adult * 30);
    let best: Food | null = null;
    let bestScore = 0;
    for (const food of tank.food) {
        if (!canEat(f, food)) continue;
        const dd = dist(f.x, f.y, food.x, food.y);
        if (dd > reach) continue;
        const score = FOODS[food.type].appeal / (120 + dd);
        if (score > bestScore) {
            bestScore = score;
            best = food;
        }
    }
    return best;
}

/** Could this hunter swallow that animal? Fry of any kind, shrimplets, and for a few fish grown shrimp too. */
export function isPrey(hunter: Fish, prey: Fish): boolean {
    const species = SPECIES[hunter.species];
    const kind = SPECIES[prey.species];
    if (hunter === prey || species.mouthPx <= 0 || stageOf(hunter) !== 'adult' || kind.body === 'snail') return false;
    if (prey.growth >= 1 && !(kind.body === 'shrimp' && species.eatsShrimp)) return false;
    return bodyLength(prey) < species.mouthPx;
}

function nearestPrey(f: Fish, tank: Tank): Fish | null {
    let best: Fish | null = null;
    let bestD = BEHAVIOUR.huntSightRadius;
    for (const o of tank.fish) {
        if (!alive(o) || o.hidden || !isPrey(f, o)) continue;
        const dd = dist(f.x, f.y, o.x, o.y);
        if (dd < bestD) {
            bestD = dd;
            best = o;
        }
    }
    return best;
}

function nearestEggs(f: Fish, tank: Tank): Clutch | null {
    let best: Clutch | null = null;
    let bestD = EGGS.raidSight;
    for (const c of tank.clutches) {
        if (!raidable(c, tank) || c.guard === f.id) continue;
        // Eggs dropped into a thicket are easy to miss.
        if (c.kind === 'scatter' && isCovered(tank, c.x, c.y, c.d) && chance(EGGS.hiddenInPlant)) continue;
        const dd = dist(f.x, f.y, c.x, c.y);
        if (dd < bestD) {
            bestD = dd;
            best = c;
        }
    }
    return best;
}

/** A place to sit for animals that live on surfaces: the glass, a rock or leaf, or the gravel. */
function perchTarget(f: Fish, tank: Tank): void {
    const glassShare = SPECIES[f.species].body === 'shrimp' ? 0.05 : 0.3;
    const roll = rand();
    if (roll < glassShare) {
        const d = chance(0.75) ? FRONT_GLASS : BACK_GLASS;
        const x = f.x + rand(-220, 220);
        setTarget(f, x, rand(floorY(d, x) + 40, ceilingY(d) - 50), d);
    } else if (roll < glassShare + 0.35 && tank.decor.length > 0) {
        const dc = pick(tank.decor);
        const data = DECOR[dc.kind];
        setTarget(f, dc.x + rand(-0.3, 0.3) * data.width * dc.size, floorY(dc.d, dc.x) + data.height * dc.size * rand(0.1, 0.7), dc.d + 0.02);
    } else {
        const d = rand(0.1, 0.95);
        const x = f.x + rand(-320, 320);
        setTarget(f, x, floorY(d, x), d);
    }
}

function wanderTarget(f: Fish, tank: Tank): void {
    const species = SPECIES[f.species];
    if (walks(f)) {
        perchTarget(f, tank);
        return;
    }
    // A shoal goes where its leader goes, each fish a little to one side.
    // Corydoras nose along the gravel, and now and then one dashes up for a gulp of air.
    if (species.zone === 'bottom' && species.breathesAir && chance(0.04)) {
        setTarget(f, f.x + rand(-60, 60), TANK.surfaceY, f.d);
        return;
    }
    const leader = shoalLeader(f, tank);
    if (leader && dist(f.x, f.y, leader.x, leader.y) < SOCIAL.shoalRadius * 3) {
        const spread = SOCIAL.shoalSpread;
        const x = leader.tx + rand(-spread, spread);
        const depth = clamp(leader.td + rand(-0.12, 0.12), 0.05, 0.95);
        // A shoal of bottom fish stays on the bottom, wherever its leader happens to be heading.
        setTarget(f, x, species.zone === 'bottom' ? floorY(depth, x) : leader.ty + rand(-spread, spread) * 0.5, depth);
        return;
    }
    const d = rand(0.08, 0.92);
    if (species.zone === 'bottom') {
        setTarget(f, f.x + rand(-450, 450), floorY(d, f.x), d);
        return;
    }
    const [lo, hi] = species.preferredLevel;
    const bottom = floorY(d, f.x);
    const level = chance(0.2) ? rand(0.08, 1) : rand(lo, hi);
    let x = rand(TANK.left, TANK.right);
    let y = bottom + (TANK.surfaceY - bottom) * level;
    // Fry live in and around the plants when there are any, moving from one clump to the next.
    // So does a shoaling fish kept without a shoal.
    const timid = f.growth < 1 || (species.shoal > 0 && company(f, tank) < species.shoal);
    if (timid && chance(BEHAVIOUR.fryCoverHabit)) {
        const spots = shelters(tank);
        const close = spots.filter((spot) => Math.abs(spot.x - f.x) < BEHAVIOUR.fryRoam);
        if (spots.length > 0) {
            tuckInto(f, pick(close.length > 0 ? close : spots));
            return;
        }
    }
    // Most fish keep loose company: lean toward where the others of their kind are.
    const others = tank.fish.filter((o) => o !== f && alive(o) && o.species === f.species);
    if (others.length > 0) {
        const cx = others.reduce((s, o) => s + o.x, 0) / others.length;
        const cy = others.reduce((s, o) => s + o.y, 0) / others.length;
        x = lerp(x, cx, BEHAVIOUR.schoolPull);
        y = lerp(y, cy, BEHAVIOUR.schoolPull);
    }
    setTarget(f, x, y, d);
}

function forageTarget(f: Fish, tank: Tank): void {
    const species = SPECIES[f.species];
    // Fry pick at the leaves they are hiding among rather than cross open water.
    if (f.growth < 1 && species.zone === 'water' && chance(0.5) && hideTarget(f, tank, false)) {
        f.pecks = 3;
        return;
    }
    // Shrimp and snails clear up the dirt that settles on the gravel.
    if (species.body !== 'fish' && tank.mulm.length > 0 && chance(0.6)) {
        const speck = pick(tank.mulm);
        if (Math.abs(speck.x - f.x) < 500) {
            setTarget(f, speck.x, floorY(speck.d, speck.x), speck.d);
            f.pecks = 2;
            return;
        }
    }
    const leader = shoalLeader(f, tank);
    if (walks(f)) {
        perchTarget(f, tank);
    } else if (leader) {
        // A shoal feeds as it travels: together.
        const x = leader.tx + rand(-SOCIAL.shoalSpread, SOCIAL.shoalSpread);
        const depth = clamp(leader.td + rand(-0.12, 0.12), 0.05, 0.95);
        setTarget(f, x, species.zone === 'bottom' ? floorY(depth, x) + 16 : leader.ty + rand(-40, 40), depth);
    } else if (tank.decor.length > 0 && chance(0.4) && species.zone === 'water') {
        const dc = pick(tank.decor);
        const data = DECOR[dc.kind];
        setTarget(f, dc.x + rand(-0.4, 0.4) * data.width, floorY(dc.d, dc.x) + data.height * dc.size * rand(0.1, 0.7), dc.d);
    } else {
        const d = rand(0.1, 0.9);
        setTarget(f, f.x + rand(-350, 350), floorY(d, f.x) + 16, d);
    }
    f.pecks = 3;
}

/** A patch of algae to work on: the front glass for those that cling to it, anywhere in reach for the rest. */
function grazeTarget(f: Fish, tank: Tank): void {
    // Shrimp and snails pick over rocks, leaves and gravel far more than they climb the glass.
    if (SPECIES[f.species].zone === 'crawl' && chance(SPECIES[f.species].body === 'shrimp' ? 0.9 : 0.6)) {
        perchTarget(f, tank);
        return;
    }
    const d = walks(f) ? FRONT_GLASS : 0.92;
    const x = f.x + rand(-260, 260);
    setTarget(f, x, rand(floorY(d, x) + 40, ceilingY(d) - 60), d);
}

function runFrom(f: Fish, tank: Tank, threat: Fish): void {
    f.mode = 'flee';
    f.modeTime = 2.5;
    f.targetId = 0;
    f.pause = 0;
    if (!hideTarget(f, tank, false, threat)) setTarget(f, f.x + Math.sign(f.x - threat.x || 1) * 450, f.y + rand(-150, 150), f.d);
}

/** Decide what the animal wants to do. Runs a couple of times a second, not every frame. */
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

    if (env.gasping && species.body === 'fish' && !species.breathesAir) {
        enter('gasp');
        setTarget(f, f.x + rand(-60, 60), TANK.surfaceY, f.d);
        return;
    }
    if (stage === 'baby' || species.body === 'shrimp') {
        // A hungry fry takes chances: it lets adults come much closer before it gives up feeding.
        const safe = BEHAVIOUR.frySafeDistance * (f.hunger > BEHAVIOUR.fryBoldAbove ? BEHAVIOUR.fryBoldFactor : 1);
        const threat = tank.fish.find((o) => alive(o) && isPrey(o, f)
            && ((o.mode === 'hunt' && o.targetId === f.id) || dist(o.x, o.y, f.x, f.y) < safe));
        if (threat) {
            // Already out of sight: stay put until the hunter has gone. Otherwise bolt for the nearest cover.
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
    if (species.nocturnal ? !env.night : env.night) {
        if (enter('rest') || chance(0.05)) {
            const d = rand(0.1, 0.9);
            // A pleco spends the day in its cave; fry sleep in the plants; snails and shrimp stay where they are.
            const tucked = (species.nocturnal && hideTarget(f, tank, true)) || (stage === 'baby' && hideTarget(f, tank, false));
            if (!tucked && !walks(f)) setTarget(f, f.x + rand(-200, 200), floorY(d, f.x) + rand(40, 160), d);
        }
        return;
    }
    const ward = wardOf(f, tank);
    if (ward) {
        // A male on eggs, or with a nest ready, drives off whatever comes near and otherwise stays close.
        // Until she has spawned, a female of his own kind is welcome.
        const welcome = (o: Fish): boolean => ward.eggs <= 0 && o.species === f.species && o.sex === 'f';
        const intruder = tank.fish.find((o) => o !== f && alive(o) && !o.hidden && o.growth >= 1 && SPECIES[o.species].body === 'fish'
            && !welcome(o) && dist(o.x, o.y, ward.x, ward.y) < SOCIAL.guardRadius);
        if (intruder && f.chaseCooldown <= 0) {
            enter('chase');
            f.targetId = intruder.id;
            return;
        }
        if (ward.eggs > 0 || !findMate(f, tank, env)) {
            enter('guard');
            setTarget(f, ward.x + rand(-50, 50), ward.y - rand(20, 60), ward.d);
            return;
        }
    }
    const rival = pickRival(f, tank);
    if (rival) {
        enter('chase');
        f.targetId = rival.id;
        return;
    }
    if (species.mouthPx > 0 && stage === 'adult' && f.hunger > BEHAVIOUR.huntAbove) {
        const prey = nearestPrey(f, tank);
        if (prey) {
            enter('hunt');
            f.targetId = prey.id;
            return;
        }
    }
    if (species.eatsEggs && stage !== 'baby' && f.hunger > BEHAVIOUR.huntAbove) {
        const eggs = nearestEggs(f, tank);
        if (eggs) {
            enter('raid');
            f.targetId = eggs.id;
            return;
        }
    }
    const mate = findMate(f, tank, env);
    if (mate) {
        enter('court');
        f.targetId = mate.id;
        return;
    }
    if (wantsNest(f, tank, env) && f.hunger < 0.5) {
        if (enter('build')) setTarget(f, f.x + rand(-250, 250), TANK.surfaceY, rand(0.3, 0.8));
        return;
    }
    if (species.grazes > 0 && tank.algae > 0.03 && f.hunger > 0.15) {
        if (enter('graze')) grazeTarget(f, tank);
        return;
    }
    if (f.hunger > BEHAVIOUR.forageAbove) {
        if (enter('forage')) forageTarget(f, tank);
        return;
    }
    if (stage === 'baby' && f.mode === 'hide' && chance(0.9)) return; // fry linger in cover
    if (enter('wander')) wanderTarget(f, tank);
}

function stop(f: Fish, think = 0): number {
    f.mode = 'wander';
    f.modeTime = 99;
    f.think = think;
    return 1;
}

function chase(f: Fish, tank: Tank, dt: number, events: SimEvent[]): number {
    const victim = tank.fish.find((o) => o.id === f.targetId);
    if (!victim || !alive(victim) || victim.hidden) return stop(f);
    const ward = wardOf(f, tank);
    const guarding = !!ward && dist(victim.x, victim.y, ward.x, ward.y) < SOCIAL.guardRadius * 1.5;
    setTarget(f, victim.x, victim.y, victim.d);
    f.modeTime += dt;
    victim.stress = clamp(victim.stress + SOCIAL.chasedStress * dt, 0, 1);
    if (victim.mode !== 'flee' && victim.mode !== 'hide') runFrom(victim, tank, f);
    const close = dist(f.x, f.y, victim.x, victim.y) < SOCIAL.nipRadius + bodyLength(f) * 0.3 && Math.abs(f.d - victim.d) < 0.2;
    if (close && f.peck <= 0) {
        nip(f, victim, guarding, events);
        f.peck = 0.5;
    }
    if (f.modeTime > SOCIAL.chaseSeconds) {
        // Two males of a fighting species give each other no peace; everyone else is left alone for a while.
        const feud = !guarding && victim.species === f.species;
        f.chaseCooldown = rand(SOCIAL.chaseCooldown[0], SOCIAL.chaseCooldown[1]) * (feud ? 0.4 : guarding ? 0.25 : 1);
        return stop(f);
    }
    return 2.4;
}

function raid(f: Fish, tank: Tank, dt: number): number {
    const eggs = tank.clutches.find((c) => c.id === f.targetId);
    if (!eggs || !raidable(eggs, tank)) return stop(f);
    setTarget(f, eggs.x, eggs.y, eggs.d);
    f.modeTime += dt;
    if (dist(f.x, f.y, eggs.x, eggs.y) < 24 + bodyLength(f) * 0.3 && Math.abs(f.d - eggs.d) < 0.2) {
        const eaten = Math.min(eggs.eggs, EGGS.eatPerSec * dt);
        eggs.eggs -= eaten;
        f.hunger = clamp(f.hunger - eaten * 0.03, 0, 1);
        if (f.peck <= 0) f.peck = 0.3;
    }
    return f.modeTime > 8 || f.hunger <= 0.05 ? stop(f, 2) : 1.2;
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
            const prey = tank.fish.find((o) => o.id === f.targetId);
            if (!prey || prey.hidden || !alive(prey)) return stop(f);
            setTarget(f, prey.x, prey.y, prey.d);
            f.modeTime += dt;
            const caught = dist(f.x, f.y, prey.x, prey.y) < reach && Math.abs(f.d - prey.d) < 0.2;
            if (caught && chance(BEHAVIOUR.huntCatchChance)) {
                tank.fish.splice(tank.fish.indexOf(prey), 1);
                f.hunger = clamp(f.hunger - 0.35, 0, 1);
                f.peck = 0.3;
                events.push({ kind: 'fryEaten', x: prey.x, y: prey.y });
            }
            // Fry are quick: a lunge that misses, or a long chase, and the hunter loses interest for a while.
            if (caught || f.modeTime > BEHAVIOUR.huntGiveUpAfter) return stop(f, BEHAVIOUR.huntRestSeconds) * 1.7;
            return 1.7;
        }
        case 'chase':
            return chase(f, tank, dt, events);
        case 'raid':
            return raid(f, tank, dt);
        case 'court': {
            const mate = tank.fish.find((o) => o.id === f.targetId);
            if (!mate || mate.pregnancy || !alive(mate)) return stop(f);
            const laysEggs = SPECIES[f.species].spawning !== 'live' && SPECIES[f.species].spawning !== 'carry';
            if (laysEggs && (mate.courtCooldown > 0 || tank.clutches.length >= EGGS.maxClutches)) return stop(f);
            // Display just ahead of her, shimmying.
            setTarget(f, mate.x + mate.facing * 50 + Math.sin(tank.time * 6) * 14, mate.y - 10, mate.d);
            // Out of her reach his patience still runs down, only slower, so he cannot follow a hidden female for ever.
            const beside = dist(f.x, f.y, mate.x, mate.y) < 110;
            f.modeTime += beside ? dt : dt * 0.25;
            if (f.modeTime > BEHAVIOUR.courtSeconds) {
                if (beside && chance(BEHAVIOUR.mateChance)) conceive(tank, f, mate, events);
                f.courtCooldown = BEHAVIOUR.courtCooldown;
                return stop(f);
            }
            return 1.3;
        }
        case 'build':
            // Blowing a raft of bubbles takes a while, and he stays under it as he works.
            if (dist(f.x, f.y, f.tx, f.ty) < 60) f.modeTime += dt;
            if (f.modeTime > EGGS.nestBuildSeconds) {
                buildNest(f, tank);
                return stop(f);
            }
            return 0.8;
        case 'graze':
            f.modeTime += dt;
            if (near) {
                tank.algae = clamp(tank.algae - SPECIES[f.species].grazes * dt, 0, 1);
                f.hunger = clamp(f.hunger - dt / 60, 0, 1);
                if (f.peck <= 0 && !walks(f)) f.peck = 0.4;
            }
            if (f.modeTime > GRAZE_SECONDS) {
                f.modeTime = 0;
                grazeTarget(f, tank);
            }
            return 0.7;
        case 'forage':
            if (near && f.peck <= 0) {
                // Shrimp and snails eat the dirt they find.
                const speck = SPECIES[f.species].body === 'fish' ? -1
                    : tank.mulm.findIndex((m) => Math.abs(m.x - f.x) < 26 && Math.abs(m.d - f.d) < 0.15);
                if (speck >= 0) {
                    tank.mulm.splice(speck, 1);
                    f.hunger = clamp(f.hunger - 0.3, 0, 1);
                }
                if (f.pecks > 0) {
                    f.peck = 0.5;
                    f.pecks -= 1;
                } else {
                    forageTarget(f, tank);
                }
            }
            return 0.8;
        case 'wander': {
            const leader = shoalLeader(f, tank);
            // Left behind by the shoal: catch up rather than finish the old course.
            const adrift = !!leader && !walks(f) && dist(f.tx, f.ty, leader.tx, leader.ty) > SOCIAL.shoalSpread * 2.2;
            if (near || adrift || f.modeTime > 14) {
                f.modeTime = 0;
                if (!adrift && chance(walks(f) ? 0.9 : leader ? 0.1 : 0.3)) f.pause = walks(f) ? rand(2, 9) : rand(0.6, 2.5);
                wanderTarget(f, tank);
            }
            f.modeTime += dt;
            return leader && dist(f.x, f.y, leader.x, leader.y) > 260 ? 1.4 : 1;
        }
        case 'flee':
        case 'approach':
            f.modeTime -= dt;
            if (f.mode === 'approach') return 1.2;
            return longFinned(f) ? 2 : 2.4; // long fins are a drag
        case 'freeze':
            f.modeTime -= dt;
            return 0;
        case 'rest':
            return walks(f) ? (near ? 0 : 0.6) : 0.25;
        case 'guard':
            return near ? 0.2 : 0.8;
        case 'gasp':
            return 0.5;
        case 'hide':
            return near ? 0.15 : BEHAVIOUR.fryBoltSpeed;
        default:
            return 1;
    }
}

function updateDead(f: Fish, tank: Tank, dt: number): void {
    f.deadTime += dt;
    const bottom = floorY(f.d, f.x) + (walks(f) ? standing(f) : 6);
    // A dead fish sinks, then gases lift it. A snail or shrimp stays where it fell.
    if (f.deadTime < DEATH.floatAfter || SPECIES[f.species].body !== 'fish') {
        f.y = Math.max(bottom, f.y - DEATH.sinkSpeed * dt);
    } else {
        f.y = Math.min(TANK.surfaceY - 4, f.y + DEATH.floatSpeed * dt);
    }
    f.vx = 0;
    f.vy = 0;
    if (f.deadTime > DEATH.decayAfter) tank.fish.splice(tank.fish.indexOf(f), 1);
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
            // Growth needs food as well as time: a hungry animal grows at about a third of the pace.
            f.growth = Math.min(2, f.growth + (dt / stageTime) * lerp(1, 0.35, f.hunger));
        }
        if (tank.settings.oldAge && f.age >= f.lifespan) {
            killFish(f, events);
            return;
        }
    }
    f.courtCooldown = Math.max(0, f.courtCooldown - dt);
    f.chaseCooldown = Math.max(0, f.chaseCooldown - dt);
    f.pause = Math.max(0, f.pause - dt);
    f.peck = Math.max(0, f.peck - dt);
    // Small animals vanish among the leaves; so does a harried fish that has reached cover.
    const small = stage === 'baby' || species.body === 'shrimp' || ((f.mode === 'flee' || f.mode === 'hide') && bodyLength(f) < 110);
    f.hidden = small && isCovered(tank, f.x, f.y, f.d);

    f.think -= dt;
    if (f.think <= 0) {
        f.think = rand(0.35, 0.65);
        decide(f, tank, env);
    }
    const multiplier = act(f, tank, dt, events);
    const old = f.age > f.lifespan * 0.85 ? 0.7 : 1;
    const ill = f.sick > 0.3 ? HEALTH.lethargy : 1;
    const speed = species.swimSpeed[stage] * multiplier * env.activity * old * ill;
    if (walks(f)) creep(f, dt, speed);
    else swim(f, dt, speed);
}

/** A tap on the glass: every nearby animal reacts according to its temperament. */
export function reactToTap(f: Fish, tank: Tank, x: number, y: number): void {
    if (f.mode === 'dead' || dist(f.x, f.y, x, y) > BEHAVIOUR.tapRadius) return;
    f.targetId = 0;
    f.pause = 0;
    if (walks(f)) {
        // A snail pulls in, a shrimp or pleco holds still.
        f.mode = 'freeze';
        f.modeTime = 3;
        return;
    }
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
