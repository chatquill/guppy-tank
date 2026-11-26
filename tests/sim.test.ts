import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES } from '../src/data/species';
import type { Sex, Stage } from '../src/data/species';
import { TANK } from '../src/data/config';
import { deserialize, newSave, serialize } from '../src/sim/save';
import { addFish as addAny, dropFood, placeDecor, pourBucket, vacuumAt, waterQuality } from '../src/sim/tank';
import { stageOf } from '../src/sim/types';
import type { Fish, Tank } from '../src/sim/types';
import { seedRandom } from '../src/sim/util';
import { quietTank, run } from './helpers';

const G = SPECIES.guppy;
const addFish = (tank: Tank, stage: Stage, sex: Sex): Fish => addAny(tank, 'guppy', stage, sex);

test('a fed baby grows into an adult in about the configured time', () => {
    const tank = quietTank();
    tank.settings.breeding = false;
    const fish = addFish(tank, 'baby', 'f');
    run(tank, G.stageSeconds.baby * 0.5, 20);
    assert.equal(stageOf(fish), 'baby');
    run(tank, (G.stageSeconds.baby + G.stageSeconds.young) * 1.25, 20);
    assert.equal(stageOf(fish), 'adult');
});

test('an unfed fish grows more slowly but never dies of hunger', () => {
    const tank = quietTank();
    tank.settings.oldAge = false;
    const fish = addFish(tank, 'baby', 'm');
    run(tank, G.stageSeconds.baby * 1.5);
    assert.equal(stageOf(fish), 'baby');
    run(tank, 3000);
    assert.equal(fish.hunger, 1);
    assert.notEqual(fish.mode, 'dead');
});

test('a hungry fish eats; a full fish leaves food alone', () => {
    const tank = quietTank();
    const fish = addFish(tank, 'adult', 'f');
    fish.hunger = 0.9;
    dropFood(tank, 'pellets', fish.x, fish.y);
    assert.ok(run(tank, 30).includes('ate'));
    fish.hunger = 0;
    tank.food = [];
    dropFood(tank, 'pellets', fish.x, fish.y);
    assert.ok(!run(tank, 20).includes('ate'));
});

test('guppies ignore food that is not for them', () => {
    const tank = quietTank();
    const adult = addFish(tank, 'adult', 'm');
    adult.hunger = 1;
    dropFood(tank, 'cichlid', adult.x, adult.y);
    assert.ok(!run(tank, 40).includes('ate'));
    const tank2 = quietTank();
    tank2.settings.breeding = false;
    const baby = addFish(tank2, 'baby', 'f');
    baby.hunger = 1;
    dropFood(tank2, 'flakes', baby.x, baby.y);
    assert.ok(!run(tank2, 40).includes('ate'), 'fry cannot eat flakes');
    dropFood(tank2, 'fry', baby.x, baby.y);
    assert.ok(run(tank2, 40).includes('ate'), 'fry eat fry powder');
});

test('a fed pair breeds, and breeding can be switched off', () => {
    const tank = quietTank();
    addFish(tank, 'adult', 'm');
    addFish(tank, 'adult', 'f');
    const kinds = run(tank, 600, 15);
    assert.ok(kinds.includes('mated'));
    assert.ok(kinds.includes('born'));

    const off = quietTank();
    off.settings.breeding = false;
    addFish(off, 'adult', 'm');
    addFish(off, 'adult', 'f');
    const none = run(off, 600, 15);
    assert.ok(!none.includes('mated') && !none.includes('born'));
});

test('an overcrowded tank does not breed', () => {
    const tank = quietTank();
    for (let i = 0; i < TANK.capacity; i++) addFish(tank, 'adult', i % 2 ? 'm' : 'f');
    assert.ok(!run(tank, 200, 4).includes('mated'));
});

test('fish die of old age unless that is switched off or the fish is frozen', () => {
    const tank = quietTank();
    tank.settings.breeding = false;
    const mortal = addFish(tank, 'adult', 'm');
    const frozen = addFish(tank, 'adult', 'm');
    mortal.age = mortal.lifespan - 5;
    frozen.age = frozen.lifespan - 5;
    frozen.frozen = true;
    run(tank, 20, 10);
    assert.equal(mortal.mode, 'dead');
    assert.notEqual(frozen.mode, 'dead');

    const immortal = quietTank();
    immortal.settings.oldAge = false;
    const old = addFish(immortal, 'adult', 'f');
    old.age = old.lifespan - 5;
    run(immortal, 20);
    assert.notEqual(old.mode, 'dead');
});

test('a frozen fish stays the same age and size', () => {
    const tank = quietTank();
    const fish = addFish(tank, 'baby', 'f');
    fish.frozen = true;
    run(tank, G.stageSeconds.baby * 2, 20);
    assert.equal(fish.growth, 0);
    assert.equal(fish.age, 0);
});

test('with the filter running the water stays safe; without it fish eventually die', () => {
    const filtered = quietTank();
    filtered.settings.breeding = false;
    for (let i = 0; i < 8; i++) addFish(filtered, 'adult', 'm');
    run(filtered, 1500, 30);
    assert.ok(waterQuality(filtered) > 0.5, `quality ${waterQuality(filtered)}`);
    assert.ok(filtered.fish.every((f) => f.mode !== 'dead'));

    const bare = quietTank();
    bare.settings.breeding = false;
    bare.settings.filterOn = false;
    for (let i = 0; i < 8; i++) addFish(bare, 'adult', 'm');
    const kinds = run(bare, 1500, 30);
    assert.ok(kinds.includes('died'));
});

test('the vacuum catches nearby fry and the bucket returns them', () => {
    const tank = quietTank();
    const fry = addFish(tank, 'baby', 'f');
    const adult = addFish(tank, 'adult', 'f');
    adult.x = fry.x;
    adult.y = fry.y;
    vacuumAt(tank, fry.x, fry.y);
    assert.equal(tank.bucket.length, 1);
    assert.ok(tank.fish.includes(adult));
    pourBucket(tank);
    assert.ok(tank.fish.includes(fry));
    assert.equal(tank.bucket.length, 0);
});

test('exposed fry get eaten by hungry adults; plants give them a chance', () => {
    const survivors = (withPlants: boolean, seed: number): number => {
        const tank = quietTank();
        seedRandom(seed);
        tank.settings.breeding = false;
        if (withPlants) for (const x of [-600, -200, 200, 600]) placeDecor(tank, 'sword_big', x, 0.5);
        const adults = [0, 1, 2, 3].map(() => addFish(tank, 'adult', 'f'));
        for (let i = 0; i < 16; i++) addFish(tank, 'baby', 'm');
        // Let everyone settle while the adults are full, then let them get hungry.
        for (const a of adults) a.hunger = 0;
        run(tank, 25);
        for (const a of adults) a.hunger = 0.8;
        run(tank, 200);
        return tank.fish.filter((f) => stageOf(f) === 'baby').length;
    };
    // One tank is a coin toss; over several the shelter shows.
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const total = (withPlants: boolean): number => seeds.reduce((sum, seed) => sum + survivors(withPlants, seed), 0);
    const bare = total(false);
    const planted = total(true);
    assert.ok(bare < 16 * seeds.length, 'some fry are eaten in a bare tank');
    assert.ok(planted > bare * 1.5, `plants help a lot: ${planted} vs ${bare}`);
});

test('a save round-trips, an old single-tank save becomes tank one, and a damaged save is refused', () => {
    const tank = quietTank();
    addFish(tank, 'adult', 'm');
    placeDecor(tank, 'orn_statue', 100, 0.4);
    run(tank, 5);
    const save = newSave(tank);
    assert.deepEqual(deserialize(serialize(save)), save);
    assert.equal(deserialize('{broken'), null);
    assert.equal(deserialize(null), null);
    const old = JSON.parse(JSON.stringify(tank));
    delete old.fish[0].kick;
    delete old.fish[0].stress;
    delete old.fish[0].genes.male;
    delete old.decor[0].size;
    delete old.clutches;
    old.version = 1;
    old.decor.push({ id: 999, kind: 'gone', x: 0, d: 0.5, flip: false, rot: 0 });
    const first = deserialize(JSON.stringify(old))?.tanks[0];
    assert.equal(first?.fish[0].kick, 0);
    assert.equal(first?.fish[0].stress, 0);
    assert.ok(Number.isInteger(first?.fish[0].genes.male));
    assert.equal(first?.decor[0].size, 1);
    assert.deepEqual(first?.clutches, []);
    assert.equal(first?.decor.some((dc) => dc.kind === 'gone'), false);
});
