"""Turn cut-out photographs of real aquarium animals into swim-cycle sprite sheets.

Each photo is straightened, turned to face right and fitted into a frame, then
bent through one tail beat as a fish seen from the side would appear: the rear
of the body swings toward and away from the viewer (so it shortens and lengthens),
with a slight vertical wave and a ripple running down the fins. How far an animal
bends is set per animal in MOTION; a shrimp only paddles its legs and a snail only
flexes its foot.

Beside each fish sheet two more are made:
  <name>_ich   half-size sheet, clear except for white-spot-disease dots that ride on the fish
  <name>_torn  the same fish with ragged, bitten fins (long-finned animals only)

Usage: python fish_photo.py <cutout-dir> <output-dir> [--preview] [--only name,name]
"""
import os
import sys
import zlib

import numpy as np
from PIL import Image
from scipy import ndimage

CUT, OUT = sys.argv[1], sys.argv[2]
PREVIEW = '--preview' in sys.argv
ONLY = sys.argv[sys.argv.index('--only') + 1].split(',') if '--only' in sys.argv else None
FW, FH = 256, 160  # one frame
COLS, ROWS = 4, 4  # sixteen frames of one tail beat
FILL = 0.92  # how much of the frame width the fish spans

# name: (photo, which blob (0 = largest, by area), degrees to rotate anticlockwise to level it, faces left in photo)
FISH = {
    'm_cobra_yellow': ('004', 0, -24, False),
    'm_halfblack': ('007', 0, -14, True),
    'm_cobra_green': ('015', 0, 2, True),
    'm_blue_grass': ('024', 0, 4, False),
    'm_tiger': ('073', 0, -14, False),
    'm_gold': ('030', 0, 10, True),
    'f_grey': ('047', 0, 3, False),
    'f_gold': ('042', 0, 4, True),
    'f_tuxedo': ('052', 0, -2, False),
    'f_snake': ('048', 0, 12, True),
    'young': ('006', 1, 10, True),
    'fry': ('066', 0, 3, False),
    'endler_m': ('100', 0, 0, False),
    'endler_f': ('101', 0, 0, False),
    'platy_red': ('102', 0, -10, True),
    'platy_sunset': ('103', 0, 0, False),
    'molly_black': ('137', 0, 22, True),
    'molly_dalmatian': ('105', 0, -14, False),
    'sword_m': ('106', 0, 0, True),
    'sword_f': ('108', 0, 14, False),
    'cory_bronze': ('111', 0, 3, False),
    'cory_panda': ('112', 0, 0, True),
    'oto': ('114', 0, 15, False),
    'neon': ('131', 0, 3, True),
    'harlequin': ('116', 0, -5, False),
    'shrimp_cherry': ('118', 0, 31, True),
    'snail_ramshorn': ('120', 0, 0, False),
    'betta_m_red': ('122', 0, 0, True),
    'betta_m_blue': ('123', 0, 0, True),
    'betta_f': ('126', 0, 4, False),
    'gourami_m': ('127', 0, 0, True),
    'gourami_f': ('133', 0, 28, True),
    'pleco': ('136', 0, -12, True),
}

# How each animal moves. swing: sideways tail swing in body lengths; power: how far back the bend starts;
# lift: vertical wave; ripple: fin flutter; shade: light change as the flank turns.
GUPPY = {'kind': 'fish', 'swing': 0.20, 'power': 2.2, 'lift': 0.022, 'ripple': 0.012, 'shade': 0.16}
STIFF = {'kind': 'fish', 'swing': 0.085, 'power': 2.6, 'lift': 0.010, 'ripple': 0.008, 'shade': 0.07}
FLOWING = {'kind': 'fish', 'swing': 0.13, 'power': 2.0, 'lift': 0.016, 'ripple': 0.020, 'shade': 0.10}
MOTION = {
    'platy_red': STIFF, 'platy_sunset': STIFF, 'cory_bronze': STIFF, 'cory_panda': STIFF, 'pleco': STIFF, 'oto': STIFF,
    'gourami_m': STIFF, 'gourami_f': STIFF,
    'betta_m_red': FLOWING, 'betta_m_blue': FLOWING, 'betta_f': FLOWING,
    'shrimp_cherry': {'kind': 'shrimp'},
    'snail_ramshorn': {'kind': 'snail'},
}
# Cut-outs where the background remover punched a hole in the body: close fully enclosed holes.
FILL_HOLES = {'endler_m'}
# Long-finned animals that get a torn-fin sheet: name -> how much of the length, from the tail tip, may be bitten.
TORN = {
    'm_cobra_yellow': 0.34, 'm_halfblack': 0.34, 'm_cobra_green': 0.34, 'm_blue_grass': 0.34, 'm_tiger': 0.34, 'm_gold': 0.34,
    'endler_m': 0.26, 'sword_m': 0.30, 'betta_m_red': 0.50, 'betta_m_blue': 0.50, 'betta_f': 0.30, 'gourami_m': 0.22,
    'molly_black': 0.26, 'molly_dalmatian': 0.26, 'molly_gold': 0.26,
}
# Things the background remover left stuck to an animal: name -> (left, right, top, bottom as fractions of the cut-out, which pixels).
ERASE = {
    'oto': (0.86, 1.0, 0.80, 1.0, 'light'),  # the algae wafer it was eating
    'cory_panda': (0.53, 0.66, 0.78, 0.94, 'dark'),  # a pebble under the belly
}
NO_ICH = {'shrimp_cherry', 'snail_ramshorn'}


def blob(rgba, index):
    """Keep one connected fish from a cut-out that may hold several things."""
    alpha = rgba[..., 3] > 60
    labels, count = ndimage.label(alpha)
    sizes = ndimage.sum(alpha, labels, range(1, count + 1))
    keep = np.argsort(sizes)[::-1][index] + 1
    mask = ndimage.binary_dilation(labels == keep, iterations=6)
    out = rgba.copy()
    out[..., 3] = np.where(mask, rgba[..., 3], 0)
    ys, xs = np.where(mask)
    return out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def base_frame(name):
    photo, index, angle, faces_left = FISH[name]
    rgba = np.asarray(Image.open(os.path.join(CUT, photo + '.png')).convert('RGBA'))
    if name in FILL_HOLES:
        solid = ndimage.binary_fill_holes(rgba[..., 3] > 128)
        rgba = rgba.copy()
        rgba[..., 3] = np.where(solid & (rgba[..., 3] < 128), 255, rgba[..., 3])
    if name in ERASE:
        left, right, top, bottom, which = ERASE[name]
        ys, xs = np.where(rgba[..., 3] > 40)
        fx = (np.arange(rgba.shape[1])[None, :] - xs.min()) / (xs.max() - xs.min())
        fy = (np.arange(rgba.shape[0])[:, None] - ys.min()) / (ys.max() - ys.min())
        tone = rgba[..., :3].min(axis=2) > 150 if which == 'light' else rgba[..., :3].max(axis=2) < 95
        junk = ndimage.binary_dilation(tone & (fx > left) & (fx < right) & (fy > top) & (fy < bottom), iterations=3)
        rgba = rgba.copy()
        rgba[..., 3] = np.where(junk, 0, rgba[..., 3])
    im = Image.fromarray(blob(rgba, index))
    im = im.rotate(angle, resample=Image.BICUBIC, expand=True)
    if faces_left:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    box = im.getchannel('A').point(lambda a: 255 if a > 40 else 0).getbbox()
    im = im.crop(box)
    scale = min(FW * FILL / im.width, FH * 0.94 / im.height)
    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    # Tighten the matte a touch so no halo of the old background survives.
    a = np.asarray(im.getchannel('A'), np.float32) / 255
    a = np.clip((a - 0.25) / 0.6, 0, 1)
    arr = np.asarray(im, np.float32).copy()
    arr[..., 3] = a * 255
    frame = np.zeros((FH, FW, 4), np.float32)
    x0 = (FW - im.width) // 2
    y0 = (FH - im.height) // 2
    frame[y0:y0 + im.height, x0:x0 + im.width] = arr
    return frame, x0 + im.width, im.width  # nose x, length


def sample(frame, src_y, src_x):
    """Pull the picture through a warp. Premultiplied so the clear pixels around the animal do not bleed dark fringes in."""
    pre = frame.copy()
    pre[..., :3] *= frame[..., 3:4] / 255
    out = np.zeros_like(frame)
    for c in range(4):
        out[..., c] = ndimage.map_coordinates(pre[..., c], [src_y, src_x], order=1, mode='constant')
    return out


def unpremultiply(out, shade=None):
    alpha = np.clip(out[..., 3:4], 1e-3, 255)
    if shade is None:
        out[..., :3] = np.clip(out[..., :3] / alpha * 255, 0, 255)
    else:
        out[..., :3] = np.clip(out[..., :3] / alpha * 255 * shade[..., None], 0, 255)
    return out


def swim_frame(frame, nose_x, length, phase, motion=GUPPY, lit=True):
    """Bend the fish through one moment of the tail beat."""
    n = 200
    s0 = np.linspace(0, 1, n)  # along the fish, nose to tail tip, unbent
    amp = motion['swing'] * s0 ** motion['power']  # sideways swing, in body lengths
    wave = phase - 5.2 * s0
    slope = np.gradient(amp * np.sin(wave), s0)
    theta = np.arctan(slope)
    seen = np.concatenate([[0], np.cumsum(np.cos(theta[:-1]) * np.diff(s0))])  # where each point lands when viewed side-on
    seen = seen / seen[-1] * (1 - 0.035 * (1 - np.cos(theta).mean()) * 10)

    ys, xs = np.mgrid[0:FH, 0:FW].astype(np.float32)
    s_out = np.clip((nose_x - xs) / length, 0, 1.2)
    s_src = np.interp(s_out, seen, s0, right=1.2)
    lift = motion['lift'] * length * np.interp(s_src, s0, s0 ** 1.8 * np.sin(wave + 0.6))
    # Fins trail the body: a finer ripple that grows away from the midline.
    mid = FH / 2
    ripple = motion['ripple'] * length * np.sin(phase * 1.0 - 9.0 * s_src + (ys - mid) / FH * 3.0) * np.clip(s_src - 0.45, 0, 1) * 2
    src_x = nose_x - s_src * length
    src_y = ys - lift - ripple
    out = sample(frame, src_y, src_x)
    # The side turned toward the lamp catches a little more light.
    shade = 1 + motion['shade'] * np.interp(s_src, s0, np.sin(theta))
    return unpremultiply(out, shade if lit else None)


def extent(frame):
    ys, xs = np.where(frame[..., 3] > 40)
    return xs.min(), xs.max(), ys.min(), ys.max()


def shrimp_frame(frame, phase):
    """A shrimp holds its body stiff: only the legs and swimmerets under it paddle, in a wave running tailward."""
    x0, x1, y0, y1 = extent(frame)
    length = x1 - x0
    ys, xs = np.mgrid[0:FH, 0:FW].astype(np.float32)
    weight = frame[..., 3] / 255
    belly = (ys * weight).sum() / weight.sum() + 0.10 * (y1 - y0)  # a little under the middle of the body
    under = np.clip((ys - belly) / max(1.0, y1 - belly), 0, 1) ** 1.4
    along = 2 * phase + (xs - x0) / length * 14.0
    src_x = xs - 0.016 * length * np.sin(along) * under
    src_y = ys - 0.006 * length * np.cos(along) * under
    return unpremultiply(sample(frame, src_y, src_x))


def snail_frame(frame, phase):
    """A snail does not bend: its foot lengthens and shortens a hair as it creeps, and the shell settles with it."""
    x0, x1, y0, y1 = extent(frame)
    height = y1 - y0
    ys, xs = np.mgrid[0:FH, 0:FW].astype(np.float32)
    foot = np.clip((ys - (y1 - 0.26 * height)) / (0.26 * height), 0, 1)  # 0 on the shell, 1 at the sole
    centre = (x0 + x1) / 2
    stretch = 1 + 0.028 * np.sin(phase) * foot
    crawl = 0.9 * np.sin(2 * phase - (xs - x0) / (x1 - x0) * 9.0) * foot  # muscle waves along the sole
    src_x = centre + (xs - centre) / stretch + crawl
    src_y = y1 + (ys - y1) * (1 + 0.012 * np.sin(phase))  # anchored on the ground
    return unpremultiply(sample(frame, src_y, src_x))


def moved(name, frame, nose_x, length, phase, lit=True):
    motion = MOTION.get(name, GUPPY)
    if motion['kind'] == 'shrimp':
        return shrimp_frame(frame, phase)
    if motion['kind'] == 'snail':
        return snail_frame(frame, phase)
    return swim_frame(frame, nose_x, length, phase, motion, lit)


def spots(name, frame, also=None):
    """White spot disease: salt-grain dots scattered over the body and fins, as a layer that is bent with the fish."""
    rng = np.random.default_rng(zlib.crc32(name.encode()))
    solid = frame[..., 3] > 150
    if also is not None:  # keep clear of fin that the torn sheet has lost
        solid &= also[..., 3] > 150
    solid = ndimage.binary_erosion(solid, iterations=2)
    ys, xs = np.where(solid)
    count = int(np.clip(len(ys) / 300, 25, 40))
    gap = max(3.0, np.sqrt(len(ys) / count) * 0.55)
    chosen = []
    for i in rng.permutation(len(ys)):
        p = np.array([ys[i], xs[i]], np.float32)
        if all(np.hypot(*(p - q)) > gap for q in chosen):
            chosen.append(p)
            if len(chosen) == count:
                break
    yy, xx = np.mgrid[0:FH, 0:FW].astype(np.float32)
    cover = np.zeros((FH, FW), np.float32)
    for cy, cx in chosen:
        radius = rng.uniform(1.5, 2.5)
        away = np.hypot(yy - cy - rng.uniform(-0.5, 0.5), xx - cx - rng.uniform(-0.5, 0.5))
        cover = np.maximum(cover, np.clip(1.25 - away / radius, 0, 1) ** 1.5 * rng.uniform(0.75, 1.0))
    layer = np.zeros_like(frame)
    layer[..., :3] = (255, 255, 250)
    layer[..., 3] = cover * 255
    return layer


def torn(name, frame, reach):
    """Bitten fins: splits running in along the fin rays, a few bites and a frayed edge, all within `reach` of the tail tip."""
    rng = np.random.default_rng(zlib.crc32(name.encode()) + 7)
    alpha = frame[..., 3] / 255
    solid = alpha > 0.5
    x0, x1, y0, y1 = extent(frame)
    length = x1 - x0
    limit = x0 + reach * length  # nothing right of this is touched: the body stays whole
    yy, xx = np.mgrid[0:FH, 0:FW].astype(np.float32)
    weight = alpha * (xx > limit) * (xx < limit + 0.25 * length)
    root = np.array([(yy * weight).sum() / weight.sum(), limit + 0.10 * length])  # roughly where the fin rays fan out from
    edge = solid & ~ndimage.binary_erosion(solid) & (xx < limit - 0.04 * length)
    ey, ex = np.where(edge)
    depth_in = ndimage.distance_transform_edt(solid)
    cut = np.zeros((FH, FW), np.float32)

    def toward_root(py, px):
        d = root - (py, px)
        return d / (np.hypot(*d) + 1e-6)

    order = rng.permutation(len(ey))
    picked = []
    for i in order:  # where the splits start
        p = np.array([ey[i], ex[i]], np.float32)
        if all(np.hypot(*(p - q)) > 5 for q in picked):
            picked.append(p)
        if len(picked) >= 18:
            break
    for p in picked:
        d = toward_root(*p) + rng.normal(0, 0.12, 2)
        d /= np.hypot(*d)
        deep = rng.uniform(0.07, 0.20) * length
        wide = rng.uniform(1.3, 3.2)
        along = (yy - p[0]) * d[0] + (xx - p[1]) * d[1]
        across = (yy - p[0]) * -d[1] + (xx - p[1]) * d[0] + 1.2 * np.sin(along * 0.35 + rng.uniform(0, 6))
        width = wide * np.clip(1 - along / deep, 0, 1) ** 0.8
        cut = np.maximum(cut, np.clip(width - np.abs(across) + 0.5, 0, 1) * (along > -4) * (along < deep))
    for i in order[18:23]:  # bites
        p = np.array([ey[i], ex[i]], np.float32) - toward_root(ey[i], ex[i]) * 2
        radius = rng.uniform(0.030, 0.055) * length
        lumpy = radius * (1 + 0.18 * np.sin(np.arctan2(yy - p[0], xx - p[1]) * 5 + rng.uniform(0, 6)))
        cut = np.maximum(cut, np.clip(lumpy - np.hypot(yy - p[0], xx - p[1]) + 0.5, 0, 1))
    # Frayed margin: nibble the outermost few pixels unevenly, in streaks that follow the rays.
    angle = np.arctan2(yy - root[0], xx - root[1])
    grain = ndimage.gaussian_filter(rng.random((FH, FW)).astype(np.float32), 0.8)
    grain = (grain - grain.mean()) / grain.std()
    rays = np.sin(angle * 70 + rng.uniform(0, 6)) * 0.6 + grain * 0.8
    cut = np.maximum(cut, np.clip((1.6 + rays * 2.2 - depth_in) / 1.5, 0, 1))
    zone = np.clip((limit - xx) / (0.05 * length), 0, 1)  # the damage fades out toward the body
    out = frame.copy()
    out[..., 3] = frame[..., 3] * (1 - cut * zone)
    # Shreds cut loose from the fin would hang in the water: drop them.
    labels, count = ndimage.label(out[..., 3] > 60)
    if count > 1:
        sizes = ndimage.sum(np.ones_like(labels), labels, range(1, count + 1))
        out[..., 3] *= ndimage.binary_dilation(labels == (np.argmax(sizes) + 1), iterations=2)
    return out


def write_sheet(name, frame, nose_x, length, path, half=False, lit=True):
    big = np.zeros((FH * ROWS, FW * COLS, 4), np.float32)
    for i in range(COLS * ROWS):
        f = moved(name, frame, nose_x, length, 2 * np.pi * i / (COLS * ROWS), lit)
        r, c = divmod(i, COLS)
        big[r * FH:(r + 1) * FH, c * FW:(c + 1) * FW] = f
    if half:  # averaged in premultiplied colour so the spots keep their white
        big[..., :3] *= big[..., 3:4] / 255
        big = big.reshape(FH * ROWS // 2, 2, FW * COLS // 2, 2, 4).mean(axis=(1, 3))
        big[..., :3] = big[..., :3] / np.clip(big[..., 3:4], 1e-3, 255) * 255
    Image.fromarray(np.clip(big, 0, 255).astype(np.uint8)).save(path)


def sheet(name):
    frame, nose_x, length = base_frame(name)
    write_sheet(name, frame, nose_x, length, os.path.join(OUT, name + '.png'))
    ragged = None
    if name in TORN:
        ragged = torn(name, frame, TORN[name])
        write_sheet(name, ragged, nose_x, length, os.path.join(OUT, name + '_torn.png'))
    if name not in NO_ICH:
        write_sheet(name, spots(name, frame, ragged), nose_x, length, os.path.join(OUT, name + '_ich.png'), half=True, lit=False)
    return length / FW


os.makedirs(OUT, exist_ok=True)
names = [n for n in FISH if not ONLY or n in ONLY]
fills = {}
for fish_name in names:
    fills[fish_name] = round(sheet(fish_name), 3)
print(fills)

if PREVIEW:
    kinds = ['', '_torn', '_ich']
    prev = Image.new('RGB', (FW * 6, FH * len(names)), (12, 16, 18))
    for row, fish_name in enumerate(names):
        sh = Image.open(os.path.join(OUT, fish_name + '.png'))
        tiles = [sh.crop((0, r * FH, FW, (r + 1) * FH)) for r in range(4)]  # frames 0, 4, 8, 12
        for kind in kinds[1:]:
            path = os.path.join(OUT, fish_name + kind + '.png')
            if not os.path.exists(path):
                tiles.append(None)
                continue
            extra = Image.open(path)
            if kind == '_ich':  # shown as in the game: over the fish, at the fish's size
                extra = Image.alpha_composite(sh, extra.resize(sh.size, Image.BILINEAR))
            tiles.append(extra.crop((FW, FH, FW * 2, FH * 2)))  # frame 5
        for k, tile in enumerate(tiles):
            if tile is not None:
                prev.paste(tile, (k * FW, row * FH), tile)
    prev.save(os.path.join(OUT, '_preview.png'))
