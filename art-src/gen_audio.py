"""Synthesised aquarium sounds: filter hum, bubbles, feeding plops, soft music."""
import os
import wave
import numpy as np

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'render', 'audio')
os.makedirs(OUT, exist_ok=True)
SR = 44100
rng = np.random.default_rng(3)


def write(name, x, peak=.8):
    x = x / (np.abs(x).max() + 1e-9) * peak
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes((x * 32767).astype(np.int16).tobytes())


def lowpass(x, cutoff):
    spec = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(spec / (1 + (freqs / cutoff) ** 4), len(x))


def loopable(x, fade=SR // 2):
    """Cross-fade the tail into the head so the clip loops without a click."""
    ramp = np.linspace(0, 1, fade)
    head = x[:fade] * ramp + x[-fade:] * (1 - ramp)
    return np.concatenate([head, x[fade:-fade]])


def filter_hum():
    n = SR * 6
    t = np.arange(n) / SR
    water = lowpass(rng.normal(0, 1, n), 900) * (.8 + .2 * np.sin(t * 2 * np.pi * .3))
    hum = .22 * np.sin(2 * np.pi * 50 * t) + .1 * np.sin(2 * np.pi * 100 * t) + .04 * np.sin(2 * np.pi * 150 * t)
    write('filter_hum', loopable(water / np.abs(water).max() * .55 + hum), .5)


def blip(f0, dur, rise=1.6):
    t = np.arange(int(SR * dur)) / SR
    f = f0 * (1 + rise * t / dur)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (dur * .35)) * np.clip(t / .004, 0, 1)


def bubbles():
    n = SR * 6
    x = np.zeros(n + SR)
    pos = 0
    while pos < n:
        b = blip(rng.uniform(500, 1500), rng.uniform(.03, .08)) * rng.uniform(.3, 1)
        x[pos:pos + len(b)] += b
        pos += int(rng.exponential(.05) * SR) + 200
    write('bubbles', loopable(lowpass(x[:n], 3500)), .55)


def plop():
    x = np.concatenate([blip(420, .09, 1.0), np.zeros(600)])
    x[:len(x)] += lowpass(rng.normal(0, 1, len(x)), 2500) * np.exp(-np.arange(len(x)) / (SR * .02)) * .4
    write('plop', x, .6)
    write('click', blip(900, .04, .2), .4)
    n = int(SR * 1.6)
    t = np.arange(n) / SR
    write('splash', lowpass(rng.normal(0, 1, n), 1800) * np.exp(-t / .5) * np.clip(t / .05, 0, 1), .6)


def music():
    """A slow, quiet pad: four long chords of soft detuned sines, loopable."""
    chords = [(220.0, 277.18, 329.63, 415.3), (196.0, 246.94, 293.66, 369.99),
              (174.61, 220.0, 261.63, 329.63), (196.0, 246.94, 293.66, 440.0)]
    seg = SR * 8
    x = np.zeros(seg * len(chords))
    t = np.arange(seg) / SR
    env = np.sin(np.pi * t / 8) ** 1.5
    for i, ch in enumerate(chords):
        part = np.zeros(seg)
        for f in ch:
            for det in (-.4, .4):
                part += np.sin(2 * np.pi * (f / 2 + det) * t + rng.uniform(0, 6)) * (.6 + .4 * np.sin(t * .7 + f))
            part += .25 * np.sin(2 * np.pi * f * t)
        x[i * seg:(i + 1) * seg] += part * env
    # overlap neighbouring chords so there is never silence between them
    x = x + np.roll(x, seg // 2) * .6
    write('music', lowpass(x, 1800), .45)


filter_hum(); bubbles(); plop(); music()
print('audio done', os.listdir(OUT))
