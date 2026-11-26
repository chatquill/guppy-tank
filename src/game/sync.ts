// One save for every way of running the game. A small helper on this computer (wallpaper/serve.ps1) keeps it;
// when the helper is not running, each copy of the game just uses its own browser storage, as before.
// Only one window looks after the tanks at a time: the one last used. Any other window follows it.
import { deserialize, serialize } from '../sim/save';
import type { SaveFile } from '../sim/types';
import { game, useSave } from './state';

const HELPER_PORT = 47815;
const PULL_EVERY = 5; // seconds between a following window's looks at the shared save
const RETRY_EVERY = 30; // seconds between attempts to find a helper that was not there
const TIMEOUT_MS = 1500;

interface Status {
    rev: number;
    owner: string;
    stale: boolean;
    save?: string | null;
}

interface Page {
    location?: { host?: string };
    GUPPY_HELPER_KEY?: string; // set by the Wallpaper Engine build: proves a page opened from a file is ours
    fetch?: (url: string, init?: { method?: string; body?: string; signal?: unknown }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
    AbortSignal?: { timeout?: (ms: number) => unknown };
}

const page = globalThis as Page;
// Served by the helper itself, the save is on the same address; from Wallpaper Engine's file it is across on localhost.
const base = page.location?.host === `localhost:${HELPER_PORT}` ? '' : `http://localhost:${HELPER_PORT}`;
const client = Array.from({ length: 12 }, () => Math.floor(Math.random() * 36).toString(36)).join('');

let available = false;
let busy = false;
let seenRev = -1;
let timer = 0;
let claim: Promise<unknown> | null = null; // a take-over still on its way to the helper

async function call(path: string, body?: string): Promise<Status | null> {
    if (!page.fetch) return null;
    try {
        const keyed = base && page.GUPPY_HELPER_KEY ? `${path}${path.includes('?') ? '&' : '?'}key=${page.GUPPY_HELPER_KEY}` : path;
        const reply = await page.fetch(`${base}${keyed}`, {
            method: body === undefined ? 'GET' : 'POST', body, signal: page.AbortSignal?.timeout?.(TIMEOUT_MS),
        });
        if (!reply.ok && reply.status !== 409) return null;
        const status = await reply.json() as Partial<Status>;
        return typeof status.rev === 'number' && typeof status.owner === 'string' ? status as Status : null;
    } catch {
        return null; // no helper: carry on alone
    }
}

function adopt(status: Status): SaveFile | null {
    seenRev = status.rev;
    return deserialize(status.save);
}

/** Look for the helper once at start-up. Gives back the shared save if there is one. */
export async function connect(): Promise<SaveFile | null> {
    const status = await call('/save');
    available = status !== null;
    if (!status) return null;
    // A view-only wallpaper leaves the tanks to whoever has them, unless nobody does.
    game.following = !status.stale && status.owner !== client && game.wallpaper;
    if (!game.following) await call(`/claim?client=${client}`, '');
    return adopt(status);
}

/** This window was just used: from now on it looks after the tanks. */
export function takeOver(): void {
    if (!available || !game.following || game.wallpaper) return;
    game.following = false;
    const sent = call(`/claim?client=${client}`, '').finally(() => { if (claim === sent) claim = null; });
    claim = sent;
}

async function push(): Promise<void> {
    if (claim) await claim; // the helper must hear the take-over before the save that follows it
    const status = await call(`/save?client=${client}`, serialize(game.save));
    if (!status) {
        available = false;
        return;
    }
    seenRev = status.rev;
    if (status.owner !== client) game.following = true; // another window has taken over
}

async function pull(): Promise<void> {
    const status = await call('/save');
    if (!status) {
        available = false;
        game.following = false;
        return;
    }
    if (!game.following) return; // this window was taken over while the answer was on its way
    if (status.stale || status.owner === client) {
        // The window that had the tanks has gone: carry on from here.
        game.following = false;
        await call(`/claim?client=${client}`, '');
        return;
    }
    if (status.rev === seenRev) return;
    const save = adopt(status);
    if (save) useSave(save);
}

/** Called every frame. `saved` is true on the frames the game has just written its own save. */
export function updateSync(dt: number, saved: boolean): void {
    timer += dt;
    if (busy) return;
    let job: Promise<void> | null = null;
    if (!available) {
        if (timer >= RETRY_EVERY) job = connect().then((save) => { if (save && game.following) useSave(save); });
    } else if (game.following) {
        if (timer >= PULL_EVERY) job = pull();
    } else if (saved) {
        job = push();
    }
    if (!job) return;
    timer = 0;
    busy = true;
    void job.finally(() => { busy = false; });
}
