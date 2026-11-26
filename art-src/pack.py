"""Copy every finished picture and sound into the project and record sprite sizes for the code."""
import json
import os
import shutil
import uuid

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
RENDER = os.path.join(HERE, 'render')
PROJECT = os.path.dirname(HERE)
TEX = os.path.join(PROJECT, 'assets', 'textures')
AUDIO = os.path.join(PROJECT, 'assets', 'audio')

# Scanned decor that made the cut: sprite name -> scale applied when copying.
SCANS = {
    'plant_anubias_1': 1, 'plant_anubias_2': 1, 'plant_fern_1': 1, 'plant_fern_2': 1, 'plant_sword_1': 1, 'plant_sword_3': 1,
    'plant_weed_1': 0.8, 'plant_weed_2': 0.8, 'plant_weed_3': 0.8, 'plant_nettle_1': 1, 'plant_nettle_2': 1, 'plant_nettle_3': 1,
    'plant_grass_tall_1': 1, 'plant_grass_tall_2': 1,
    'plant_grass_tall_3': 1, 'plant_grass_tall_9': 1.25, 'plant_grass_3': 1, 'plant_grass_4': 1,
    'rock_boulder': 1, 'rock_flat': 1, 'rock_granite': 1, 'rock_mossy_1': 1, 'rock_mossy_2': 1, 'rock_mossy_3': 1,
    'rock_pebble': 1, 'rock_pile_1': 1, 'rock_pile_2': 1, 'rock_pile_3': 1, 'rock_pile_4': 1, 'rock_sandstone': 1,
    'rock_stones_2': 1, 'rock_stones_3': 1, 'rock_stones_5': 1,
    'wood_trunk': 0.42, 'wood_log': 0.75, 'wood_arch': 1, 'wood_arch_low': 1, 'wood_branch': 1, 'wood_branch_low': 1,
    'wood_twigs_1': 1,
    'orn_chest': 1, 'orn_lion': 1, 'orn_pot': 1, 'orn_shell': 1, 'orn_statue': 1, 'orn_vase': 1,
}
OLD_DECOR = ['heater_on', 'heater_off', 'filter', 'airstone']
OLD_ENV = ['mulm', 'bucket', 'vacuum', 'scrubber']
REPEATING = {'caustics_a', 'caustics_b', 'surface', 'rays'}


def save(img, folder, name):
    os.makedirs(os.path.join(TEX, folder), exist_ok=True)
    path = os.path.join(TEX, folder, name + '.png')
    img.save(path)
    meta_path = path + '.meta'
    uid = str(uuid.uuid4())
    if os.path.exists(meta_path):  # keep an existing uuid so references survive a re-pack
        with open(meta_path, encoding='utf-8') as f:
            uid = json.load(f).get('uuid', uid)
    meta = {'uuid': uid, 'version': '2.0', 'type': 'texture',
            'importer': {'maxSize': 2048, 'filterMode': 'linear', 'wrapMode': 'repeat' if name in REPEATING else 'clamp',
                         'premultiplyAlpha': False, 'sliceBorder': {'left': 0, 'right': 0, 'top': 0, 'bottom': 0}}}
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2)


def load(*parts):
    return Image.open(os.path.join(RENDER, *parts)).convert('RGBA')


def main():
    sizes = {}
    for name, scale in SCANS.items():
        img = load('scan', name + '.png')
        if scale != 1:
            img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
        box = img.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
        img = img.crop(box)
        sizes[name] = [img.width, img.height]
        save(img, 'decor', name)
    # One scan came out as a row of separate stems: cut it apart at the empty columns.
    row = load('scan', 'plant_bush.png')
    filled = [x for x in range(row.width) if row.crop((x, 0, x + 1, row.height)).getchannel('A').getextrema()[1] > 8]
    runs = []
    for x in filled:
        if runs and x - runs[-1][1] <= 6:
            runs[-1][1] = x
        else:
            runs.append([x, x])
    for index, (x0, x1) in enumerate(runs[-4:]):  # the last four carry no flowers
        part = row.crop((x0, 0, x1 + 1, row.height))
        part = part.crop(part.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox())
        sizes[f'plant_stem_{index + 1}'] = [part.width, part.height]
        save(part, 'decor', f'plant_stem_{index + 1}')
    for name in OLD_DECOR:
        photo = os.path.exists(os.path.join(RENDER, 'photo', 'decor', name + '.png'))  # photo_gear.py replaces the drawn one
        img = load('photo' if photo else '', 'decor', name + '.png')
        sizes[name] = [img.width, img.height]
        save(img, 'decor', name)

    for file in sorted(os.listdir(os.path.join(RENDER, 'fishphoto'))):
        if file.endswith('.png') and not file.startswith('_'):
            save(load('fishphoto', file), 'fish', file[:-4])
    for file in sorted(os.listdir(os.path.join(RENDER, 'env'))):
        if file.endswith('.png'):
            save(load('env', file), 'env', file[:-4])
    if os.path.isdir(os.path.join(RENDER, 'photo', 'env')):
        for file in sorted(os.listdir(os.path.join(RENDER, 'photo', 'env'))):
            if file.endswith('.png'):
                save(load('photo', 'env', file), 'env', file[:-4])
    for file in sorted(os.listdir(os.path.join(RENDER, 'gen'))):
        if file.endswith('.png') and (file.startswith('food_') or file[:-4] in OLD_ENV):
            save(load('gen', file), 'env', file[:-4])

    os.makedirs(AUDIO, exist_ok=True)
    for file in os.listdir(os.path.join(RENDER, 'audio')):
        shutil.copy(os.path.join(RENDER, 'audio', file), os.path.join(AUDIO, file))

    lines = ['// Written by art-src/pack.py: the pixel size of every decoration sprite.',
             'export const DECOR_SIZES: Record<string, [number, number]> = {']
    lines += [f"    {name}: [{w}, {h}]," for name, (w, h) in sizes.items()]
    lines += ['};', '']
    with open(os.path.join(PROJECT, 'src', 'data', 'decorSizes.ts'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))
    print('packed', sum(len(files) for _, _, files in os.walk(TEX)), 'texture files')


if __name__ == '__main__':
    main()
