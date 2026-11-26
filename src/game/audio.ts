import type { AudioAPI, AudioHandle } from 'esengine';
import { DECOR } from '../data/decor';
import { game } from './state';

const path = (name: string): string => `assets/audio/${name}.wav`;

let started = false;
let hum: AudioHandle | null = null;
let bubbling: AudioHandle | null = null;
let musicVolume = -1;

/** Start the looping beds once, then keep their volumes in step with the equipment and the sliders. */
export function updateAudio(audio: AudioAPI): void {
    const s = game.tank.settings;
    if (!started) {
        started = true;
        // A sound that fails to load must not stop the aquarium: it just stays silent.
        audio.playTrack(path('filter_hum'), { loop: true, volume: 0 }).then((h) => { hum = h; }).catch(() => { hum = null; });
        audio.playTrack(path('bubbles'), { loop: true, volume: 0 }).then((h) => { bubbling = h; }).catch(() => { bubbling = null; });
        audio.playBGM(path('music'), { volume: 1, fadeIn: 3 });
    }
    const hasBubbler = game.tank.decor.some((dc) => DECOR[dc.kind].category === 'bubbler');
    const loud = game.muted ? 0 : 1;
    hum?.setVolume(s.filterOn ? s.volume.filter * 0.5 * loud : 0);
    bubbling?.setVolume(s.airOn && hasBubbler ? s.volume.bubbles * 0.6 * loud : 0);
    if (musicVolume !== s.volume.music * loud) {
        musicVolume = s.volume.music * loud;
        audio.setMusicVolume(musicVolume);
    }
    for (const name of game.sounds) {
        if (s.volume.feed * loud > 0) audio.playSFX(path(name), { volume: s.volume.feed, pitch: 0.92 + Math.random() * 0.16 });
    }
    game.sounds.length = 0;
}
