"""Turn cut-out photographs of real guppies into swim-cycle sprite sheets.

Each photo is straightened, turned to face right and fitted into a frame, then
bent through one tail beat as a fish seen from the side would appear: the rear
of the body swings toward and away from the viewer (so it shortens and lengthens),
with a slight vertical wave and a ripple running down the fins.

Usage: python fish_photo.py <cutout-dir> <output-dir> [--preview]
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

CUT, OUT = sys.argv[1], sys.argv[2]
PREVIEW = '--preview' in sys.argv
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
}


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


def swim_frame(frame, nose_x, length, phase):
    """Bend the fish through one moment of the tail beat."""
    n = 200
    s0 = np.linspace(0, 1, n)  # along the fish, nose to tail tip, unbent
    amp = 0.20 * s0 ** 2.2  # sideways swing, in body lengths
    wave = phase - 5.2 * s0
    slope = np.gradient(amp * np.sin(wave), s0)
    theta = np.arctan(slope)
    seen = np.concatenate([[0], np.cumsum(np.cos(theta[:-1]) * np.diff(s0))])  # where each point lands when viewed side-on
    seen = seen / seen[-1] * (1 - 0.035 * (1 - np.cos(theta).mean()) * 10)

    ys, xs = np.mgrid[0:FH, 0:FW].astype(np.float32)
    s_out = np.clip((nose_x - xs) / length, 0, 1.2)
    s_src = np.interp(s_out, seen, s0, right=1.2)
    lift = 0.022 * length * np.interp(s_src, s0, s0 ** 1.8 * np.sin(wave + 0.6))
    # Fins trail the body: a finer ripple that grows away from the midline.
    mid = FH / 2
    ripple = 0.012 * length * np.sin(phase * 1.0 - 9.0 * s_src + (ys - mid) / FH * 3.0) * np.clip(s_src - 0.45, 0, 1) * 2
    src_x = nose_x - s_src * length
    src_y = ys - lift - ripple
    out = np.zeros_like(frame)
    # Premultiplied so the clear pixels around the fish do not bleed dark fringes in.
    pre = frame.copy()
    pre[..., :3] *= frame[..., 3:4] / 255
    for c in range(4):
        out[..., c] = ndimage.map_coordinates(pre[..., c], [src_y, src_x], order=1, mode='constant')
    # The side turned toward the lamp catches a little more light.
    shade = 1 + 0.16 * np.interp(s_src, s0, np.sin(theta))
    alpha = np.clip(out[..., 3:4], 1e-3, 255)
    out[..., :3] = np.clip(out[..., :3] / alpha * 255 * shade[..., None], 0, 255)
    return out


def sheet(name):
    frame, nose_x, length = base_frame(name)
    big = np.zeros((FH * ROWS, FW * COLS, 4), np.float32)
    for i in range(COLS * ROWS):
        f = swim_frame(frame, nose_x, length, 2 * np.pi * i / (COLS * ROWS))
        r, c = divmod(i, COLS)
        big[r * FH:(r + 1) * FH, c * FW:(c + 1) * FW] = f
    Image.fromarray(np.clip(big, 0, 255).astype(np.uint8)).save(os.path.join(OUT, name + '.png'))
    return length / FW


os.makedirs(OUT, exist_ok=True)
fills = {}
for fish_name in FISH:
    fills[fish_name] = round(sheet(fish_name), 3)
print(fills)

if PREVIEW:
    names = list(FISH)
    prev = Image.new('RGB', (FW * 4, FH * len(names)), (12, 16, 18))
    for row, fish_name in enumerate(names):
        sh = Image.open(os.path.join(OUT, fish_name + '.png'))
        for k, idx in enumerate((0, 4, 8, 12)):
            r, c = divmod(idx, COLS)
            tile = sh.crop((c * FW, r * FH, (c + 1) * FW, (r + 1) * FH))
            prev.paste(tile, (k * FW, row * FH), tile)
    prev.save(os.path.join(OUT, '_preview.png'))
