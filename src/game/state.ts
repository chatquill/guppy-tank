import type { Entity } from 'esengine';
import type { Tank } from '../sim/types';
import { createTank } from '../sim/tank';

export type Tool = 'feed' | 'decorate' | 'place' | 'vacuum' | 'scrub';

export interface TextureInfo {
    handle: number;
    width: number;
    height: number;
}

// Everything the view and UI share that is not part of the saved aquarium.
export interface Game {
    tank: Tank;
    ready: boolean;
    textures: Map<string, TextureInfo>;
    materials: Map<string, number>;
    tool: Tool;
    food: string;
    heldDecor: number; // id of the decoration being carried, 0 for none
    heldIsNew: boolean;
    selectedFish: number;
    renaming: boolean;
    wallpaper: boolean; // running as a desktop background: no menus, no mouse, no sound
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

const TASKBAR_CLEARANCE = 60;

export const game: Game = {
    tank: createTank(),
    ready: false,
    textures: new Map(),
    materials: new Map(),
    tool: 'feed',
    food: 'flakes',
    heldDecor: 0,
    heldIsNew: false,
    selectedFish: 0,
    renaming: false,
    // The wallpaper launcher opens the game with ?wallpaper on the address.
    wallpaper: /[?&]wallpaper/.test((globalThis as { location?: { search?: string } }).location?.search ?? ''),
    // Wallpaper Engine passes the mouse through, so there the tank stays playable: its page sets this flag.
    uiLift: (globalThis as { GUPPY_WALLPAPER_ENGINE?: boolean }).GUPPY_WALLPAPER_ENGINE ? TASKBAR_CLEARANCE : 0,
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

export const SAVE_KEY = 'guppy-tank.save.v2';
