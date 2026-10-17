// ---------------------------------------------------------------------------
// config.js — EVERY tuning number for MAMI lives in this file.
// Nothing else in the game hard-codes a value you would want to tweak.
// ---------------------------------------------------------------------------

export const CONFIG = {
  // Dev switch. main.js sets this from the URL query string (?test=1) before
  // anything else runs. When on, patience is crushed so a full round —
  // 3 storm-outs, game over, Play again — plays out in seconds.
  testMode: false,

  // ---------------------------------------------------------------- renderer
  renderer: {
    pixelRatioCap: 2,      // hard cap so phones don't render 3x and drop frames
    antialias: true,
    shadows: true,         // set false for a big perf win on cheap phones
    shadowMapSize: 1024,
    background: 0x14100c,
    fog: { color: 0x241a12, near: 34, far: 70 },
  },

  // ------------------------------------------------------------------ camera
  // Angled top-down over the whole room. position/target are in world units.
  camera: {
    fov: 42,
    portraitFov: 50,     // taller screens: zoomed in + camera follows the player
    portraitOffset: [0, 11.5, 10.5],
    portraitLookAhead: 1.8,  // bias the view into the room, not the front wall
    followLimits: { x: 5.0, z: 3.0 },
    near: 0.1,
    far: 80,
    position: [0, 13, 16.2],
    target: [0, 1.0, -0.7],
    shakeDecay: 6,        // how fast screen shake bleeds off (per second)
    titleOrbitSpeed: 0.06, // slow drift on the title screen
  },

  // ------------------------------------------------------------------ lights
  // Cool ambient + warm bulbs: the contrast is what stops the room reading as
// one flat orange wash.
lights: {
    ambient: { color: 0xaebbd4, intensity: 0.45 },
    hemisphere: { sky: 0xcfe0ff, ground: 0x5a4630, intensity: 0.7 },
    // The hanging bulb — the warm heart of the room.
    bulb: { color: 0xffc078, intensity: 9, distance: 30, decay: 1.5, y: 3.0 },
    // A second, dimmer warm bulb further back so the far end isn't black.
    bulbBack: { color: 0xffb060, intensity: 6, distance: 24, decay: 1.5, y: 2.9 },
    // Cool bounce from the doorway, stops the whole scene going orange.
    doorFill: { color: 0x9fc4ff, intensity: 5, distance: 18, decay: 1.8 },
    bulbFlicker: 0.05,     // amount of random brightness wobble on the bulbs
  },

  // -------------------------------------------------------------------- room
  // Coordinates: x is left/right (-8..8), z is back(negative)/front(positive).
  room: {
    width: 16,
    depth: 12,
    wallHeight: 3.9,
    frontWallHeight: 0.5, // near wall is low so the camera can see in
    wallColor: 0xbfae95,
    trimColor: 0x8a5a3b,
    // Where the player is allowed to walk. minZ keeps them a stride clear of the
    // counter face: any closer and the 1.05m counter hides their whole body
    // from the top-down camera.
    bounds: { minX: -7.55, maxX: 7.55, minZ: -3.9, maxZ: 5.6 },
  },

  // The serving counter. Player stops at its front face (bounds.minZ).
  counter: {
    z: -5.0,
    depth: 0.9,
    width: 14.4,
    height: 1.05,
    color: 0x9c7b52,
    topColor: 0xb99569,
    signText: "MAMI'S BUKA",
    signY: 2.55,
    signZ: -4.5,
  },

  // Mami herself, behind the counter.
  mami: { x: 0.4, z: -5.72, turn: 0.18 },

  // Tables in tidy rows with clear walkways between them.
  // Two seats per table (north + south chair).
  tables: {
    x: [-4.6, 0, 4.6],
    z: [-1.2, 2.8],
    topY: 0.74,
    radius: 0.78,      // visual table top
    collideRadius: 0.98, // player/customer collision circle (chairs included)
    seatOffsetZ: 1.15,  // chairs sit this far from the table centre
    seatY: 0.46,        // chair seat height (seated characters drop to this)
    colors: { top: 0xd9c7a7, leg: 0x6f5a45, chair: 0x2f7d8c },
  },

  // Customers come in through this door on the left wall.
  door: { x: -8, z: 4.75, width: 1.9, height: 2.4, spawnX: -9.6, gateX: -6.7 },

  // Walkway lanes customers use to reach a seat (no pathfinding, just lanes).
  lanes: { x: -6.7, z: [-3.4, 0.9, 4.9] },

  // ------------------------------------------------------------------ dishes
  // THE ONE dish table. Everything else in the game reads from here:
  // the pickup point built on the counter, the sign on it, the price, the
  // icon in the order bubble, the HUD chip, and the order pool customers
  // draw from. There is no hidden cycling — each dish owns exactly one
  // pickup point at its own x along the counter.
  //
  //   id                 stable key, used by plates and orders
  //   name               shown on the counter sign and in the order bubble
  //   short              compact label for tight HUD slots
  //   icon               key into the canvas icon painter in customers.js
  //   price              coins before tips
  //   color              plate / food colour
  //   x                  pickup point along the counter
  //   prop               which counter prop to build there
  //   unlockAtSeconds    0 = available from the first second
  dishes: {
    jollof: {
      name: 'Jollof rice', short: 'JOLLOF', icon: 'jollof', price: 8,
      color: 0xe07a2b, x: -6.0, prop: 'potRice', unlockAtSeconds: 0,
    },
    egusi: {
      name: 'Egusi + pounded yam', short: 'EGUSI', icon: 'egusi', price: 10,
      color: 0xc59a5b, x: -3.6, prop: 'potSoup', unlockAtSeconds: 0,
    },
    zobo: {
      name: 'Zobo', short: 'ZOBO', icon: 'zobo', price: 5,
      color: 0xb0203c, x: -1.2, prop: 'jug', unlockAtSeconds: 0,
    },
    moimoi: {
      name: 'Moi moi', short: 'MOIMOI', icon: 'moimoi', price: 7,
      color: 0xcf9a52, x: 1.2, prop: 'panRolls', unlockAtSeconds: 40,
    },
    suya: {
      name: 'Suya', short: 'SUYA', icon: 'suya', price: 9,
      color: 0x8c4a2a, x: 3.6, prop: 'skewers', unlockAtSeconds: 85,
    },
    chapman: {
      name: 'Chapman', short: 'CHAPMAN', icon: 'chapman', price: 6,
      color: 0xd9873a, x: 6.0, prop: 'jug', unlockAtSeconds: 130,
    },
  },

  // How close the player must be to grab a dish.
  pickupRadius: 1.45,

  // How long a freshly unlocked pickup point flashes its "NEW" badge.
  newBadgeSeconds: 7,

  // The bin at the end of the counter: walk in to bin the top plate.
  bin: { x: 7.0, z: -4.35, radius: 0.85, cooldown: 0.6 },

  // ------------------------------------------------------------------ player
  player: {
    // Must sit in an open walkway: table colliders (r=0.98) at z=2.8 push the
    // player back out to z>4.12, so spawning any closer traps them there.
    spawn: [0, 5.2],
    radius: 0.34,
    maxSpeed: 6.2,
    acceleration: 26,     // how fast we reach max speed
    friction: 12,         // how fast we stop when no input
    turnSpeed: 14,        // how fast the body turns to face travel
    walkCycle: 11,        // steps per second at full speed
    carryHeight: 1.02,     // y of the bottom plate (world, feet at 0)
    carryOffset: 0.52,   // how far in front of the chest the stack sits
    carrySpacing: 0.24,   // vertical gap between stacked plates
    carryTilt: 0.16,      // how much the stack leans when running
    carryLimit: 3,
  },

  // --------------------------------------------------------------- customers
  customers: {
    maxActiveEarly: 5,
    maxActiveLate: 9,
    // Generous, because the table collision circles (0.98 + player 0.34) mean you
    // can't always stand right beside a chair — the nearest reachable spot in a
    // walkway is often just over a metre away.
    seatRadius: 1.5,
    leaveSpeed: 2.6,
    stormSpeed: 4.2,       // angry customers exit FAST
    // Wrong dish = no change to your hands, but they lose patience fast.
    wrongDishPenalty: 5.0, // seconds of patience knocked off
    wrongDishCooldown: 0.9,
    happyDelay: 0.5,       // pause before a happy customer stands up
    // Order bubble world size. The dish NAME has to be readable on a phone,
    // where the bubble is only ~90 CSS px across.
    bubbleScale: 1.55,
    // Tiny delay before a customer can start losing patience, so a fresh
    // arrival isn't punished while they are still walking in.
    patienceGrace: 0.6,
    // Difficulty: lerp between the two bracketing levels by `at` (seconds).
    levels: [
      { at: 0,   spawn: 6.2, patience: 50, order: 1, speed: 1.5 },
      { at: 45,  spawn: 5.3, patience: 45, order: 1, speed: 1.7 },
      { at: 90,  spawn: 4.6, patience: 40, order: 1, speed: 1.9 },
      { at: 140, spawn: 4.0, patience: 36, order: 2, speed: 2.1 },
      { at: 200, spawn: 3.5, patience: 32, order: 2, speed: 2.3 },
      { at: 270, spawn: 3.0, patience: 28, order: 2, speed: 2.5 },
      { at: 350, spawn: 2.6, patience: 25, order: 2, speed: 2.7 },
    ],
  },

  // ------------------------------------------------------------------ scoring
  game: {
    lives: 3,
    baseTip: 3,           // coins for finishing a customer
    orderItemBonus: 2,    // extra per item still on the order
    quickBonusMax: 5,     // extra for serving while patience is still high
    quickBonusFraction: 0.6,
    coinPopLife: 0.9,
  },

  // ------------------------------------------------------------------- juice
  feel: {
    squashAmount: 0.22,   // pickup squash/stretch
    squashTime: 0.28,
    hopHeight: 0.45,      // happy hop
    hopTime: 0.42,
    shakeOnStormOut: 0.55,
    shakeOnServe: 0.12,
    steamPuffs: 4,
    steamRise: 0.9,
  },

  // ------------------------------------------------------------------- audio
  audio: {
    masterVolume: 0.5,
    muted: false,
  },
};

// ===========================================================================
// Dish helpers — everything derives from the single CONFIG.dishes table.
// ===========================================================================

/** Every dish id, in counter order (the key order of the table). */
export const DISH_IDS = Object.keys(CONFIG.dishes);

/**
 * The dish table as an array, with `id` folded in.
 * @returns {Array<{id:string}>} one entry per dish
 */
export function dishList() {
  return DISH_IDS.map((id) => ({ id, ...CONFIG.dishes[id] }));
}

/** One dish, or undefined if the id is unknown. */
export function dish(id) {
  return CONFIG.dishes[id];
}

/**
 * Dish ids a customer is allowed to order right now: unlocked only.
 * A dish that is still locked must never appear in an order, or the player
 * would be asked for something they cannot pick up.
 * @param {number} elapsed seconds into the round
 * @returns {string[]}
 */
export function unlockedDishIds(elapsed) {
  return DISH_IDS.filter((id) => CONFIG.dishes[id].unlockAtSeconds <= elapsed);
}

/**
 * Dev check: every dish in the order table must have a pickup point, and vice
 * versa. Called once at start-up; logs an error rather than throwing so a
 * typo shows up loudly in the console instead of blanking the page.
 * @param {Array<{dishId:string}>} pickups built by scene.js
 * @returns {boolean} true when everything lines up
 */
export function verifyDishPickups(pickups) {
  const pickupIds = new Set(pickups.map((p) => p.dishId));
  const problems = [];

  for (const id of DISH_IDS) {
    if (!pickupIds.has(id)) {
      problems.push(`dish "${id}" can be ordered but has NO pickup point on the counter`);
    }
  }
  for (const p of pickups) {
    if (!CONFIG.dishes[p.dishId]) {
      problems.push(`pickup point "${p.dishId}" has no entry in CONFIG.dishes`);
    }
    const d = CONFIG.dishes[p.dishId];
    if (d && typeof d.unlockAtSeconds !== 'number') {
      problems.push(`dish "${p.dishId}" has no unlockAtSeconds`);
    }
  }

  if (problems.length) {
    console.error('[mami] DISH/PICKUP MISMATCH:\n  ' + problems.join('\n  '));
    return false;
  }
  console.log(`[mami] menu check ok — ${DISH_IDS.length} dishes, ${pickups.length} pickup points`);
  return true;
}