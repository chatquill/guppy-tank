"""Copy only the photo-made art into the project: fish sheets (fish_photo.py) and equipment, tools and small things (photo_gear.py).

A quick alternative to pack.py when nothing else has changed; it leaves src/data/decorSizes.ts alone,
so photo_gear.py keeps the heater and filter at the sizes already recorded there.
"""
import os

from pack import RENDER, load, save

count = 0
for file in sorted(os.listdir(os.path.join(RENDER, 'fishphoto'))):
    if file.endswith('.png') and not file.startswith('_'):
        save(load('fishphoto', file), 'fish', file[:-4])
        count += 1
for folder in ('decor', 'env'):
    for file in sorted(os.listdir(os.path.join(RENDER, 'photo', folder))):
        if file.endswith('.png'):
            save(load('photo', folder, file), folder, file[:-4])
            count += 1
print('packed', count, 'photo textures')
