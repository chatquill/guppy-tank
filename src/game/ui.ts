import {
    Device, Text, TextAlign, TextVerticalAlign, UIPointerEvents, UIPositionType, createButton, px, setEntityVisible, spawnUIEntity,
} from 'esengine';
import type { Entity, EntityEventQueue, World } from 'esengine';
import { BACKGROUNDS, DECOR, SUBSTRATES } from '../data/decor';
import { FOODS } from '../data/foods';
import { BED, TANK, TIME, WATER } from '../data/config';
import type { Sex, Stage } from '../data/species';
import { addFish, crowding, isNight, placeDecor, pourBucket, removeFish, waterChange, waterQuality } from '../sim/tank';
import { stageOf } from '../sim/types';
import { lookOf } from '../view/fishView';
import { setTool } from './input';
import { game } from './state';

const BAR_H = 54;
const ROW_H = 36;
const PANEL_W = 250;
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
function panel(ctx: Ctx, name: string, x: number, rows: Row[], perColumn = 0): void {
    const columns = perColumn > 0 ? Math.ceil(rows.length / perColumn) : 1;
    const height = perColumn > 0
        ? Math.min(rows.length, perColumn) * ROW_H + 12
        : rows.reduce((sum, r) => sum + (r.lines ? r.lines * 24 + 8 : ROW_H), 12);
    const entity = spawnUIEntity({
        world: ctx.world, parent: game.uiRoot ?? undefined,
        node: { position: UIPositionType.Absolute, insetLeft: px(x), insetBottom: px(BAR_H + 8 + game.uiLift), width: px(PANEL_W * columns), height: px(height) },
        visual: { color: DARK },
    });
    let y = 6;
    rows.forEach((row, i) => {
        const column = perColumn > 0 ? Math.floor(i / perColumn) : 0;
        if (perColumn > 0 && i % perColumn === 0) y = 6;
        if (row.lines) {
            const box = spawnUIEntity({
                world: ctx.world, parent: entity,
                node: { position: UIPositionType.Absolute, insetLeft: px(0), insetTop: px(y), width: px(PANEL_W), height: px(row.lines * 24) },
            });
            label(ctx, box, row.label, 15, TextAlign.Left);
            y += row.lines * 24 + 8;
        } else {
            button(ctx, entity, 6 + column * PANEL_W, y, PANEL_W - 12, ROW_H - 4, row.label, row.act ?? (() => undefined));
            y += ROW_H;
        }
    });
    panels.set(name, entity);
}

const onOff = (on: boolean): string => (on ? 'on' : 'off');
const cycle = <T>(items: readonly T[], current: T): T => items[(items.indexOf(current) + 1) % items.length];
const percentText = (v: number): string => `${Math.round(v * 100)}%`;
const nextVolume = (v: number): number => (v >= 0.99 ? 0 : Math.min(1, Math.round((v + 0.25) * 4) / 4));

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
    const alive = tank.fish.filter((f) => f.mode !== 'dead').length;
    const crowd = crowding(tank) >= TANK.capacity ? ' (crowded)' : '';
    const algae = tank.algae > 0.6 ? 'heavy' : tank.algae > 0.25 ? 'some' : 'none';
    return `Water: ${waterWord()}\nTemperature: ${tank.temp.toFixed(1)} C\nAlgae: ${algae}   Dirt: ${tank.mulm.length}\nFish: ${alive}${crowd}   ${isNight(tank) ? 'Night' : 'Day'}`;
}

function cardText(): string {
    const f = game.tank.fish.find((o) => o.id === game.selectedFish);
    if (!f) return '';
    const stage = stageOf(f);
    const state = f.mode === 'dead' ? 'Dead' : f.pregnancy ? 'Expecting' : stage === 'baby' ? 'Baby' : stage === 'young' ? 'Young' : 'Adult';
    const name = game.renaming ? `${f.name}_` : f.name;
    return `${name}\n${lookOf(f).label} guppy, ${f.sex === 'm' ? 'male' : 'female'}\n${state}, age ${clock(f.age)}\nNature: ${f.temperament}`;
}

function fishRows(): Row[] {
    const rows: Row[] = [];
    for (const stage of ['baby', 'young', 'adult'] as Stage[]) {
        for (const sex of ['m', 'f'] as Sex[]) {
            rows.push({
                label: `${stage[0].toUpperCase()}${stage.slice(1)} ${sex === 'm' ? 'male' : 'female'}`,
                act: () => {
                    addFish(game.tank, stage, sex);
                    game.sounds.push('plop');
                },
            });
        }
    }
    return rows;
}

const CATEGORY_MARK = { plant: 'Plant:', rock: 'Rock:', wood: 'Wood:', ornament: 'Ornament:', bubbler: 'Air:' };

function decorRows(): Row[] {
    const s = game.tank.settings;
    const rows: Row[] = Object.entries(DECOR).map(([kind, data]) => ({
        label: `${CATEGORY_MARK[data.category]} ${data.label}`,
        act: () => {
            const made = placeDecor(game.tank, kind, game.mouseX, 0.5);
            if (!made) return;
            setTool('place');
            game.heldDecor = made.id;
            game.heldIsNew = true;
            game.openPanel = '';
        },
    }));
    rows.push({ label: 'Move or remove things', act: () => { setTool('decorate'); game.openPanel = ''; } });
    rows.push({ label: () => `Floor: ${s.substrate.replace('gravel_', '').replace('_', ' ')}`, act: () => { s.substrate = cycle(SUBSTRATES, s.substrate); } });
    rows.push({ label: () => `Grain size: ${s.grain}`, act: () => { s.grain = cycle(BED.grains, s.grain); } });
    rows.push({ label: () => `Floor shape: ${s.bedShape}`, act: () => { s.bedShape = cycle(BED.shapes, s.bedShape); } });
    rows.push({ label: () => `Floor depth: ${s.bedDepth}`, act: () => { s.bedDepth = cycle(Object.keys(BED.depths), s.bedDepth); } });
    rows.push({ label: () => `Backdrop: ${s.background.replace('bg_', '')}`, act: () => { s.background = cycle(BACKGROUNDS, s.background); } });
    return rows;
}

function buildPanels(ctx: Ctx): void {
    const s = game.tank.settings;
    panel(ctx, 'fish', 8, fishRows());
    panel(ctx, 'food', 8 + 150, Object.entries(FOODS).map(([key, data]) => ({
        label: () => `${game.food === key ? '> ' : ''}${data.label}`,
        act: () => { game.food = key; setTool('feed'); },
    })));
    panel(ctx, 'decor', 8, decorRows(), 12);
    panel(ctx, 'care', 8 + 450, [
        { label: statusText, lines: 4 },
        { label: 'Change water', act: () => { waterChange(game.tank); game.sounds.push('splash'); } },
        { label: 'Gravel vacuum', act: () => { setTool('vacuum'); game.openPanel = ''; } },
        { label: 'Algae scrubber', act: () => { setTool('scrub'); game.openPanel = ''; } },
        { label: () => `Pour bucket back (${game.tank.bucket.length} fry)`, act: () => { pourBucket(game.tank); game.sounds.push('splash'); } },
        {
            label: 'Remove dead fish',
            act: () => { for (const f of game.tank.fish.filter((o) => o.mode === 'dead')) removeFish(game.tank, f.id); },
        },
    ]);
    panel(ctx, 'equip', 8 + 600, [
        { label: () => `Filter: ${onOff(s.filterOn)}`, act: () => { s.filterOn = !s.filterOn; } },
        { label: () => `Heater: ${onOff(s.heaterOn)}`, act: () => { s.heaterOn = !s.heaterOn; } },
        { label: () => `Air pump: ${onOff(s.airOn)}`, act: () => { s.airOn = !s.airOn; } },
        { label: () => `Light: ${s.lightMode}`, act: () => { s.lightMode = cycle(['auto', 'on', 'off'] as const, s.lightMode); } },
    ]);
    panel(ctx, 'settings', 8 + 750, [
        { label: () => `Breeding: ${onOff(s.breeding)}`, act: () => { s.breeding = !s.breeding; } },
        { label: () => `Death from old age: ${onOff(s.oldAge)}`, act: () => { s.oldAge = !s.oldAge; } },
        { label: () => `Filter hum: ${percentText(s.volume.filter)}`, act: () => { s.volume.filter = nextVolume(s.volume.filter); } },
        { label: () => `Bubbles: ${percentText(s.volume.bubbles)}`, act: () => { s.volume.bubbles = nextVolume(s.volume.bubbles); } },
        { label: () => `Feeding sounds: ${percentText(s.volume.feed)}`, act: () => { s.volume.feed = nextVolume(s.volume.feed); } },
        { label: () => `Music: ${percentText(s.volume.music)}`, act: () => { s.volume.music = nextVolume(s.volume.music); } },
        { label: 'Fullscreen', act: () => { Device.fullscreen(!Device.state().fullscreen).catch(() => undefined); } }, // if the system refuses, stay windowed
    ]);
}

function buildCard(ctx: Ctx): void {
    card = spawnUIEntity({
        world: ctx.world, parent: game.uiRoot ?? undefined,
        node: { position: UIPositionType.Absolute, insetLeft: px(16), insetTop: px(96), width: px(PANEL_W), height: px(4 * 24 + 16 + 4 * ROW_H) },
        visual: { color: DARK },
    });
    const box = spawnUIEntity({
        world: ctx.world, parent: card,
        node: { position: UIPositionType.Absolute, insetLeft: px(0), insetTop: px(6), width: px(PANEL_W), height: px(4 * 24) },
    });
    label(ctx, box, cardText, 16, TextAlign.Left);
    const selected = (): typeof game.tank.fish[number] | undefined => game.tank.fish.find((f) => f.id === game.selectedFish);
    const rows: [string | (() => string), () => void][] = [
        ['Rename', () => { const f = selected(); if (f) { f.name = ''; game.renaming = true; } }],
        [() => `Freeze age: ${onOff(selected()?.frozen ?? false)}`, () => { const f = selected(); if (f) f.frozen = !f.frozen; }],
        ['Remove from tank', () => { removeFish(game.tank, game.selectedFish); game.selectedFish = 0; }],
        ['Close', () => { game.selectedFish = 0; game.renaming = false; }],
    ];
    rows.forEach(([text, act], i) => button(ctx, card as Entity, 6, 4 * 24 + 12 + i * ROW_H, PANEL_W - 12, ROW_H - 4, text, act));
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
    const s = game.tank.settings;
    const toggle = (name: string) => (): void => { game.openPanel = game.openPanel === name ? '' : name; };
    const items: [string | (() => string), () => void][] = [
        ['Add fish', toggle('fish')], ['Food', toggle('food')], ['Decorate', toggle('decor')], ['Care', toggle('care')],
        ['Equipment', toggle('equip')], ['Settings', toggle('settings')],
        [() => (s.speedIndex === 0 ? 'Paused' : `Speed ${TIME.speeds[s.speedIndex]}x`), () => { s.speedIndex = (s.speedIndex + 1) % TIME.speeds.length; }],
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
    const selected = game.tank.fish.some((f) => f.id === game.selectedFish);
    if (!selected) game.selectedFish = 0;
    // The toolbar stays out of sight until the mouse reaches the bottom edge, or something is in use.
    const busy = game.openPanel !== '' || selected || game.tool !== 'feed' || game.renaming;
    if (game.mouseY < REVEAL_BELOW_Y + game.uiLift) game.uiShown = true;
    else if (!busy && game.mouseY > HIDE_ABOVE_Y + game.uiLift) game.uiShown = false;
    if (game.wallpaper) game.uiHidden = true;
    setEntityVisible(world, toolbar, !game.uiHidden && (game.uiShown || busy));
    setEntityVisible(world, hint, !game.uiHidden && game.hint !== '');
    setEntityVisible(world, showButton, game.uiHidden && !game.wallpaper);
    for (const [name, entity] of panels) setEntityVisible(world, entity, !game.uiHidden && game.openPanel === name);
    setEntityVisible(world, card, !game.uiHidden && selected);

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
