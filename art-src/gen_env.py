"""Water, light, glass and substrate pictures for the tank.

Substrates are built from CC0 photo textures (Poly Haven); everything else is
computed. Usage: python gen_env.py <photo-texture-dir> <output-dir>
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

TEX_DIR, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)


def save(name, arr):
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(os.path.join(OUT, name + '.png'))


def tile_noise(size, cells, seed):
    """Smooth noise that wraps at the edges."""
    r = np.random.default_rng(seed)
    small = r.random((cells, cells))
    big = ndimage.zoom(np.tile(small, (3, 3)), size / cells, order=3)
    return big[size:2 * size, size:2 * size]


def caustics(seed, size=512, points=46):
    """Bright wandering lines where the rippled surface focuses the light."""
    r = np.random.default_rng(seed)
    pts = r.random((points, 2)) * size
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    # Warp the lookup so the cells are not straight-edged.
    xx = xx + (tile_noise(size, 8, seed + 1) - 0.5) * 70
    yy = yy + (tile_noise(size, 8, seed + 2) - 0.5) * 70
    f1 = np.full((size, size), 1e9, np.float32)
    f2 = np.full((size, size), 1e9, np.float32)
    for px, py in pts:
        for ox in (-size, 0, size):
            for oy in (-size, 0, size):
                dd = np.hypot(xx - px - ox, yy - py - oy)
                f2 = np.where(dd < f1, f1, np.minimum(f2, dd))
                f1 = np.minimum(f1, dd)
    edge = f2 - f1
    line = np.exp(-edge / 5.0) + 0.35 * np.exp(-edge / 16.0)
    line = line / line.max()
    img = np.zeros((size, size, 4))
    img[..., 0] = 255
    img[..., 1] = 255
    img[..., 2] = 240
    img[..., 3] = 255 * line ** 1.3
    return img


GRAINS = {'fine': 0.7, 'medium': 1.0, 'coarse': 1.5}
BED_W, FACE_H, EDGE_H, TOP_H = 2048, 300, 26, 72


def stones(src, size, rows, cols, seed):
    """A field of stones with no visible repeat: two cuts of the photo at different sizes, mixed in patches."""
    r = np.random.default_rng(seed)

    def cut(scale, flip):
        s = max(64, int(src.width * scale))
        img = np.asarray(src.resize((s, s), Image.LANCZOS), np.float32)
        if flip:
            img = img[:, ::-1]
        img = np.roll(img, (int(r.integers(s)), int(r.integers(s))), (0, 1))
        return np.tile(img, (rows // s + 2, cols // s + 2, 1))[:rows, :cols]

    def drift(cells, offset):
        return np.tile(tile_noise(2048, cells, seed + offset), (1, cols // 2048 + 1))[:rows, :cols]

    small, large = cut(size, False), cut(size * 1.45, True)
    mask = np.clip((drift(14, 5) - 0.5) * 6 + 0.5, 0, 1)[..., None]
    field = small * (1 - mask * 0.75) + large * mask * 0.75
    # Deeper shadow between the stones, and slow drifts of lighter and darker gravel.
    lum = field.mean(2, keepdims=True)
    soft = ndimage.gaussian_filter(lum, (6 * size / 0.3, 6 * size / 0.3, 0))
    field = field * np.clip(1 + (lum - soft) / 150, 0.55, 1.25)
    field *= (0.84 + 0.3 * drift(5, 9))[..., None]
    warm = drift(9, 11)[..., None] - 0.5
    field *= 1 + warm * np.array([0.08, 0.0, -0.1])
    # Scraps that collect in any tank: dark specks and the odd pale chip.
    for _ in range(rows * cols // 2600):
        y, x, rad = int(r.integers(rows)), int(r.integers(cols)), r.uniform(0.8, 2.4)
        y0, y1, x0, x1 = max(0, y - 4), min(rows, y + 5), max(0, x - 4), min(cols, x + 5)
        yy, xx = np.mgrid[y0:y1, x0:x1]
        dot = np.clip(1.2 - np.hypot((yy - y) * r.uniform(1, 2), xx - x) / rad, 0, 1)[..., None]
        tone = np.array([38, 30, 20]) if r.random() < 0.75 else np.array([205, 196, 176])
        field[y0:y1, x0:x1] = field[y0:y1, x0:x1] * (1 - dot * 0.8) + tone * dot * 0.8
    return field


def substrate(name, tex, pebble_scale, tint=(1, 1, 1), bright=1.0):
    """Front face of the gravel bed seen through the glass, plus the bed's top in perspective, at each grain size."""
    src = Image.open(os.path.join(TEX_DIR, tex + '_Diffuse.jpg')).convert('RGB')
    for index, (grain, factor) in enumerate(GRAINS.items()):
        size = pebble_scale * factor
        rows = FACE_H + EDGE_H
        face = stones(src, size, rows, BED_W, 40 + index) * np.array(tint) * bright
        # Less light reaches the bottom of the bed.
        face *= np.linspace(1.0, 0.45, rows)[:, None, None]
        # A bumpy top edge: stones stand a little proud of the line, bigger stones more so.
        bump = 3.5 * factor
        bumps = ndimage.gaussian_filter1d(rng.random(BED_W), bump, mode='wrap') * 2 - 1
        bumps = bumps / np.abs(bumps).max() * (4 + 3 * factor)
        row_index = np.arange(rows)[:, None]
        alpha = np.clip((row_index - (EDGE_H - bumps[None, :] - 10)) / 2.0, 0, 1)
        # The stones along the lip catch the lamp.
        face *= (1 + 0.25 * np.exp(-((row_index - EDGE_H + 4) / 9.0) ** 2))[..., None]
        save(f'substrate_{name}_{grain}', np.dstack([face, alpha * 255]))

        # Top surface: the same stones, squeezed by perspective and dimmer toward the back.
        flat = stones(src, size, 1024, BED_W * 2, 60 + index)
        top = np.zeros((TOP_H, BED_W, 3), np.float32)
        for row in range(TOP_H):
            t = row / (TOP_H - 1)  # 0 back .. 1 front
            scale = 0.6 + 0.4 * t
            src_row = int((t ** 1.6) * 1000)
            xs = ((np.arange(BED_W) - BED_W / 2) / scale + BED_W).astype(int) % flat.shape[1]
            top[row] = flat[src_row, xs] * (0.62 + 0.5 * t)
        top *= np.array(tint) * bright
        top = ndimage.gaussian_filter(top, (0.6, 0.4, 0))
        save(f'floor_{name}_{grain}', np.dstack([top, np.full((TOP_H, BED_W), 255.0)]))


def surface():
    """The underside of the water: a wavering mirror seen at a shallow angle."""
    w, h = 2048, 96
    n = np.zeros((h, w))
    for cells, amp, seed in ((8, 1.0, 1), (32, 0.6, 2), (64, 0.35, 3), (128, 0.2, 4)):
        base = tile_noise(w, cells, seed)[:h * 6:6]  # stretched sideways: shallow viewing angle
        n += base[:h] * amp
    n = (n - n.min()) / (n.max() - n.min())
    rows = np.linspace(0, 1, h)[:, None]  # 0 top (far) .. 1 bottom (near, the waterline)
    silver = np.clip((n - 0.42) * 3.2, 0, 1)
    img = np.zeros((h, w, 4))
    img[..., 0] = 120 + 135 * silver
    img[..., 1] = 150 + 105 * silver
    img[..., 2] = 140 + 110 * silver
    body = np.clip(rows * 1.5, 0, 1) * (0.35 + 0.65 * silver)
    body = body * np.clip((1 - rows) * 9, 0, 1) ** 0.5
    line = np.exp(-((rows - 0.9) / 0.035) ** 2)  # the bright meniscus against the front glass
    img[..., 3] = 255 * np.clip(body * 0.85 + line * 0.9, 0, 1)
    img[..., :3] = img[..., :3] * (1 - line[..., None] * 0.0) + line[..., None] * 60
    save('surface', img)


def light_fall():
    """Multiplied over the water: bright under the lamp, dim near the bed and in the corners."""
    w, h = 256, 256
    y = np.linspace(0, 1, h)[:, None]
    x = np.linspace(-1, 1, w)[None, :]
    v = 1.0 - 0.3 * y ** 1.3
    v = v * (1 - 0.22 * np.abs(x) ** 2.6)
    v = v + (rng.random((h, w)) - 0.5) * 0.012
    img = np.dstack([v * 255, v * 255 * 1.0, v * 252, np.full((h, w), 255.0)])
    save('light_fall', img)


def glass_edge():
    """The pane seen edge-on at a corner of the tank: green glass, a bright line, a silicone bead."""
    w, h = 48, 512
    x = np.linspace(0, 1, w)[None, :]
    y = np.linspace(0, 1, h)[:, None]
    base = np.array([34, 62, 56], np.float32)
    img = np.ones((h, w, 3)) * base
    img *= (0.55 + 0.75 * np.exp(-((x - 0.35) / 0.25) ** 2))[..., None]
    img += (np.exp(-((x - 0.62) / 0.03) ** 2) * (120 + 80 * np.sin(y * 9) ** 2))[..., None] * np.array([0.8, 1.0, 0.95])
    img *= (1 - 0.35 * y)[..., None]
    bead = np.clip((x - 0.86) / 0.05, 0, 1)
    img = img * (1 - bead[..., None]) + bead[..., None] * 6
    alpha = np.full((h, w), 255.0)
    save('glass_edge', np.dstack([img, alpha]))


def backgrounds():
    w, h = 512, 512
    y = np.linspace(0, 1, h)[:, None]
    x = np.linspace(-1, 1, w)[None, :]
    grain = (rng.random((h, w, 1)) - 0.5) * 2.0

    def grad(top, bottom, glow):
        top, bottom = np.array(top, np.float32), np.array(bottom, np.float32)
        g = top * (1 - y[..., None]) ** 1.6 + bottom * (1 - (1 - y[..., None]) ** 1.6)
        g = g * (1 + glow * np.exp(-(x ** 2) / 0.5)[..., None] * (1 - y[..., None]))
        return np.dstack([g + grain, np.full((h, w), 255.0)])

    save("bg_black", grad((26, 33, 34), (5, 7, 8), 0.6))
    save('bg_blue', grad((18, 52, 92), (4, 12, 28), 0.5))
    save('bg_frosted', grad((176, 196, 196), (54, 70, 74), 0.25))


def small_things():
    # Bubble: a clear ball of air, bright rim above, dark rim below, one hard glint.
    s = 64
    yy, xx = (np.mgrid[0:s, 0:s] - (s - 1) / 2) / (s / 2)
    r = np.hypot(xx, yy)
    inside = np.clip((1 - r) * 12, 0, 1)
    rim = np.exp(-((r - 0.86) / 0.09) ** 2)
    shade = 0.5 - 0.5 * yy  # top bright
    img = np.zeros((s, s, 4))
    lum = 110 + 145 * shade
    img[..., 0] = lum * 0.94
    img[..., 1] = lum
    img[..., 2] = lum
    glint = np.exp(-(((xx + 0.34) / 0.14) ** 2 + ((yy + 0.38) / 0.1) ** 2))
    alpha = inside * (0.1 + 0.75 * rim * (0.45 + 0.55 * np.abs(yy))) + glint * 0.95
    img[..., :3] += glint[..., None] * 140
    img[..., 3] = 255 * np.clip(alpha, 0, 1)
    save('bubble', img)

    s = 16
    yy, xx = (np.mgrid[0:s, 0:s] - (s - 1) / 2) / (s / 2)
    dot = np.exp(-(xx ** 2 + yy ** 2) / 0.12)
    save('mote', np.dstack([np.full((s, s), 235.0), np.full((s, s), 240.0), np.full((s, s), 225.0), dot * 255]))

    # Soft round shadow for anything resting on the bed.
    s = 128
    yy, xx = (np.mgrid[0:s, 0:s] - (s - 1) / 2) / (s / 2)
    sh = np.clip(1 - np.hypot(xx, yy), 0, 1) ** 1.5
    save('shadow', np.dstack([np.zeros((s, s, 3)), sh * 255]))
    save('white', np.full((8, 8, 4), 255.0))

    # Faint reflections of a dim room on the front pane.
    w, h = 512, 288
    y = np.linspace(0, 1, h)[:, None]
    x = np.linspace(0, 1, w)[None, :]
    streak = np.exp(-(((x - 0.82) + (y - 0.2) * 0.25) / 0.05) ** 2) * np.clip(1 - y * 1.6, 0, 1)
    streak += 0.5 * np.exp(-(((x - 0.74) + (y - 0.2) * 0.25) / 0.015) ** 2) * np.clip(1 - y * 1.9, 0, 1)
    save('glass_reflection', np.dstack([np.full((h, w), 255.0), np.full((h, w), 255.0), np.full((h, w), 255.0), streak * 11]))


def algae():
    """Green spot algae on the front pane: a film of fine specks, thicker in patches."""
    size = 256
    patch = np.clip((tile_noise(size, 4, 31) - 0.42) * 3.0, 0, 1)
    yy, xx = (np.mgrid[0:size, 0:size] - (size - 1) / 2) / (size / 2)
    patch = patch * np.clip(1.15 - np.hypot(xx, yy), 0, 1) ** 1.5
    specks = ndimage.gaussian_filter((rng.random((size, size)) > 0.86).astype(np.float32), 0.7)
    film = 0.22 * tile_noise(size, 16, 32)
    alpha = np.clip(patch * (specks * 2.4 + film), 0, 1)
    tone = tile_noise(size, 32, 33)[..., None]
    colour = np.array([38, 74, 24]) * (1 - tone) + np.array([70, 96, 30]) * tone
    save('algae', np.dstack([colour, alpha * 235]))


def rays():
    """Shafts of lamp light picked out by fine dust in the water: soft, slanted, fading with depth."""
    w, h = 1024, 512
    r = np.random.default_rng(5)
    line = np.zeros(w)
    for cells, amp in ((8, 1.0), (16, 0.7), (64, 0.3)):
        small = r.random(cells)
        line += ndimage.zoom(np.tile(small, 3), w / cells, order=3)[w:2 * w] * amp
    line = (line - line.min()) / (line.max() - line.min())
    line = np.clip((line - 0.45) * 2.2, 0, 1) ** 1.6
    y = np.linspace(0, 1, h)[:, None]
    cols = (np.arange(w)[None, :] + (y * 90).astype(int)) % w  # lean the shafts a little
    img = line[cols]
    img = ndimage.gaussian_filter(img, (0, 3), mode='wrap')
    fade = (1 - y) ** 1.4 * np.clip(y * 14, 0, 1)
    alpha = img * fade
    save('rays', np.dstack([np.full((h, w), 255.0), np.full((h, w), 252.0), np.full((h, w), 232.0), alpha * 255]))


algae()
rays()
save('caustics_a', caustics(11))
save('caustics_b', caustics(23, points=30))
substrate('gravel_natural', 'clean_pebbles', 0.42, bright=1.05)
substrate('gravel_black', 'pebbles', 0.36, tint=(0.62, 0.64, 0.68), bright=0.8)
substrate('gravel_river', 'ganges_river_pebbles', 0.2)
substrate('sand', 'gravel_floor_02', 0.3, tint=(1.0, 0.95, 0.84), bright=1.02)
surface()
light_fall()
glass_edge()
backgrounds()
small_things()
print('env done')
