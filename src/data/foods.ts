import type { Stage } from './species';

// Each food lists which species eat it and at which life stages. A fish that
// is not on the list ignores the food completely, as it would in a real tank.
export interface FoodData {
    label: string;
    sprites: string[];
    floatSeconds: number; // time spent on the surface before sinking
    sinkSpeed: number;
    drift: number; // sideways wobble while sinking
    nutrition: number; // hunger removed per bite
    bites: number;
    piecesPerDrop: [number, number];
    eatenBy: Record<string, Stage[]>;
    appeal: number; // fish go for higher-appeal food first
}

export const FOODS: Record<string, FoodData> = {
    flakes: {
        label: 'Flakes', sprites: ['food_flake_0', 'food_flake_1', 'food_flake_2', 'food_flake_3'],
        floatSeconds: 6, sinkSpeed: 26, drift: 22, nutrition: 0.22, bites: 1, piecesPerDrop: [5, 8],
        eatenBy: { guppy: ['young', 'adult'] }, appeal: 1,
    },
    pellets: {
        label: 'Micro pellets', sprites: ['food_pellet'],
        floatSeconds: 0, sinkSpeed: 60, drift: 4, nutrition: 0.3, bites: 1, piecesPerDrop: [4, 6],
        eatenBy: { guppy: ['young', 'adult'] }, appeal: 1.1,
    },
    brine: {
        label: 'Brine shrimp', sprites: ['food_brine'],
        floatSeconds: 0, sinkSpeed: 18, drift: 40, nutrition: 0.3, bites: 1, piecesPerDrop: [6, 9],
        eatenBy: { guppy: ['baby', 'young', 'adult'] }, appeal: 2,
    },
    fry: {
        label: 'Fry powder', sprites: ['food_fry'],
        floatSeconds: 4, sinkSpeed: 14, drift: 16, nutrition: 0.3, bites: 1, piecesPerDrop: [10, 14],
        eatenBy: { guppy: ['baby', 'young'] }, appeal: 1,
    },
    wafer: {
        label: 'Algae wafer', sprites: ['food_wafer'],
        floatSeconds: 0, sinkSpeed: 90, drift: 2, nutrition: 0.08, bites: 14, piecesPerDrop: [1, 1],
        eatenBy: { guppy: ['young', 'adult'] }, appeal: 0.5,
    },
    cichlid: {
        // Too large for a guppy's mouth: they inspect nothing and ignore it.
        label: 'Cichlid pellets', sprites: ['food_cichlid'],
        floatSeconds: 2, sinkSpeed: 50, drift: 3, nutrition: 0.6, bites: 1, piecesPerDrop: [2, 3],
        eatenBy: {}, appeal: 1,
    },
};
