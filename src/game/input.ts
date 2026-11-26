import type { InputState } from 'esengine';
import { TANK } from '../data/config';
import { DECOR } from '../data/decor';
import { FOODS } from '../data/foods';
import { trimPlant } from '../sim/plants';
import { dropFood, netFish, releaseFish, removeDecor, scrubAlgae, tapGlass, vacuumAt } from '../sim/tank';
import { clamp, floorY } from '../sim/util';
import { fishAt } from '../view/fishView';
import { decorAt } from '../view/tankView';
import { endRename, game } from './state';
import { takeOver } from './sync';

const DEPTH_FRONT_Y = -420; // mouse height that means "against the front glass"
const DEPTH_BACK_Y = -120; // ... and "against the back glass"
const MAX_NAME = 14;
const SCRUB_DISTANCE = 9000; // how far the scrubber must travel to clear a fully green pane

export function setTool(tool: typeof game.tool): void {
    if (game.tool === 'place' && tool !== 'place') dropHeld();
    game.tool = tool;
}

function dropHeld(): void {
    game.heldDecor = 0;
    game.heldIsNew = false;
}

function typeName(input: InputState): void {
    const fish = game.tank.fish.find((f) => f.id === game.selectedFish);
    if (!fish) {
        endRename();
        return;
    }
    for (const code of input.keysPressed) {
        if (code === 'Enter' || code === 'Escape' || code === 'NumpadEnter') {
            endRename();
        } else if (code === 'Backspace') {
            fish.name = fish.name.slice(0, -1);
        } else if (fish.name.length < MAX_NAME) {
            const letter = code.startsWith('Key') ? code.slice(3) : code.startsWith('Digit') ? code.slice(5) : code === 'Space' ? ' ' : '';
            const upper = fish.name.length === 0 || fish.name.endsWith(' ') || input.isKeyDown('ShiftLeft') || input.isKeyDown('ShiftRight');
            fish.name += upper ? letter : letter.toLowerCase();
        }
    }
}

function carryDecor(input: InputState, x: number, y: number): void {
    const held = game.tank.decor.find((dc) => dc.id === game.heldDecor);
    if (!held) {
        setTool('decorate');
        return;
    }
    // Sliding the mouse up the screen pushes the piece toward the back glass.
    held.x = clamp(x, TANK.left + 40, TANK.right - 40);
    held.d = clamp((DEPTH_BACK_Y - y) / (DEPTH_BACK_Y - DEPTH_FRONT_Y), 0, 1);
    if (input.isKeyPressed('KeyF')) held.flip = !held.flip;
    if (input.isKeyPressed('KeyR')) held.rot = (held.rot + (input.isKeyDown('ShiftLeft') ? -15 : 15)) % 360;
    if (input.isKeyPressed('Delete') || input.isKeyPressed('Backspace') || input.isMouseButtonPressed(2)) {
        removeDecor(game.tank, held.id);
        dropHeld();
        game.tool = 'decorate';
    } else if (input.isMouseButtonPressed(0)) {
        dropHeld();
        game.tool = 'decorate';
        game.sounds.push('click');
    }
}

/** A click with the net: over a fish it catches it; over open water it lets go of whatever it holds. */
function useNet(x: number, y: number, inWater: boolean): void {
    const fish = fishAt(x, y);
    const caught = fish ? netFish(game.tank, fish.id) : null;
    if (caught) {
        game.save.net.push(caught);
        game.sounds.push('splash');
    } else if (inWater && game.save.net.length > 0) {
        releaseFish(game.tank, game.save.net, x);
        game.save.net = [];
        game.sounds.push('plop');
    }
}

function hintFor(): string {
    switch (game.tool) {
        case 'place': {
            const held = game.tank.decor.find((dc) => dc.id === game.heldDecor);
            return `${held ? DECOR[held.kind].label : 'Decoration'}: move up to push it back, click to set down, F flip, R rotate, Delete to remove`;
        }
        case 'decorate': return 'Click a decoration to pick it up. Esc when you are done.';
        case 'vacuum': return 'Hold the mouse button over the gravel to lift the dirt. Mind the fry. Esc to put it away.';
        case 'scrub': return 'Hold the mouse button and rub the glass to clear algae. Esc to put it away.';
        case 'trim': return 'Click a plant to cut it back. Esc to put the scissors away.';
        case 'net': {
            const held = game.save.net.length;
            return held > 0
                ? `Net: holding ${held}. Click a fish to catch another, or click open water to let them go (in any tank). Esc to put it away.`
                : 'Click a fish to catch it, then open another tank and click the water to let it go. Esc to put the net away.';
        }
        default:
            if (game.renaming) return 'Type a name, then press Enter.';
            if (game.following) return 'Another window is looking after the tanks. Click here to take over.';
            return game.save.net.length > 0 ? `${game.save.net.length} in the net: open Tanks to let them go.` : '';
    }
}

/** Mouse and keyboard, once per frame. The pointer is ignored while it is over a button or panel. */
export function handleInput(input: InputState, x: number, y: number, overUi: boolean): void {
    const rubbed = Math.hypot(x - game.mouseX, y - game.mouseY);
    game.mouseX = x;
    game.mouseY = y;
    game.hint = hintFor();
    if (input.isMouseButtonPressed(0) || input.isMouseButtonPressed(2)) takeOver();
    if (game.renaming) {
        typeName(input);
        return;
    }
    if (input.isKeyPressed('Escape')) {
        setTool('feed');
        game.openPanel = '';
        game.selectedFish = 0;
    }
    if (input.isKeyPressed('KeyH')) game.uiHidden = !game.uiHidden;
    if (input.isKeyPressed('Space')) game.tank.settings.speedIndex = game.tank.settings.speedIndex === 0 ? 1 : 0;
    if (overUi) return;

    const tank = game.tank;
    const inWater = y < TANK.surfaceY + 40 && y > floorY(1) - 60;
    switch (game.tool) {
        case 'place':
            carryDecor(input, x, y);
            return;
        case 'decorate':
            if (input.isMouseButtonPressed(0)) {
                const hit = decorAt(x, y);
                if (hit) {
                    game.heldDecor = hit.id;
                    game.heldIsNew = false;
                    game.tool = 'place';
                }
            }
            return;
        case 'vacuum':
            if (input.isMouseButtonDown(0)) vacuumAt(tank, x, y);
            return;
        case 'scrub':
            // Algae comes off with rubbing, not with time: the further the pad travels, the more it clears.
            if (input.isMouseButtonDown(0)) scrubAlgae(tank, rubbed / SCRUB_DISTANCE);
            return;
        case 'trim':
            if (input.isMouseButtonPressed(0)) {
                const hit = decorAt(x, y);
                if (hit && trimPlant(tank, hit.id)) game.sounds.push('click');
            }
            return;
        case 'net':
            if (input.isMouseButtonPressed(0)) useNet(x, y, inWater);
            return;
        default:
            break;
    }
    if (input.isMouseButtonPressed(2) && inWater) {
        tapGlass(tank, x, y);
        game.sounds.push('click');
        return;
    }
    if (!input.isMouseButtonPressed(0)) return;
    const fish = fishAt(x, y);
    if (fish) {
        game.selectedFish = fish.id;
        game.openPanel = '';
    } else if (inWater && FOODS[game.food]) {
        dropFood(tank, game.food, x, y);
        game.sounds.push('plop');
        game.selectedFish = 0;
    }
}
