// Decoration catalogue. Every piece is a render of a photo-scanned object; its
// size on screen at the front glass comes from the sprite itself (22 px per cm).
// Things placed further back are drawn smaller and dimmer by the view.
import { DECOR_SIZES } from './decorSizes';

export type DecorCategory = 'plant' | 'rock' | 'wood' | 'ornament' | 'bubbler';

export interface DecorData {
    label: string;
    category: DecorCategory;
    sprite: string;
    width: number;
    height: number;
    cover: number; // radius in which fry are hidden from adults (0 = none)
    cave: boolean; // shy fish retreat here
    cleans: boolean; // live plants take up waste
    runners: boolean; // spreads by sending out young plants
}

function piece(label: string, category: DecorCategory, sprite: string, cover: number, cave = false): DecorData {
    const size = DECOR_SIZES[sprite];
    if (!size) throw new Error(`No sprite size recorded for ${sprite}`);
    return { label, category, sprite, width: size[0], height: size[1], cover, cave, cleans: category === 'plant', runners: false };
}

const plant = (label: string, sprite: string, cover: number, runners = false): DecorData =>
    ({ ...piece(label, 'plant', sprite, cover), runners });
const rock = (label: string, sprite: string): DecorData => piece(label, 'rock', sprite, 0);
const wood = (label: string, sprite: string, cave = false): DecorData => piece(label, 'wood', sprite, cave ? 60 : 0, cave);
const ornament = (label: string, sprite: string, cave = false): DecorData => piece(label, 'ornament', sprite, cave ? 60 : 0, cave);

export const DECOR: Record<string, DecorData> = {
    val_tall: plant('Vallisneria', 'plant_grass_tall_9', 90, true),
    hygro_tall: plant('Hygrophila, tall', 'plant_nettle_1', 100),
    hygro_mid: plant('Hygrophila', 'plant_nettle_2', 90),
    hygro_small: plant('Hygrophila, young', 'plant_nettle_3', 70),
    stem_a: plant('Ludwigia', 'plant_stem_4', 80),
    stem_b: plant('Ludwigia, short', 'plant_stem_2', 60),
    sword_big: plant('Amazon sword', 'plant_sword_1', 130),
    sword_small: plant('Sword, young', 'plant_sword_3', 80, true),
    fern_a: plant('Java fern', 'plant_fern_1', 120),
    fern_b: plant('Java fern, low', 'plant_fern_2', 100),
    anubias_a: plant('Anubias', 'plant_anubias_1', 90),
    anubias_b: plant('Anubias, small', 'plant_anubias_2', 80),
    crypt_a: plant('Cryptocoryne', 'plant_weed_2', 110, true),
    crypt_b: plant('Cryptocoryne, low', 'plant_weed_3', 90, true),
    grass_bush: plant('Sagittaria', 'plant_grass_tall_2', 110, true),
    grass_thick: plant('Hairgrass, thick', 'plant_grass_tall_1', 110, true),
    grass_tuft: plant('Hairgrass', 'plant_grass_4', 90, true),
    grass_small: plant('Hairgrass, tuft', 'plant_grass_3', 50, true),
    rock_boulder: rock('Seiryu boulder', 'rock_boulder'),
    rock_granite: rock('Granite slab', 'rock_granite'),
    rock_sandstone: rock('Sandstone', 'rock_sandstone'),
    rock_flat: rock('Flat stone', 'rock_flat'),
    rock_mossy: rock('Field stone', 'rock_mossy_1'),
    rock_mossy_b: rock('Field stone, low', 'rock_mossy_2'),
    rock_quartz: rock('Quartz', 'rock_pile_1'),
    rock_river: rock('River stone', 'rock_pile_3'),
    rock_pebble: rock('Red pebble', 'rock_pebble'),
    rock_small: rock('Small stone', 'rock_stones_3'),
    wood_trunk: wood('Hollow log', 'wood_trunk', true),
    wood_log: wood('Driftwood log', 'wood_log', true),
    wood_branch: wood('Branch', 'wood_branch'),
    wood_arch: wood('Driftwood stump', 'wood_arch'),
    wood_low: wood('Driftwood piece', 'wood_arch_low'),
    wood_twigs: wood('Spider wood', 'wood_twigs_1', true),
    orn_pot: ornament('Clay pot', 'orn_pot', true),
    orn_chest: ornament('Treasure chest', 'orn_chest', true),
    orn_statue: ornament('Statue', 'orn_statue'),
    orn_lion: ornament('Lion bust', 'orn_lion'),
    orn_vase: ornament('Vase', 'orn_vase'),
    orn_shell: ornament('Conch shell', 'orn_shell', true),
    airstone: piece('Air stone', 'bubbler', 'airstone', 0),
};

export const SUBSTRATES = ['gravel_natural', 'gravel_river', 'gravel_black', 'sand'];
export const BACKGROUNDS = ['bg_black', 'bg_frosted', 'bg_blue'];
