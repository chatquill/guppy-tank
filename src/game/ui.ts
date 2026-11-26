import {
    Device, Text, TextAlign, TextVerticalAlign, UIPointerEvents, UIPositionType, createButton, px, setEntityVisible, spawnUIEntity,
} from 'esengine';
import type { Entity, EntityEventQueue, World } from 'esengine';
import { BED, HEATER_SETTINGS, MAX_TANKS, SOCIAL, TIME, WATER } from '../data/config';
import { BACKGROUNDS, DECOR, SUBSTRATES } from '../data/decor';
import { FOODS } from '../data/foods';
import { SPECIES, SPECIES_ORDER } from '../data/species';
import type { Sex, Stage } from '../data/species';
import { wardOf } from '../sim/breeding';
import { addSalt, doseMedicine } from '../sim/health';
import { adviceFor, stockingLevel, stockingWord } from '../sim/stocking';
import { addFish, isNight, netFish, placeDecor, pourBucket, removeFish, waterChange, waterQuality } from '../sim/tank';
import type { Fish } from '../sim/types';
import { stageOf } from '../sim/types';
import { chance, lookOf } from '../sim/util';
import { setTool } from './input';
import { addTank, endRename, game, removeTank, showTank } from './state';

const BAR_H = 54;
const ROW_H = 36;
const LINE_H = 24;
const PANEL_W = 250;
const WIDE_W = 430;
const PX_PER_CM = 22;
const REMOVE_CONFIRM_SECONDS = 4;
const DARK = { r: 0.04, g: 0.07, b: 0.1, a: 0.78 };
const BUTTON = { r: 0.16, g: 0.24, b: 0.31, a: 0.95 };
const BUTTON_HOVER = { r: 0.24, g: 0.36, b: 0.46, a: 1 };
const BUTTON_DOWN = { r: 0.1, g: 0.16, b: 0.22, a: 1 };
const TEXT = { r: 0.92, g: 0.96, b: 0.98, a: 1 };

interface Ctx {
    world: World;
    events: EntityEventQueue;
}

interface LiveLabel {
    entity: Entity;
    read: () => string;
    last: string;
}

interface Row {
    label: string | (() => string);
    act?: () => void;
    lines?: number; // a text block of this many lines instead of a button
}

const labels: LiveLabel[] = [];
const panels = new Map<string, Entity>();
let toolbar: Entity | null = null;
let card: Entity | null = null;
let hint: Entity | null = null;
let showButton: Entity | null = null;
let refreshIn = 0;

function label(ctx: Ctx, parent: Entity, read: string | (() => string), fontSize: number, align: TextAlign): Entity {
    const entity = spawnUIEntity({
        world: ctx.world, parent,
        node: { position: UIPositionType.Absolute, insetLeft: px(10), insetRight: px(10), insetTop: px(0), insetBottom: px(0), pointerEvents: UIPointerEvents.None },
        text: { content: typeof read === 'string' ? read : read(), fontSize, color: TEXT, align, verticalAlign: TextVerticalAlign.Middle, wordWrap: true },
    });
    if (typeof read !== 'string') labels.push({ entity, read, last: '' });
    return entity;
}

function button(ctx: Ctx, parent: Entity, x: number, y: number, w: number, h: number, text: string | (() => string), act: () => void): Entity {
    const handle = createButton({
        world: ctx.world, events: ctx.events, parent,
        node: { position: UIPositionType.Absolute, insetLeft: px(x), insetTop: px(y), width: px(w), height: px(h) },
        background: { color: BUTTON },
        states: { normal: { color: BUTTON }, hover: { color: BUTTON_HOVER }, pressed: { color: BUTTON_DOWN } },
        onClick: () => {
            game.sounds.push('click');
            act();
        },
    });
    label(ctx, handle.entity, text, 17, TextAlign.Center);
    return handle.entity;
}

/** A pop-up list above the toolbar. Long lists of buttons wrap into several columns of `perColumn`. */
function panel(ctx: Ctx, name: string, x: number, rows: Row[], perColumn = 0, width = PANEL_W): void {
    const columns = perColumn > 0 ? Math.ceil(rows.length / perColumn) : 1;
    const height = perColumn > 0
        ? Math.min(rows.length, perColumn) * ROW_H + 12
        : rows.reduce((sum, r) => sum + (r.lines ? r.lines * LINE_H + 8 : ROW_H), 12);
    const entity = spawnUIEntity({
        world: ctx.world, parent: game.uiRoot ?? undefined,
        node: { position: UIPositionType.Absolute, insetLeft: px(x), insetBottom: px(BAR_H + 8 + game.uiLift), width: px(width * columns), height: px(height) },
        visual: { color: DARK },
    });
    let y = 6;
    rows.forEach((row, i) => {
        const column = perColumn > 0 ? Math.floor(i / perColumn) : 0;
        if (perColumn > 0 && i % perColumn === 0) y = 6;
        if (row.lines) {
            const box = spawnUIEntity({
                world: ctx.world, parent: entity,
                node: { position: UIPositionType.Absolute, insetLeft: px(0), insetTop: px(y), width: px(width), height: px(row.lines * LINE_H) },
            });
            label(ctx, box, row.label, 15, TextAlign.Left);
            y += row.lines * LINE_H + 8;
        } else {
            button(ctx, entity, 6 + column * width, y, width - 12, ROW_H - 4, row.label, row.act ?? (() => undefined));
            y += ROW_H;
        }
    });
    panels.set(name, entity);
}

const onOff = (on: boolean): string => (on ? 'on' : 'off');
const cycle = <T>(items: readonly T[], current: T): T => items[(items.indexOf(current) + 1) % items.length];
const percentText = (v: number): string => `${Math.round(v * 100)}%`;
const nextVolume = (v: number): number => (v >= 0.99 ? 0 : Math.min(1, Math.round((v + 0.25) * 4) / 4));
const living = (): Fish[] => game.tank.fish.filter((f) => f.mode !== 'dead');
const LIGHT_WORDS = { auto: 'day and night', on: 'always on', off: 'off', clock: 'follows the real time' };

function clock(seconds: number): string {
    const m = Math.floor(seconds / 60);
    return `${m}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function waterWord(): string {
    const q = waterQuality(game.tank);
    return q > 0.8 ? 'clear' : q > WATER.cloudyBelow ? 'a little dull' : q > WATER.gaspBelow ? 'cloudy' : q > WATER.harmBelow ? 'foul' : 'dangerous';
}

function statusText(): string {
    const tank = game.tank;
    const level = stockingLevel(tank);
    const algae = tank.algae > 0.6 ? 'heavy' : tank.algae > 0.25 ? 'some' : 'none';
    const sick = living().filter((f) => f.illness !== '').length;
    const added = [tank.medicine > 0 ? `medicine ${clock(tank.medicine)}` : '', tank.salt > 0.02 ? `salt ${percentText(tank.salt)}` : ''].filter(Boolean).join(', ');
    return [
        `Water: ${waterWord()}   ${tank.temp.toFixed(1)} C`,
        `Algae: ${algae}   Dirt: ${tank.mulm.length}`,
        `Animals: ${living().length} (${stockingWord(level)})   ${isNight(tank) ? 'Night' : 'Day'}`,
        sick > 0 ? `Sick: ${sick}` : 'No illness',
        added ? `In the water: ${added}` : 'Nothing added to the water',
    ].join('\n');
}

function healthWords(f: Fish): string {
    const words: string[] = [];
    if (f.illness === 'ich') words.push(f.sick > 0.5 ? 'White spot, serious' : 'White spot');
    if (f.illness === 'finrot') words.push(f.sick > 0.5 ? 'Fin rot, serious' : 'Fin rot');
    if (f.illness === '' && f.torn > SOCIAL.tornShownAbove) words.push('Torn fins');
    if (f.stress > 0.6) words.push('frightened');
    else if (f.stress > 0.3) words.push('uneasy');
    if (f.health < 0.5) words.push('weak');
    return words.length > 0 ? words.join(', ') : 'Healthy';
}

function cardText(): string {
    const f = game.tank.fish.find((o) => o.id === game.selectedFish);
    if (!f) return '';
    const species = SPECIES[f.species];
    const stage = stageOf(f);
    const guarding = wardOf(f, game.tank);
    const state = f.mode === 'dead' ? 'Dead'
        : f.pregnancy ? (species.spawning === 'carry' ? 'Carrying eggs' : 'Expecting')
            : guarding ? (guarding.eggs > 0 ? 'Guarding eggs' : 'Tending a nest')
                : stage === 'baby' ? 'Baby' : stage === 'young' ? 'Young' : 'Adult';
    const name = game.renaming ? `${f.name}_` : f.name;
    const sex = species.spawning === 'clutch' ? '' : f.sex === 'm' ? ', male' : ', female';
    return `${name}\n${lookOf(f.species, f.sex, f.genes).label} ${species.name.toLowerCase()}${sex}\n${state}, age ${clock(f.age)}\nNature: ${f.temperament}\n${healthWords(f)}`;
}

function speciesText(): string {
    const kind = game.pickSpecies;
    const species = SPECIES[kind];
    const cm = (species.lengthPx.adultF / PX_PER_CM).toFixed(species.lengthPx.adultF < 66 ? 1 : 0);
    const level = stockingLevel(game.tank);
    const warnings = adviceFor(game.tank, kind).slice(0, 3).map((line) => `! ${line}`);
    return [`${species.name}: grows to ${cm} cm`, ...species.notes, ...warnings, `This tank: ${percentText(level)} full, ${stockingWord(level)}`].join('\n');
}

function release(stage: Stage, sex: Sex | 'any', count = 1): void {
    for (let i = 0; i < count; i++) addFish(game.tank, game.pickSpecies, stage, sex === 'any' ? (chance(0.5) ? 'm' : 'f') : sex);
    game.sounds.push('plop');
}

function speciesRows(): Row[] {
    return SPECIES_ORDER.map((kind) => ({
        label: () => {
            const count = living().filter((f) => f.species === kind).length;
            return count > 0 ? `${SPECIES[kind].name} (${count})` : SPECIES[kind].name;
        },
        act: () => {
            game.pickSpecies = kind;
            game.openPanel = 'fishadd';
        },
    }));
}

function addRows(): Row[] {
    // Snails are both sexes at once, so there is nothing to choose.
    const sexed = (): boolean => SPECIES[game.pickSpecies].spawning !== 'clutch';
    return [
        { label: speciesText, lines: 11 },
        { label: () => (sexed() ? 'Add an adult male' : 'Add an adult'), act: () => release('adult', 'm') },
        { label: () => (sexed() ? 'Add an adult female' : 'Add a young one'), act: () => (sexed() ? release('adult', 'f') : release('young', 'any')) },
        { label: 'Add a group of six adults', act: () => release('adult', 'any', 6) },
        { label: 'Add a young one', act: () => release('young', 'any') },
        { label: 'Add a baby', act: () => release('baby', 'any') },
        { label: 'Back to the list', act: () => { game.openPanel = 'fish'; } },
    ];
}

const CATEGORY_MARK = { plant: 'Plant:', rock: 'Rock:', wood: 'Wood:', ornament: 'Ornament:', bubbler: 'Air:' };

function decorRows(): Row[] {
    const settings = (): typeof game.tank.settings => game.tank.settings;
    const rows: Row[] = Object.entries(DECOR).map(([kind, data]) => ({
        label: `${CATEGORY_MARK[data.category]} ${data.label}`,
        act: () => {
            // Plants go in young, as bought, and grow.
            const made = placeDecor(game.tank, kind, game.mouseX, 0.5, false);
            if (!made) return;
            setTool('place');
            game.heldDecor = made.id;
            game.heldIsNew = true;
            game.openPanel = '';
        },
    }));
    rows.push({ label: 'Move or remove things', act: () => { setTool('decorate'); game.openPanel = ''; } });
    rows.push({ label: 'Trim plants', act: () => { setTool('trim'); game.openPanel = ''; } });
    rows.push({ label: () => `Floor: ${settings().substrate.replace('gravel_', '').replace('_', ' ')}`, act: () => { settings().substrate = cycle(SUBSTRATES, settings().substrate); } });
    rows.push({ label: () => `Grain size: ${settings().grain}`, act: () => { settings().grain = cycle(BED.grains, settings().grain); } });
    rows.push({ label: () => `Floor shape: ${settings().bedShape}`, act: () => { settings().bedShape = cycle(BED.shapes, settings().bedShape); } });
    rows.push({ label: () => `Floor depth: ${settings().bedDepth}`, act: () => { settings().bedDepth = cycle(Object.keys(BED.depths), settings().bedDepth); } });
    rows.push({ label: () => `Backdrop: ${settings().background.replace('bg_', '')}`, act: () => { settings().background = cycle(BACKGROUNDS, settings().background); } });
    return rows;
}

function tankRows(): Row[] {
    const rows: Row[] = [];
    for (let i = 0; i < MAX_TANKS; i++) {
        rows.push({
            label: () => {
                const tank = game.save.tanks[i];
                if (!tank) return i === game.save.tanks.length ? 'Set up a new tank' : '-';
                const count = tank.fish.filter((f) => f.mode !== 'dead').length;
                return `${i === game.save.current ? '> ' : ''}${tank.name}: ${count} ${count === 1 ? 'animal' : 'animals'}`;
            },
            act: () => {
                if (game.save.tanks[i]) showTank(i);
                else if (i === game.save.tanks.length) addTank();
            },
        });
    }
    rows.push({
        label: () => (game.save.net.length > 0 ? `Net: holding ${game.save.net.length}, click water to release` : 'Fish net: move fish between tanks'),
        act: () => { setTool('net'); game.openPanel = ''; },
    });
    rows.push({
        label: () => (game.save.tanks.length <= 1 ? 'This is your only tank' : game.removeArmed > 0 ? 'Click again: everything in it is lost' : 'Take this tank down'),
        act: () => {
            if (game.save.tanks.length <= 1) return;
            if (game.removeArmed > 0) {
                game.removeArmed = 0;
                removeTank();
            } else {
                game.removeArmed = REMOVE_CONFIRM_SECONDS;
            }
        },
    });
    return rows;
}

function buildPanels(ctx: Ctx): void {
    // Read through the game each time: the tank on screen can change.
    const s = (): typeof game.tank.settings => game.tank.settings;
    panel(ctx, 'fish', 8, speciesRows(), 7);
    panel(ctx, 'fishadd', 8, addRows(), 0, WIDE_W);
    panel(ctx, 'food', 8 + 150, Object.entries(FOODS).map(([key, data]) => ({
        label: () => `${game.food === key ? '> ' : ''}${data.label}`,
        act: () => { game.food = key; setTool('feed'); },
    })));
    panel(ctx, 'decor', 8, decorRows(), 12);
    panel(ctx, 'care', 8 + 450, [
        { label: statusText, lines: 5 },
        { label: 'Change water', act: () => { waterChange(game.tank); game.sounds.push('splash'); } },
        { label: 'Gravel vacuum', act: () => { setTool('vacuum'); game.openPanel = ''; } },
        { label: 'Algae scrubber', act: () => { setTool('scrub'); game.openPanel = ''; } },
        { label: () => `Pour bucket back (${game.tank.bucket.length} fry)`, act: () => { pourBucket(game.tank); game.sounds.push('splash'); } },
        {
            label: 'Remove dead animals',
            act: () => { for (const f of game.tank.fish.filter((o) => o.mode === 'dead')) removeFish(game.tank, f.id); },
        },
        { label: 'Medicine (kills shrimp, snails)', act: () => { doseMedicine(game.tank); game.sounds.push('plop'); } },
        { label: 'Aquarium salt', act: () => { addSalt(game.tank); game.sounds.push('plop'); } },
    ]);
    panel(ctx, 'equip', 8 + 600, [
        { label: () => `Filter: ${onOff(s().filterOn)}`, act: () => { s().filterOn = !s().filterOn; } },
        { label: () => `Heater: ${onOff(s().heaterOn)}`, act: () => { s().heaterOn = !s().heaterOn; } },
        { label: () => `Heater set to ${s().heaterTemp} C`, act: () => { s().heaterTemp = cycle(HEATER_SETTINGS, s().heaterTemp); } },
        { label: () => `Air pump: ${onOff(s().airOn)}`, act: () => { s().airOn = !s().airOn; } },
        { label: () => `Light: ${LIGHT_WORDS[s().lightMode]}`, act: () => { s().lightMode = cycle(['auto', 'on', 'off', 'clock'] as const, s().lightMode); } },
    ]);
    panel(ctx, 'settings', 8 + 750, [
        { label: () => `Breeding: ${onOff(s().breeding)}`, act: () => { s().breeding = !s().breeding; } },
        { label: () => `Death from old age: ${onOff(s().oldAge)}`, act: () => { s().oldAge = !s().oldAge; } },
        { label: () => `Illness: ${onOff(s().illness)}`, act: () => { s().illness = !s().illness; } },
        { label: () => `Filter hum: ${percentText(s().volume.filter)}`, act: () => { s().volume.filter = nextVolume(s().volume.filter); } },
        { label: () => `Bubbles: ${percentText(s().volume.bubbles)}`, act: () => { s().volume.bubbles = nextVolume(s().volume.bubbles); } },
        { label: () => `Feeding sounds: ${percentText(s().volume.feed)}`, act: () => { s().volume.feed = nextVolume(s().volume.feed); } },
        { label: () => `Music: ${percentText(s().volume.music)}`, act: () => { s().volume.music = nextVolume(s().volume.music); } },
        { label: 'Fullscreen', act: () => { Device.fullscreen(!Device.state().fullscreen).catch(() => undefined); } }, // if the system refuses, stay windowed
    ]);
    panel(ctx, 'tanks', 8 + 900, tankRows(), 0, 330);
}

const CARD_LINES = 5;

function buildCard(ctx: Ctx): void {
    const selected = (): Fish | undefined => game.tank.fish.find((f) => f.id === game.selectedFish);
    const rows: [string | (() => string), () => void][] = [
        ['Rename', () => { const f = selected(); if (f) { f.name = ''; game.renaming = true; } }],
        [() => `Freeze age: ${onOff(selected()?.frozen ?? false)}`, () => { const f = selected(); if (f) f.frozen = !f.frozen; }],
        ['Catch with the net', () => {
            const caught = netFish(game.tank, game.selectedFish);
            if (!caught) return;
            game.save.net.push(caught);
            game.selectedFish = 0;
            setTool('net');
        }],
        ['Remove from tank', () => { removeFish(game.tank, game.selectedFish); game.selectedFish = 0; }],
        ['Close', () => { game.selectedFish = 0; endRename(); }],
    ];
    const textHeight = CARD_LINES * LINE_H;
    card = spawnUIEntity({
        world: ctx.world, parent: game.uiRoot ?? undefined,
        node: { position: UIPositionType.Absolute, insetLeft: px(16), insetTop: px(96), width: px(PANEL_W + 40), height: px(textHeight + 16 + rows.length * ROW_H) },
        visual: { color: DARK },
    });
    const box = spawnUIEntity({
        world: ctx.world, parent: card,
        node: { position: UIPositionType.Absolute, insetLeft: px(0), insetTop: px(6), width: px(PANEL_W + 40), height: px(textHeight) },
    });
    label(ctx, box, cardText, 16, TextAlign.Left);
    rows.forEach(([text, act], i) => button(ctx, card as Entity, 6, textHeight + 12 + i * ROW_H, PANEL_W + 28, ROW_H - 4, text, act));
}

const REVEAL_BELOW_Y = -500; // world y: the mouse is at the bottom edge of the screen
const HIDE_ABOVE_Y = -430;

export function buildUi(world: World, events: EntityEventQueue): void {
    const ctx: Ctx = { world, events };
    const root = game.uiRoot ?? undefined;
    toolbar = spawnUIEntity({
        world, parent: root,
        node: { position: UIPositionType.Absolute, insetLeft: px(0), insetRight: px(0), insetBottom: px(game.uiLift), height: px(BAR_H) },
        visual: { color: DARK },
    });
    const s = (): typeof game.tank.settings => game.tank.settings;
    const toggle = (name: string) => (): void => { game.openPanel = game.openPanel === name ? '' : name; };
    const items: [string | (() => string), () => void][] = [
        ['Add fish', () => { game.openPanel = game.openPanel === 'fish' || game.openPanel === 'fishadd' ? '' : 'fish'; }],
        ['Food', toggle('food')], ['Decorate', toggle('decor')], ['Care', toggle('care')],
        ['Equipment', toggle('equip')], ['Settings', toggle('settings')],
        [() => game.tank.name, toggle('tanks')],
        [() => (s().speedIndex === 0 ? 'Paused' : `Speed ${TIME.speeds[s().speedIndex]}x`), () => { s().speedIndex = (s().speedIndex + 1) % TIME.speeds.length; }],
        // Doubles as the way to put a tool down, for when there is no keyboard to press Esc on.
        [() => (game.tool === 'feed' ? 'Hide (H)' : 'Put tool away'), () => {
            game.openPanel = '';
            if (game.tool === 'feed') game.uiHidden = true;
            else setTool('feed');
        }],
    ];
    items.forEach(([text, act], i) => button(ctx, toolbar as Entity, 8 + i * 150, 7, 142, BAR_H - 14, text, act));
    buildPanels(ctx);
    buildCard(ctx);
    hint = spawnUIEntity({
        world, parent: root,
        node: { position: UIPositionType.Absolute, insetLeft: px(0), insetRight: px(0), insetTop: px(22), height: px(30), pointerEvents: UIPointerEvents.None },
        text: { content: '', fontSize: 18, color: TEXT, align: TextAlign.Center, verticalAlign: TextVerticalAlign.Middle },
    });
    labels.push({ entity: hint, read: () => game.hint, last: '' });
    showButton = spawnUIEntity({
        world, parent: root,
        node: { position: UIPositionType.Absolute, insetRight: px(6), insetBottom: px(6 + game.uiLift), width: px(34), height: px(34) },
    });
    const show = createButton({
        world, events, parent: showButton,
        node: { position: UIPositionType.Absolute, insetLeft: px(0), insetTop: px(0), width: px(34), height: px(34) },
        background: { color: { ...BUTTON, a: 0.12 } },
        states: { normal: { color: { ...BUTTON, a: 0.12 } }, hover: { color: BUTTON_HOVER } },
        onClick: () => { game.uiHidden = false; },
    });
    label(ctx, show.entity, '=', 18, TextAlign.Center);
}

/** Show the right panels and refresh any text that reports live values. */
export function updateUi(world: World, dt: number): void {
    if (!toolbar || !card || !hint || !showButton) return;
    game.removeArmed = Math.max(0, game.removeArmed - dt);
    const selected = game.tank.fish.some((f) => f.id === game.selectedFish);
    if (!selected) game.selectedFish = 0;
    // The toolbar stays out of sight until the mouse reaches the bottom edge, or something is in use.
    const busy = game.openPanel !== '' || selected || game.tool !== 'feed' || game.renaming;
    if (game.mouseY < REVEAL_BELOW_Y + game.uiLift) game.uiShown = true;
    else if (!busy && game.mouseY > HIDE_ABOVE_Y + game.uiLift) game.uiShown = false;
    const noMenus = game.wallpaper || game.menusOff;
    const hidden = game.uiHidden || noMenus;
    setEntityVisible(world, toolbar, !hidden && (game.uiShown || busy));
    setEntityVisible(world, hint, !hidden && game.hint !== '');
    setEntityVisible(world, showButton, game.uiHidden && !noMenus);
    for (const [name, entity] of panels) setEntityVisible(world, entity, !hidden && game.openPanel === name);
    setEntityVisible(world, card, !hidden && selected);

    refreshIn -= dt;
    if (refreshIn > 0) return;
    refreshIn = 0.15;
    for (const item of labels) {
        const text = item.read();
        if (text === item.last || !world.valid(item.entity)) continue;
        item.last = text;
        world.update(item.entity, Text, (t) => { t.content = text; });
    }
}
