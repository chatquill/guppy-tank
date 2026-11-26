import type { Entity } from 'esengine';
import { MAX_TANKS } from '../data/config';
import { newSave } from '../sim/save';
import { createTank } from '../sim/tank';
import type { SaveFile, Tank } from '../sim/types';

export type Tool = 'feed' | 'decorate' | 'place' | 'vacuum' | 'scrub' | 'net' | 'trim';

export interface TextureInfo {
    handle: number;
    width: number;
    height: number;
}

/** What the page it runs in can ask of the game: Wallpaper Engine's settings arrive here. */
export interface HostOptions {
    tank?: string; // '1'..'4', or 'last' for whichever was open
    menus?: boolean;
    sound?: boolean;
    realclock?: boolean;
}

// Everything the view and UI share that is not part of the saved aquariums.
export interface Game {
    save: SaveFile;
    tank: Tank; // the tank on screen: always save.tanks[save.current]
    viewEpoch: number; // goes up whenever a different tank comes on screen, so the view starts afresh
    ready: boolean;
    textures: Map<string, TextureInfo>;
    materials: Map<string, number>;
    tool: Tool;
    food: string;
    heldDecor: number; // id of the decoration being carried, 0 for none
    heldIsNew: boolean;
    selectedFish: number;
    pickSpecies: string; // the species open in the Add fish menu
    renaming: boolean;
    removeArmed: number; // seconds left in which a second click really removes the tank
    wallpaper: boolean; // running as a desktop background: no menus, no mouse, no sound
    following: boolean; // another window is looking after the tanks: this one only shows them
    menusOff: boolean; // the host asked for no menus
    muted: boolean;
    uiLift: number; // pixels to raise the menus by, to clear the Windows taskbar when the tank is the desktop
    uiHidden: boolean; // H: nothing but the tank, even at the screen edge
    uiShown: boolean; // the toolbar is slid in right now
    openPanel: string;
    saveTimer: number;
    darkness: number; // 0 day .. 1 night, eased
    mouseX: number;
    mouseY: number;
    uiRoot: Entity | null;
    sounds: string[]; // one-shots queued for this frame
    hint: string;
}

interface Host {
    location?: { search?: string };
    GUPPY_WALLPAPER_ENGINE?: boolean;
    GUPPY_OPTIONS?: HostOptions;
}

const host = globalThis as Host;
const TASKBAR_CLEARANCE = 60;
const firstSave = newSave(createTank());

export const game: Game = {
    save: firstSave,
    tank: firstSave.tanks[0],
    viewEpoch: 0,
    ready: false,
    textures: new Map(),
    materials: new Map(),
    tool: 'feed',
    food: 'flakes',
    heldDecor: 0,
    heldIsNew: false,
    selectedFish: 0,
    pickSpecies: 'guppy',
    renaming: false,
    removeArmed: 0,
    // The wallpaper launcher opens the game with ?wallpaper on the address.
    wallpaper: /[?&]wallpaper/.test(host.location?.search ?? ''),
    following: false,
    menusOff: false,
    muted: false,
    // Wallpaper Engine passes the mouse through, so there the tank stays playable: its page sets this flag.
    uiLift: host.GUPPY_WALLPAPER_ENGINE ? TASKBAR_CLEARANCE : 0,
    uiHidden: false,
    uiShown: false,
    openPanel: '',
    saveTimer: 0,
    darkness: 0,
    mouseX: 0,
    mouseY: 0,
    uiRoot: null,
    sounds: [],
    hint: '',
};

/** The settings the hosting page has asked for, if it has any. */
export const hostOptions = (): HostOptions => host.GUPPY_OPTIONS ?? {};

/** Stop typing a name. A fish is never left without one. */
export function endRename(): void {
    game.renaming = false;
    for (const tank of game.save.tanks) for (const f of tank.fish) if (f.name.trim() === '') f.name = 'Fish';
}

/** Put a loaded or received save on screen. */
export function useSave(save: SaveFile): void {
    endRename();
    game.removeArmed = 0;
    game.save = save;
    game.tank = save.tanks[save.current];
    game.viewEpoch += 1;
    game.selectedFish = 0;
    game.heldDecor = 0;
}

export function showTank(index: number): void {
    if (index < 0 || index >= game.save.tanks.length || index === game.save.current) return;
    game.save.current = index;
    useSave(game.save);
    if (game.tool === 'place' || game.tool === 'decorate') game.tool = 'feed';
}

/** A new, empty tank set up like the one on screen. Returns false when there is no room for another. */
export function addTank(): boolean {
    const tanks = game.save.tanks;
    if (tanks.length >= MAX_TANKS) return false;
    const numbers = tanks.map((tank) => Number(/^Tank (\d+)$/.exec(tank.name)?.[1] ?? 0));
    const tank = createTank(`Tank ${Math.max(0, ...numbers) + 1}`);
    tank.settings = { ...game.tank.settings, volume: { ...game.tank.settings.volume }, speedIndex: 1 };
    tanks.push(tank);
    showTank(tanks.length - 1);
    return true;
}

/** Take down the tank on screen, with everything in it. The last tank cannot be removed. */
export function removeTank(): void {
    const { tanks, current } = game.save;
    if (tanks.length <= 1) return;
    tanks.splice(current, 1);
    game.save.current = Math.min(current, tanks.length - 1);
    useSave(game.save);
}

export const SAVE_KEY = 'guppy-tank.save.v3';
export const OLD_SAVE_KEY = 'guppy-tank.save.v2';
