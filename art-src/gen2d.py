"""2D-generated aquarium assets: backdrops, sand, overlays, food, bubbles, tools."""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'render', 'gen')
DECOR = os.path.join(HERE, 'render', 'decor')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(42)
W, H = 1920, 1080


def save(arr_or_img, name):
    img = arr_or_img if isinstance(arr_or_img, Image.Image) else Image.fromarray(np.clip(arr_or_img, 0, 255).astype(np.uint8))
    img.save(os.path.join(OUT, name + '.png'))


def value_noise(w, h, cell, octaves=4):
    out = np.zeros((h, w))
    amp, total = 1.0, 0.0
    for _ in range(octaves):
        gw, gh = max(2, w // cell + 2), max(2, h // cell + 2)
        small = Image.fromarray((rng.random((gh, gw)) * 255).astype(np.uint8))
        out += amp * np.asarray(small.resize((w, h), Image.BICUBIC), dtype=float) / 255
        total += amp
        amp *= .5
        cell = max(1, cell // 2)
    return out / total


def gradient_bg(name, top, bottom, noise_amt=6):
    t = np.linspace(0, 1, H)[:, None, None] ** .8
    img = np.array(top)[None, None] * (1 - t) + np.array(bottom)[None, None] * t
    img = np.repeat(img, W, 1) + (value_noise(W, H, 240)[..., None] - .5) * noise_amt * 4
    xs = np.linspace(-1, 1, W)[None, :, None]
    img *= 1 - .25 * xs ** 2
    save(np.concatenate([img, np.full((H, W, 1), 255.)], 2), name)


def scape_bg():
    base = Image.open(os.path.join(OUT, 'bg_blue.png')).convert('RGBA')
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    plan = [('rock_lava', 180, 1.5), ('vallisneria_00', 420, 1.1), ('rock_slate', 760, 1.6), ('rotala_00', 1040, 1.0),
            ('driftwood_b', 1150, 1.3), ('vallisneria_03', 1500, 1.2), ('rock_river', 1560, 1.3), ('sword_00', 80, 1.0)]
    for name, x, sc in plan:
        p = os.path.join(DECOR, name + '.png')
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert('RGBA')
        im = im.resize((int(im.width * sc), int(im.height * sc)))
        layer.alpha_composite(im, (x - im.width // 2 + 200, H - 130 - im.height))
    arr = np.asarray(layer, dtype=float)
    arr[..., :3] = arr[..., :3] * .32 * np.array([.55, .85, 1.0]) + np.array([4, 18, 30])
    layer = Image.fromarray(arr.astype(np.uint8)).filter(ImageFilter.GaussianBlur(7))
    base.alpha_composite(layer)
    save(base, 'bg_scape')


def sand():
    h = 240
    x = np.arange(W)
    top = 60 + 14 * np.sin(x / 300 + 1) + 9 * np.sin(x / 130) + 4 * np.sin(x / 47)
    yy = np.arange(h)[:, None]
    n = value_noise(W, h, 3, 2) * .5 + rng.random((h, W)) * .5
    col = np.array([214, 196, 160])[None, None] * (.72 + .42 * n[..., None])
    col *= (1 - .35 * np.clip((yy - top[None]) / 200, 0, 1))[..., None]
    alpha = np.clip((yy - top[None]) * 1.2 + 1, 0, 1) * 255
    save(np.concatenate([col, alpha[..., None]], 2), 'sand')


def light_rays():
    w = h = 1024
    x, y = np.meshgrid(np.arange(w), np.arange(h))
    u = x + y * .28
    a = np.zeros((h, w))
    for _ in range(11):
        c, wd, s = rng.uniform(0, w * 1.3), rng.uniform(18, 70), rng.uniform(.3, 1)
        a += s * np.exp(-((u - c) / wd) ** 2)
    a *= np.clip(1 - y / h, 0, 1) ** 1.3 * np.clip(y / 60, 0, 1)
    a = np.clip(a / a.max(), 0, 1) * 150
    save(np.stack([np.full_like(a, 255), np.full_like(a, 250), np.full_like(a, 225), a], 2), 'light_rays')


def glass():
    x, y = np.meshgrid(np.linspace(0, 1, W), np.linspace(0, 1, H))
    u = x - y * .35
    a = 26 * np.exp(-((u - .12) / .035) ** 2) + 15 * np.exp(-((u - .2) / .012) ** 2) + 12 * np.exp(-((u - .78) / .05) ** 2)
    save(np.stack([np.full_like(a, 255)] * 3 + [a], 2), 'glass_reflection')
    d = np.maximum(np.abs(x - .5) * 2, np.abs(y - .5) * 2)
    v = np.clip((d - .78) / .22, 0, 1) ** 2 * 120
    save(np.stack([np.zeros_like(v), np.full_like(v, 10), np.full_like(v, 16), v], 2), 'vignette')


def surface():
    w, h = 1024, 48
    x = np.arange(w)
    y = np.arange(h)[:, None]
    line = 22 + 3.2 * np.sin(x * 2 * np.pi * 4 / w) + 1.6 * np.sin(x * 2 * np.pi * 11 / w + 1)
    a = np.exp(-((y - line[None]) / 2.4) ** 2) * 220 + np.clip(1 - np.abs(y - line[None] + 8) / 9, 0, 1) * 50
    save(np.stack([np.full((h, w), 235.), np.full((h, w), 248.), np.full((h, w), 255.), a], 2), 'surface')


def dot(size, rgb, power=2., alpha=255, name=None):
    c = (size - 1) / 2
    x, y = np.meshgrid(np.arange(size), np.arange(size))
    r = np.hypot(x - c, y - c) / c
    a = np.clip(1 - r, 0, 1) ** power * alpha
    arr = np.stack([np.full_like(a, v, dtype=float) for v in rgb] + [a], 2)
    if name:
        save(arr, name)
    return arr


def bubble():
    s = 48
    c = (s - 1) / 2
    x, y = np.meshgrid(np.arange(s), np.arange(s))
    r = np.hypot(x - c, y - c) / c
    ring = np.exp(-((r - .82) / .09) ** 2) * 190 + np.clip(1 - r, 0, 1) * 26
    hi = np.exp(-(((x - c * .62) / 5) ** 2 + ((y - c * .58) / 4) ** 2)) * 230
    a = np.clip(ring + hi, 0, 255) * (r < 1)
    save(np.stack([np.full_like(a, 225.), np.full_like(a, 245.), np.full_like(a, 255.), a], 2), 'bubble')


def blob_sprite(name, size, rgb, n_pts=9, jag=.35, shade=True, squash=1.):
    S = size * 4
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ang = np.sort(rng.uniform(0, 2 * np.pi, n_pts))
    rad = S * .45 * (1 - jag * rng.random(n_pts))
    pts = [(S / 2 + r * np.cos(a), S / 2 + r * np.sin(a) * squash) for a, r in zip(ang, rad)]
    d.polygon(pts, fill=(*rgb, 255))
    if shade:
        d.ellipse((S * .3, S * .28, S * .5, S * .44), fill=(*[min(255, int(v * 1.35 + 25)) for v in rgb], 255))
    img = img.filter(ImageFilter.GaussianBlur(S / 40)).resize((size, size), Image.LANCZOS)
    save(img, name)


def foods():
    for i, rgb in enumerate([(206, 96, 40), (188, 60, 44), (214, 170, 60), (96, 130, 50)]):
        blob_sprite(f'food_flake_{i}', 18, rgb, n_pts=7, jag=.5, shade=False, squash=.6)
    blob_sprite('food_pellet', 12, (120, 78, 44), n_pts=14, jag=.08)
    blob_sprite('food_wafer', 28, (70, 104, 48), n_pts=18, jag=.06, squash=.45)
    blob_sprite('food_cichlid', 24, (130, 44, 34), n_pts=16, jag=.08)
    dot(7, (226, 214, 180), 1.2, 230, 'food_fry')
    img = Image.new('RGBA', (72, 40), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.arc((8, 6, 60, 46), 190, 330, fill=(236, 138, 70, 255), width=7)
    d.ellipse((50, 10, 62, 22), fill=(240, 150, 84, 255))
    for k in range(5):
        d.line((18 + k * 7, 16, 14 + k * 7, 30), fill=(236, 150, 90, 200), width=2)
    save(img.resize((18, 10), Image.LANCZOS), 'food_brine')


def mulm_and_algae():
    img = Image.new('RGBA', (96, 48), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for _ in range(26):
        x, y, r = rng.uniform(8, 88), rng.uniform(22, 44), rng.uniform(2, 5)
        g = int(rng.uniform(40, 80))
        d.ellipse((x - r, y - r * .6, x + r, y + r * .6), fill=(g + 20, g, int(g * .6), int(rng.uniform(150, 230))))
    save(img.filter(ImageFilter.GaussianBlur(.7)).resize((48, 24), Image.LANCZOS), 'mulm')
    n = value_noise(256, 256, 40, 5)
    a = np.clip((n - .45) * 4, 0, 1) * (.55 + .45 * rng.random((256, 256))) * 200
    x, y = np.meshgrid(np.linspace(-1, 1, 256), np.linspace(-1, 1, 256))
    a *= np.clip(1.25 - np.hypot(x, y), 0, 1)
    save(np.stack([np.full_like(a, 46.), np.full_like(a, 110.), np.full_like(a, 38.), a], 2), 'algae')


def tools():
    img = Image.new('RGBA', (320, 320), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.polygon([(50, 80), (270, 80), (240, 300), (80, 300)], fill=(50, 110, 190, 235))
    d.polygon([(64, 150), (256, 150), (240, 300), (80, 300)], fill=(90, 170, 220, 150))
    d.ellipse((50, 62, 270, 98), fill=(30, 70, 130, 255), outline=(190, 215, 240, 255), width=6)
    d.arc((30, -30, 290, 180), 180, 360, fill=(190, 195, 200, 255), width=8)
    save(img.resize((160, 160), Image.LANCZOS), 'bucket')
    img = Image.new('RGBA', (120, 1200), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((20, 760, 100, 1190), 14, fill=(200, 230, 245, 70), outline=(225, 240, 250, 210), width=6)
    d.rectangle((50, 0, 70, 770), fill=(205, 230, 240, 90), outline=(225, 240, 250, 180), width=4)
    save(img.resize((60, 600), Image.LANCZOS), 'vacuum')
    img = Image.new('RGBA', (240, 160), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((10, 30, 230, 150), 26, fill=(34, 60, 120, 255), outline=(16, 30, 70, 255), width=6)
    d.rounded_rectangle((40, 10, 200, 60), 16, fill=(60, 96, 170, 255))
    d.rectangle((10, 128, 230, 150), fill=(230, 230, 220, 255))
    save(img.resize((90, 60), Image.LANCZOS), 'scrubber')
    s = dot(128, (0, 0, 0), 1.4, 150)
    save(Image.fromarray(s.astype(np.uint8)).resize((256, 56), Image.LANCZOS), 'shadow')
    dot(16, (235, 245, 250), 1.6, 130, 'mote')
    dot(64, (255, 255, 255), 1.0, 255, 'soft')
    save(np.full((8, 8, 4), 255.), 'white')


gradient_bg('bg_blue', (38, 120, 168), (6, 30, 58))
gradient_bg('bg_black', (14, 18, 22), (2, 3, 4), noise_amt=2)
scape_bg()
sand(); light_rays(); glass(); surface(); bubble(); foods(); mulm_and_algae(); tools()
print('gen2d done', len(os.listdir(OUT)), 'files')
