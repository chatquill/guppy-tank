// Every tunable number lives here. Times are in seconds at 1x speed; real
// guppy timings are compressed so that birth to adulthood takes minutes.

export const VIEW = { width: 1920, height: 1080 };

// The water volume in world units (origin at screen centre, y up).
export const TANK = {
    left: -915,
    right: 915,
    surfaceY: 430,
    floorFrontY: -400, // gravel top at the front glass
    floorBackRise: 55, // the gravel line sits this much higher at the back glass
    surfaceBackDrop: 40, // seen from below, the water surface sits this much lower at the back glass
    capacity: 30, // adult-equivalents before the tank counts as overcrowded
};

// The gravel bed. Each choice in the Decorate menu picks one entry from each list.
export const BED = {
    grains: ['fine', 'medium', 'coarse'],
    shapes: ['rolling', 'level', 'valley', 'hill', 'banked'],
    depths: { thin: -445, medium: -400, deep: -345 } as Record<string, number>, // gravel top at the front glass
    bankedRise: 125, // how far a banked bed climbs toward the back glass
};

export const TIME = {
    speeds: [0, 1, 2, 5],
    dayLength: 600,
    nightFraction: 0.3,
    autosaveEvery: 5,
    maxStep: 0.1,
};

export const WATER = {
    filterClearRate: 0.02, // fraction of dissolved waste removed per second
    plantClearRate: 0.0006, // extra fraction per plant
    foodWastePerSec: 0.035, // per resting food item
    deadFishWastePerSec: 0.25,
    sedimentLeakRate: 0.004, // fraction of sediment that dissolves per second
    cloudyBelow: 0.6,
    gaspBelow: 0.35,
    harmBelow: 0.25,
    harmPerSec: 0.004, // health lost per second in lethal water (about 4 minutes)
    healPerSec: 0.01,
    waterChangeFraction: 0.5,
    mulmPerWaste: 0.5, // sediment specks created per unit of fish waste
    maxMulm: 60,
    oxygenDropPerSec: 0.004,
    oxygenRisePerSec: 0.05,
    algaeGrowPerSec: 0.0012,
    heaterTemp: 26,
    roomTemp: 20,
    tempDriftPerSec: 0.02,
    breedMinTemp: 23,
};

export const FOOD = {
    restSeconds: 45, // how long uneaten food lies on the gravel before it vanishes
    seekRadius: 1400,
    eatRadius: 22,
};

export const BEHAVIOUR = {
    hungryAbove: 0.25, // below this a fish is full and ignores food
    forageAbove: 0.6, // above this, with no food around, it pecks gravel and decor
    huntAbove: 0.3, // adults this hungry will chase exposed fry
    huntSightRadius: 260,
    huntCatchRadius: 12,
    huntCatchChance: 0.4,
    huntGiveUpAfter: 6,
    huntRestSeconds: 4,
    frySafeDistance: 200, // fry bolt for cover when an adult comes this close
    coverDepth: 0.2, // how far in front of or behind a plant a fry still counts as inside it
    depthCost: 500, // how much a fry weighs the swim toward or away from the glass when choosing cover
    pastThreatCost: 350, // extra reluctance to use cover that lies beyond the adult it is fleeing
    fryCoverHabit: 0.6, // how often a wandering fry heads for a plant rather than open water
    fryRoam: 450, // fry move between plants this close together
    hideDepthSpeed: 0.6,
    fryBoldAbove: 0.5, // a fry hungrier than this lets adults come closer before it hides
    fryBoldFactor: 0.4,
    fryBoltSpeed: 2, // how much faster than usual a fry swims when it bolts for cover
    tapRadius: 420,
    courtSeconds: 5,
    courtCooldown: 40,
    mateChance: 0.6,
    schoolPull: 0.12,
    turnSeconds: 0.3,
};

export const DEATH = {
    sinkSpeed: 28,
    floatAfter: 40, // seconds on the bottom before gases lift the body
    floatSpeed: 14,
    decayAfter: 300,
};

export const VACUUM = { radius: 70, fryCatchRadius: 55 };
