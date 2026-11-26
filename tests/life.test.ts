import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES } from '../src/data/species';
import { addSalt, doseMedicine } from '../src/sim/health';
import { trimPlant } from '../src/sim/plants';
import { adviceFor } from '../src/sim/stocking';
import { createTank, isNight, netFish, placeDecor, releaseFish } from '../src/sim/tank';
import { floorY } from '../src/sim/util';
import { add, gone, quietTank, run } from './helpers';

test('every species lives quietly in a clean tank of its own', () => {
    for (const kind of Object.keys(SPECIES)) {
        const tank = quietTank();
        tank.settings.breeding = false;
        for (const x of [-500, 0, 500]) placeDecor(tank, 'sword_big', x, 0.5);
        placeDecor(tank, 'orn_pot', 300, 0.5);
        const group = add(tank, kind, SPECIES[kind].aggression?.rivals ? 'mff' : 'mfmfmf');
        run(tank, 400, 20, 'brine');
        for (const f of group) {
            assert.notEqual(f.mode, 'dead', `${kind} died`);
            assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.d), `${kind} position`);
            assert.ok(f.stress < 0.5, `${kind} stressed: ${f.stress}`);
        }
    }
});

test('bottom dwellers keep to the gravel and snails climb', () => {
    const tank = quietTank();
    tank.settings.breeding = false;
    tank.settings.bedShape = 'level';
    const corys = add(tank, 'corydoras', 'mfmfmf');
    const snails = add(tank, 'snail', 'mfmf');
    let coryHeight = 0;
    let samples = 0;
    let climbed = false;
    for (let i = 0; i < 300; i++) {
        run(tank, 2, 0);
        if (i < 20) continue; // they are tipped in at the surface and need a moment to settle
        for (const f of corys) {
            coryHeight += f.y + 400;
            samples += 1;
        }
        if (snails.some((f) => f.y - floorY(f.d, f.x) > 100)) climbed = true;
    }
    assert.ok(coryHeight / samples < 190, `corydoras stay low: ${coryHeight / samples}`);
    assert.ok(climbed, 'a snail climbed the glass or a decoration');
});

test('a shoal swims together', () => {
    const spread = (kind: string): number => {
        const tank = quietTank();
        tank.settings.breeding = false;
        const group = add(tank, kind, 'mmmmmmmm');
        let total = 0;
        let samples = 0;
        for (let i = 0; i < 100; i++) {
            run(tank, 2, 0);
            if (i < 15) continue;
            const cx = group.reduce((sum, f) => sum + f.x, 0) / group.length;
            total += group.reduce((sum, f) => sum + Math.abs(f.x - cx), 0) / group.length;
            samples += 1;
        }
        return total / samples;
    };
    const neons = spread('neon');
    const guppies = spread('guppy');
    assert.ok(neons < 220, `neons keep close: ${neons}`);
    assert.ok(neons < guppies * 0.75, `tighter than guppies: ${neons} vs ${guppies}`);
});

test('two male bettas fight until one is dead, and a betta tears a male guppy but not a female', () => {
    const tank = quietTank();
    tank.settings.breeding = false;
    tank.settings.illness = false;
    const [a, b] = add(tank, 'betta', 'mm');
    const kinds = run(tank, 1500, 20);
    assert.ok(kinds.includes('nipped'));
    assert.ok(gone(tank, a) || gone(tank, b), `health ${a.health} ${b.health}`);

    const mixed = quietTank();
    mixed.settings.breeding = false;
    mixed.settings.illness = false;
    add(mixed, 'betta', 'm');
    const [male, female] = add(mixed, 'guppy', 'mf');
    let worst = 0;
    for (let i = 0; i < 60; i++) {
        run(mixed, 10, 2);
        worst = Math.max(worst, male.torn);
    }
    assert.ok(worst > 0.1, `torn ${worst}`);
    assert.equal(female.torn, 0);
});

test('egg layers and shrimp breed in the way of their kind', () => {
    const cases: [string, string, string[]][] = [
        ['neon', 'mfmfmf', ['sword_big']], ['corydoras', 'mfmfmf', []], ['pleco', 'mf', ['orn_pot']], ['betta', 'mf', []], ['shrimp', 'mfmf', ['sword_big']],
    ];
    for (const [kind, sexes, decor] of cases) {
        const tank = quietTank();
        tank.settings.oldAge = false;
        tank.settings.lightMode = kind === 'pleco' ? 'off' : 'on';
        for (const piece of decor) placeDecor(tank, piece, 0, 0.5);
        add(tank, kind, sexes);
        const kinds = run(tank, 1500, 15, kind === 'pleco' ? 'wafer' : 'brine');
        assert.ok(kinds.includes('mated'), `${kind} mated`);
        assert.ok(kinds.includes('hatched') || kinds.includes('born'), `${kind} young arrived`);
    }
    const noCave = quietTank();
    noCave.settings.lightMode = 'off';
    add(noCave, 'pleco', 'mf');
    assert.ok(!run(noCave, 1200, 15, 'wafer').includes('mated'), 'plecos need a cave');
});

test('snails multiply when well fed and not when hungry', () => {
    const fed = quietTank();
    add(fed, 'snail', 'mf');
    for (const f of fed.fish) f.hunger = 0;
    assert.ok(run(fed, 400, 0).includes('hatched'));
    const hungry = quietTank();
    add(hungry, 'snail', 'mf');
    for (const f of hungry.fish) f.hunger = 0.9;
    assert.ok(!run(hungry, 400, 0).includes('hatched'));
});

test('unguarded eggs get eaten', () => {
    const tank = quietTank();
    tank.settings.breeding = false;
    const eaters = add(tank, 'guppy', 'ffff');
    for (const f of eaters) Object.assign(f, { hunger: 0.7, x: 0, y: 0 });
    const genes = eaters[0].genes;
    tank.clutches.push({ id: 900, species: 'neon', kind: 'scatter', x: 0, y: 0, d: 0.5, eggs: 12, hatch: 9999, age: 0, guard: 0, mother: genes, father: genes });
    run(tank, 60);
    assert.equal(tank.clutches.length, 0);
});

test('white spot kills if ignored, medicine cures it, and illness can be switched off', () => {
    const outcome = (treat: boolean, illness = true): { dead: number; sick: number } => {
        const tank = quietTank();
        Object.assign(tank.settings, { breeding: false, oldAge: false, illness });
        const fish = add(tank, 'guppy', 'mmmmmm');
        for (const f of fish) Object.assign(f, { illness: 'ich', sick: 0.45 });
        for (let i = 0; i < 12; i++) {
            if (treat) doseMedicine(tank);
            run(tank, 100, 20);
        }
        return { dead: fish.filter((f) => gone(tank, f)).length, sick: fish.filter((f) => f.illness !== '').length };
    };
    assert.ok(outcome(false).dead >= 4, 'untreated fish die');
    assert.deepEqual(outcome(true), { dead: 0, sick: 0 });
    assert.deepEqual(outcome(false, false), { dead: 0, sick: 0 });
});

test('fish kept in dirty water fall ill', () => {
    const foul = quietTank();
    foul.settings.breeding = false;
    add(foul, 'guppy', 'mmmm');
    let caught = false;
    for (let i = 0; i < 300 && !caught; i++) {
        foul.waste = 62;
        caught = run(foul, 5, 0).includes('sick');
    }
    assert.ok(caught);
});

test('medicine kills shrimp but not fish, and salt wears on corydoras', () => {
    const tank = quietTank();
    tank.settings.breeding = false;
    const [shrimp] = add(tank, 'shrimp', 'f');
    const [guppy] = add(tank, 'guppy', 'f');
    for (let i = 0; i < 4; i++) {
        doseMedicine(tank);
        run(tank, 200, 20);
    }
    assert.ok(gone(tank, shrimp));
    assert.notEqual(guppy.mode, 'dead');

    const salty = quietTank();
    salty.settings.breeding = false;
    const corys = add(salty, 'corydoras', 'mfmfmf');
    for (let i = 0; i < 3; i++) addSalt(salty);
    run(salty, 300, 20);
    assert.ok(corys.every((f) => f.health < 1));
});

test('plants grow from young, overgrow, spread by runners and can be trimmed', () => {
    const tank = quietTank();
    const sword = placeDecor(tank, 'sword_big', 0, 0.5, false);
    const grass = placeDecor(tank, 'grass_tuft', 400, 0.5, false);
    assert.ok(sword && grass);
    assert.ok(sword.size < 0.5);
    run(tank, 1200, 0);
    assert.ok(sword.size >= 1, `grown: ${sword.size}`);
    run(tank, 1500, 0);
    assert.ok(sword.size > 1.05, `overgrown: ${sword.size}`);
    assert.ok(tank.decor.filter((dc) => dc.kind === 'grass_tuft').length > 1, 'hairgrass sent out runners');
    assert.equal(tank.decor.filter((dc) => dc.kind === 'sword_big').length, 1);
    const before = sword.size;
    assert.ok(trimPlant(tank, sword.id));
    assert.ok(sword.size < before * 0.7);
    const rock = placeDecor(tank, 'rock_small', 0, 0.5);
    assert.equal(trimPlant(tank, rock?.id ?? 0), false);

    const dark = quietTank();
    dark.settings.lightMode = 'off';
    const unlit = placeDecor(dark, 'sword_big', 0, 0.5, false);
    run(dark, 600, 0);
    assert.equal(unlit?.size, 0.45);
});

test('the net moves a fish from one tank to another', () => {
    const from = quietTank();
    const to = createTank('Tank 2');
    const [fish] = add(from, 'guppy', 'f');
    const netted = netFish(from, fish.id);
    assert.equal(from.fish.length, 0);
    assert.ok(netted);
    releaseFish(to, [netted], 100);
    assert.equal(to.fish.length, 1);
    assert.equal(to.fish[0].name, fish.name);
    run(to, 10);
    assert.notEqual(to.fish[0].mode, 'dead');
});

test('a tank on the real clock is lit by day and dark at night', () => {
    const tank = quietTank();
    tank.settings.lightMode = 'clock';
    assert.equal(isNight(tank, 12), false);
    assert.equal(isNight(tank, 23), true);
    assert.equal(isNight(tank, 3), true);
});

test('the advice in the Add fish menu fits the tank', () => {
    const tank = quietTank();
    add(tank, 'guppy', 'mf');
    add(tank, 'betta', 'm');
    add(tank, 'neon', 'mf');
    const text = (kind: string): string => adviceFor(tank, kind).join(' | ');
    assert.match(text('neon'), /6 or more: you have 2/);
    assert.match(text('betta'), /second male/);
    assert.match(text('shrimp'), /bettas will eat them/);
    assert.match(text('guppy'), /bettas will tear/);
    assert.match(text('pleco'), /cave/);
    assert.equal(adviceFor(createTank(), 'guppy').length, 0);
});
