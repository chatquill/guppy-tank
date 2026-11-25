// The guppy strains in the tank. Every one is a photograph of a real fish, so
// only colour forms that exist are ever shown.
export interface Look {
    sprite: string;
    label: string;
}

export const MALE_LOOKS: Look[] = [
    { sprite: 'm_cobra_yellow', label: 'Yellow cobra' },
    { sprite: 'm_halfblack', label: 'Half-black' },
    { sprite: 'm_cobra_green', label: 'Green cobra' },
    { sprite: 'm_blue_grass', label: 'Blue grass' },
    { sprite: 'm_tiger', label: 'Tiger' },
    { sprite: 'm_gold', label: 'Gold' },
];

export const FEMALE_LOOKS: Look[] = [
    { sprite: 'f_grey', label: 'Wild grey' },
    { sprite: 'f_gold', label: 'Gold' },
    { sprite: 'f_tuxedo', label: 'Tuxedo' },
    { sprite: 'f_snake', label: 'Snakeskin' },
];

export const YOUNG_SPRITE = 'young';
export const FRY_SPRITE = 'fry';
