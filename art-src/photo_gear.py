"""Equipment, tools and small things cut from photographs (and three small things drawn procedurally).

Reads source/photos/*.jpg, keeps the background-removed versions in source/photo-cutouts, and writes
render/photo/decor/*.png and render/photo/env/*.png. Sources and licences are in ../CREDITS.md.

Usage: python photo_gear.py [--preview]
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
PHOTOS = os.path.join(HERE, 'source', 'photos')
CUTS = os.path.join(HERE, 'source', 'photo-cutouts')
OUT = os.path.join(HERE, 'render', 'photo')
# Part of each photo that holds the object (left, top, right, bottom), or None for all of it.
CROPS = {'heater': None, 'filter': (100, 0, 400, 700), 'scissors': (100, 560, 1840, 1090), 'net': None}


def cutout(name):
    """The object with its background removed (rembg, model isnet-general-use), made once and kept."""
    path = os.path.join(CUTS, name + '.png')
    if not os.path.exists(path):
        from rembg import new_session, remove
        os.makedirs(CUTS, exist_ok=True)
        photo = Image.open(os.path.join(PHOTOS, name + '.jpg')).convert('RGB')
        if CROPS[name]:
            photo = photo.crop(CROPS[name])
        remove(photo, session=new_session('isnet-general-use')).save(path)
    return Image.open(path).convert('RGBA')


def trim(img, level=24):
    return img.crop(img.getchannel('A').point(lambda a: 255 if a > level else 0).getbbox())


def largest(arr, level=60):
    """Drop everything but the biggest connected piece."""
    labels, count = ndimage.label(arr[..., 3] > level)
    if count > 1:
        sizes = ndimage.sum(np.ones_like(labels), labels, range(1, count + 1))
        keep = ndimage.binary_dilation(labels == np.argmax(sizes) + 1, iterations=3)
        arr[..., 3] = np.where(keep, arr[..., 3], 0)
    return arr


def firm(img, low=0.25, span=0.6):
    """Tighten the matte so no halo of the old background survives."""
    arr = np.asarray(img, np.float32).copy()
    arr[..., 3] = np.clip((arr[..., 3] / 255 - low) / span, 0, 1) * 255
    return Image.fromarray(arr.astype(np.uint8))


def fit(img, width, height):
    """Scale to fit and centre on a clear canvas of exactly width x height."""
    scale = min(width / img.width, height / img.height)
    img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
    canvas = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    canvas.alpha_composite(img, ((width - img.width) // 2, (height - img.height) // 2))
    return canvas


def heater():
    """A sand-filled glass tube heater. The photo shows it lying at an angle with its cable: stand it up, drop the cable."""
    img = cutout('heater').rotate(-62.7, resample=Image.BICUBIC, expand=True)
    arr = np.asarray(img).copy()
    solid = arr[..., 3] > 128
    # The tube is the long thin run of the picture: find its column, then cut the flex off above the cap.
    tall = solid.sum(axis=0)
    axis = int(np.argmax(ndimage.uniform_filter1d(tall.astype(np.float32), 40)))
    arr[:, :max(0, axis - 190)] = 0
    arr[:, axis + 190:] = 0
    solid = arr[..., 3] > 128
    width = solid[:, axis - 120:axis + 120].sum(axis=1)
    rows = np.where(width > 0)[0]
    bottom = rows.max()
    top = bottom
    for y in range(bottom, rows.min(), -1):  # walk up the tube until it narrows to the flex
        if width[y] >= 62:
            top = y
        elif top - y > 25:
            break
    arr[:top] = 0
    img = trim(firm(Image.fromarray(largest(arr))))
    # A real tube this long is slimmer than the game's heater: widen it a little so it reads at sprite size.
    img = img.resize((round(img.width * 1.45), img.height), Image.LANCZOS)
    off = fit(img, 84, 280)
    box = off.getbbox()
    a = np.asarray(off, np.float32) / 255
    cols = np.where(a[box[1] + 60:box[3] - 20, :, 3].mean(axis=0) > 0.5)[0]  # the glass tube itself
    cx, cy = (cols.min() + cols.max()) / 2, box[1] + 0.165 * (box[3] - box[1])  # in the dark band under the cap
    yy, xx = np.mgrid[0:280, 0:84].astype(np.float32)
    away = np.hypot(yy - cy, xx - cx)
    result = {}
    for state in ('off', 'on'):
        out = a.copy()
        lamp = np.clip(2.6 - away + 0.5, 0, 1)
        colour = np.array([1.0, 0.62, 0.16]) if state == 'on' else np.array([0.30, 0.13, 0.05])
        out[..., :3] = out[..., :3] * (1 - lamp[..., None]) + colour * lamp[..., None]
        glint = np.clip(1.0 - np.hypot(yy - cy + 0.9, xx - cx + 0.8), 0, 1) * (0.9 if state == 'on' else 0.25)
        out[..., :3] = np.clip(out[..., :3] + glint[..., None], 0, 1)
        if state == 'on':
            glow = np.exp(-(away / 6.5) ** 2) * 0.75
            out[..., :3] = np.clip(out[..., :3] + glow[..., None] * np.array([1.0, 0.45, 0.08]), 0, 1)
        out[..., 3] = np.maximum(out[..., 3], lamp)
        result[state] = Image.fromarray((out * 255).astype(np.uint8))
    return result['on'], result['off']


def filter_box(size):
    """An internal power filter. The maker's label is painted over with the colour of the housing around it."""
    img = cutout('filter')
    arr = np.asarray(img, np.float32).copy()
    yy, xx = np.mgrid[0:arr.shape[0], 0:arr.shape[1]].astype(np.float32)
    label = np.clip(np.minimum.reduce([xx - 66, 262 - xx, yy - 96, 256 - yy]) / 6, 0, 1)
    rng = np.random.default_rng(3)
    plain = np.array([24, 24, 27], np.float32) + (xx[..., None] - 160) * 0.035 + rng.normal(0, 1.6, arr.shape[:2] + (1,))
    arr[..., :3] = arr[..., :3] * (1 - label[..., None]) + plain * label[..., None]
    img = trim(firm(Image.fromarray(largest(np.clip(arr, 0, 255).astype(np.uint8)))))
    return fit(img, *size)


def scissors():
    """Long straight stainless scissors, turned to point down."""
    img = trim(firm(Image.fromarray(largest(np.asarray(cutout('scissors')).copy()))))
    img = img.rotate(90, expand=True)
    scale = 300 / img.height
    return img.resize((round(img.width * scale), 300), Image.LANCZOS)


def net():
    """A green aquarium net. Its shadow on the table is grey, so only what is green is kept; the mesh is let show through."""
    arr = np.asarray(cutout('net'), np.float32).copy()
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    green = (g - np.maximum(r, b)) / np.maximum(g, 1)  # 0 for grey, about 0.5 for the plastic
    keep = ndimage.binary_closing(green > 0.055, iterations=2)
    keep = ndimage.binary_opening(keep, iterations=1)
    arr[..., 3] *= ndimage.gaussian_filter(keep.astype(np.float32), 0.8)
    arr[..., 3] *= np.clip(0.50 + green * 2.2, 0.55, 1.0)  # the pale mesh is see-through, the wire is not
    # The beige table tints the mesh: pull it toward clean green.
    mesh = np.clip(1 - green * 4, 0, 1)[..., None]
    arr[..., :3] = arr[..., :3] * (1 - 0.35 * mesh) + np.array([120, 190, 140], np.float32) * 0.35 * mesh
    img = Image.fromarray(largest(np.clip(arr, 0, 255).astype(np.uint8), 40))
    img = trim(img.rotate(97, resample=Image.BICUBIC, expand=True))
    scale = 420 / img.height
    return img.resize((round(img.width * scale), 420), Image.LANCZOS)


def nest():
    """A betta's bubble nest: a strip of a real one, thinned out toward the ends so it floats as a raft."""
    photo = Image.open(os.path.join(PHOTOS, 'nest.jpg')).convert('RGB').crop((0, 395, 1920, 800))
    small = np.asarray(photo.resize((256, 54), Image.LANCZOS), np.float32) / 255
    grey = small.mean(axis=2)
    detail = np.abs(grey - ndimage.gaussian_filter(grey, 2.5))  # bubble walls and glints
    rng = np.random.default_rng(11)
    yy, xx = np.mgrid[0:54, 0:256].astype(np.float32)
    u = (xx - 128) / 128
    depth = 46 * np.clip(1 - np.abs(u) ** 2.2, 0, 1) ** 0.7 + ndimage.gaussian_filter1d(rng.normal(0, 14, 256), 5)[None, :]
    body = np.clip((depth - yy) / 7, 0, 1) * np.clip((1 - np.abs(u)) / 0.12, 0, 1)
    alpha = body * np.clip(0.42 + detail * 9 + (grey - 0.6) * 0.5, 0.25, 0.95)
    white = grey[..., None] * 0.55 + small * 0.45  # most of the room's colour taken out
    white = np.clip((white - 0.45) * 1.35 + 0.55, 0, 1)
    out = np.zeros((64, 256, 4), np.float32)
    out[2:56, :, :3] = white
    out[2:56, :, 3] = alpha
    return Image.fromarray((out * 255).astype(np.uint8))


def clutch():
    """A ramshorn snail's egg clutch: clear jelly with the pale embryos showing."""
    photo = Image.open(os.path.join(PHOTOS, 'clutch.jpg')).convert('RGB').crop((70, 20, 1180, 930))
    small = np.asarray(photo.resize((64, 52), Image.LANCZOS), np.float32) / 255
    grey = small.mean(axis=2)
    yy, xx = np.mgrid[0:52, 0:64].astype(np.float32)
    inside = np.clip((1 - np.hypot((xx - 31.5) / 31, (yy - 25.5) / 25)) * 9, 0, 1)
    rim = np.exp(-((np.hypot((xx - 31.5) / 31, (yy - 25.5) / 25) - 0.93) / 0.05) ** 2)
    alpha = inside * np.clip(0.22 + (grey - 0.30) * 1.5 + rim * 0.2, 0.2, 0.95)
    colour = np.clip(small * 0.6 + 0.42, 0, 1)  # the dark slate under the jelly is lifted to clear grey-white
    out = np.zeros((64, 64, 4), np.float32)
    out[6:58, :, :3] = colour
    out[6:58, :, 3] = alpha
    return Image.fromarray((out * 255).astype(np.uint8))


def eggs():
    """A loose cluster of fish eggs: small amber beads, each with a glint and a darker yolk. Drawn, not photographed."""
    k = 6
    w, h = 96 * k, 64 * k
    rng = np.random.default_rng(5)
    centres = []
    while len(centres) < 21:
        p = np.array([rng.normal(48, 15), rng.normal(33, 8.5)])
        radius = rng.uniform(3.3, 4.3)
        if 6 < p[0] < 90 and 6 < p[1] < 58 and all(np.hypot(*(p - q)) > (radius + s) * 0.86 for q, s in centres):
            centres.append((p, radius))
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32) / k
    rgb = np.zeros((h, w, 3), np.float32)
    alpha = np.zeros((h, w), np.float32)
    for (cx, cy), radius in sorted(centres, key=lambda c: c[0][1]):
        d = np.hypot(xx - cx, yy - cy) / radius
        disc = np.clip((1 - d) * radius * k / 2, 0, 1)
        nz = np.sqrt(np.clip(1 - d ** 2, 0, 1))
        tint = np.array([0.93, 0.62, 0.20]) * rng.uniform(0.9, 1.08)
        shade = 0.55 + 0.45 * np.clip(nz * 0.6 - (xx - cx) / radius * 0.25 - (yy - cy) / radius * 0.45 + 0.3, 0, 1)
        colour = tint[None, None, :] * shade[..., None]
        yolk = np.exp(-(np.hypot(xx - cx - rng.uniform(-0.6, 0.6), yy - cy - 0.4) / (radius * 0.42)) ** 2)
        colour = colour * (1 - 0.40 * yolk[..., None]) + np.array([0.75, 0.36, 0.08]) * 0.40 * yolk[..., None]
        rim = np.clip(1 - np.abs(d - 0.9) / 0.14, 0, 1) * 0.30
        colour = colour * (1 - rim[..., None] * 0.5)
        glint = np.exp(-(np.hypot(xx - cx + radius * 0.36, yy - cy + radius * 0.40) / (radius * 0.20)) ** 2)
        colour = np.clip(colour + glint[..., None] * 0.9, 0, 1)
        see = disc * np.clip(0.42 + 0.42 * (1 - nz) + glint * 0.5 + yolk * 0.22, 0, 0.97)  # clearer in the middle, like a bead
        rgb = rgb * (1 - disc[..., None]) + colour * disc[..., None]
        alpha = alpha * (1 - disc) + see
    out = np.dstack([rgb, alpha])
    out[..., :3] *= out[..., 3:4]
    out = out.reshape(64, k, 96, k, 4).mean(axis=(1, 3))
    out[..., :3] /= np.clip(out[..., 3:4], 1e-4, 1)
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))


def main():
    old = Image.open(os.path.join(os.path.dirname(HERE), 'assets', 'textures', 'decor', 'filter.png')).size
    on, off = heater()
    made = {
        'decor/heater_on': on, 'decor/heater_off': off, 'decor/filter': filter_box(old if old[1] > 300 else (140, 364)),
        'env/net': net(), 'env/scissors': scissors(), 'env/eggs': eggs(), 'env/nest': nest(), 'env/clutch': clutch(),
    }
    for name, img in made.items():
        path = os.path.join(OUT, name + '.png')
        os.makedirs(os.path.dirname(path), exist_ok=True)
        img.save(path)
        print(name, img.size)
    if '--preview' in sys.argv:
        sheet = Image.new('RGB', (1500, 900), (16, 38, 44))
        sheet.paste(Image.new('RGB', (750, 900), (150, 170, 160)), (750, 0))
        for half in (0, 750):
            x = half + 10
            for name, img in made.items():
                big = img.resize((img.width * 2, img.height * 2), Image.LANCZOS) if img.height <= 64 else img
                y = 10 if big.height > 200 else 480
                if big.height <= 200:
                    y += 140 * [n for n, i in made.items() if i.height <= 64].index(name)
                    sheet.paste(big, (half + 20, y), big)
                else:
                    sheet.paste(big, (x, y), big)
                    x += big.width + 14
        sheet.save(os.path.join(OUT, '_preview.png'))


if __name__ == '__main__':
    main()
