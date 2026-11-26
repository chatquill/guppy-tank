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
    capacity: 30, // adult-guppy equivalents before the tank counts as overcrowded
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

// Shoals, quarrels and stress.
export const SOCIAL = {
    shoalSpread: 110, // how far a shoal member strays from its leader's heading
    shoalRadius: 520, // mates further away than this do not count as company
    lonelyStressPerSec: 0.004, // a shoaling fish kept in too small a group
    lonelyStressMax: 0.55,
    chaseSight: 420,
    chaseSeconds: 5,
    chaseCooldown: [14, 34] as [number, number],
    nipRadius: 26,
    nipStress: 0.16,
    chasedStress: 0.05, // per second while being chased
    calmPerSec: 0.012, // stress shed per second when left alone
    crowdStressPerSec: 0.003,
    harmAbove: 0.9, // stress this high wears a fish down
    harmPerSec: 0.0015,
    tornHealPerSec: 0.0006, // fins grow back over many minutes in clean water
    tornShownAbove: 0.3,
    guardRadius: 230, // a male on eggs drives off anything that comes this close
    territoryRadius: 320, // rivals this close to each other fight
    longFinMinPx: 70, // only fish at least this long count as long-finned rivals
};

export const HEALTH = {
    ichChancePerSec: 0.00025, // per fish, multiplied by the risks it is under
    spreadPerSick: 2.5, // each sick fish raises everyone's risk by this much
    finrotChancePerSec: 0.0012, // per torn fish in poor water
    coldBelow: 23,
    dirtyBelow: 0.45, // water quality under which fish start to fall ill
    progressPerSec: 0.0035, // untreated: from first spots to dying in about five minutes
    recoverPerSec: 0.002, // a mild case clears by itself in clean, calm water
    mildBelow: 0.4,
    weakAbove: 0.5, // the fish starts losing health
    harmPerSec: 0.0045,
    medicineSeconds: 240, // how long one dose stays active
    medicineCurePerSec: 0.012,
    medicineHarmToInverts: 0.004, // health per second: copper kills shrimp and snails
    saltPerDose: 0.34,
    saltCurePerSec: 0.005, // at full strength; strongest against fin rot
    saltHarmPerSec: 0.0012, // to scaleless fish at full strength
    heatFrom: 29, // from this temperature white spot burns itself out
    heatCurePerSec: 0.004,
    lethargy: 0.7, // swim speed of a clearly sick fish
};

// Egg layers.
export const EGGS = {
    eatPerSec: 3, // eggs one raider eats per second
    raidSight: 240,
    nestBuildSeconds: 25,
    nestLifeSeconds: 900, // an unused bubble nest breaks up
    maxClutches: 14,
    maxSnails: 60,
    snailLayBelow: 0.35, // a snail this full lays
    hiddenInPlant: 0.5, // chance a raider overlooks eggs scattered into a plant, per look
};

export const PLANTS = {
    startSize: 0.45, // a newly planted plant, as a fraction of its full size
    fullSize: 1,
    maxSize: 1.3, // left alone it overgrows
    growPerSec: 0.0011, // about eight minutes from planting to full size in good light
    nightGrowth: 0, // no light, no growth
    shadedGrowth: 0.4,
    saltGrowth: 0.4,
    shadeReach: 130,
    runnerEvery: [260, 520] as [number, number],
    runnerReach: [70, 150] as [number, number],
    maxPlants: 44,
    trimTo: 0.62,
    minSize: 0.3,
};

// Following the real clock, the lamp is on between these hours.
export const CLOCK = { lightsOn: 7, lightsOff: 21 };

export const MAX_TANKS = 4;
// The most of anything a save may hold: far more than play produces, few enough that a bad file cannot stall the game.
export const LIMITS = { animals: 400, decor: 200, food: 400 };
export const HEATER_SETTINGS = [24, 26, 28, 30];
