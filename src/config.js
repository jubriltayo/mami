// ---------------------------------------------------------------------------
// config.js — EVERY tuning number for MAMI lives in this file.
// Nothing else in the game hard-codes a value you would want to tweak.
// ---------------------------------------------------------------------------

// Dev switches, read from the URL query string HERE rather than in main.js.
// ES module bodies all run before main.js's body, so parsing the flags in
// main.js would leave every other module seeing them as false for its whole
// module body — including platform.js, which must know whether it is allowed
// to send a score to start.ng.
//   ?test=1   crush patience so a whole round plays out fast
//   ?debug=1  expose window.__mami for scripted browser tests (implies test)
//   ?debug=1  alone (explicitDebug) is what exposes the debug hook and the
//             shuffle button; ?test=1 by itself does not
const urlFlags = new URLSearchParams(window.location.search);
const TEST_MODE = urlFlags.get('test') === '1';
const DEBUG_PARAM = urlFlags.get('debug') === '1';
// debugMode is the "this is an automated run" flag: ?test=1 implies it, so a
// test run can never send a score to start.ng.
// explicitDebug is stricter — it is ONLY true when ?debug=1 is literally in the
// address. That is what exposes window.__mami and the shuffle button, so
// ?test=1 on its own stays a plain "play a round fast" mode with no debug
// surface hanging off it.
const DEBUG_MODE = TEST_MODE || DEBUG_PARAM;

export const CONFIG = {
  // Neither is ever on in normal play.
  testMode: TEST_MODE,
  debugMode: DEBUG_MODE,
  explicitDebug: DEBUG_PARAM,

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
    // Portrait is about FITTING, not following. A phone held upright is only
    // ~0.46 aspect, and fitting the full 16-unit counter width across it costs
    // a lot of zoom, so there is no room left to pan: the camera sits still and
    // shows the whole room. This pose was solved so that at 360x800, 390x844
    // AND 412x915 all six pickup signs, the bin, both rows of chairs and the
    // player's whole working area (the counter run and the seat aisles) land
    // inside the frame with margin to spare. The steeper 58-degree pitch also
    // buys the only thing that separates the counter cards from a back-row
    // customer's bubble: with a shallower angle they land in the same band.
    portraitFov: 56,
    portraitPosition: [0, 32, 18],
    portraitTarget: [0, 1.0, -1.5],
    near: 0.1,
    far: 80,
    // Pulled in from [0,13,16.2] so the counter signs and characters read bigger:
  // 41.4 -> 48.7 screen px per world unit at 1366x768. Still frames the whole
  // counter, the bin, and both rows of tables with margin either side.
    position: [0, 11, 13.3],
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
    signY: 2.62,
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
      color: 0xe07a2b, x: -6.2, prop: 'potRice', unlockAtSeconds: 0,
    },
    egusi: {
      name: 'Egusi + pounded yam', short: 'EGUSI', icon: 'egusi', price: 10,
      color: 0xc59a5b, x: -4.0, prop: 'potSoup', unlockAtSeconds: 0,
    },
    zobo: {
      name: 'Zobo', short: 'ZOBO', icon: 'zobo', price: 5,
      color: 0xb0203c, x: -1.8, prop: 'jug', unlockAtSeconds: 0,
    },
    moimoi: {
      name: 'Moi moi', short: 'MOIMOI', icon: 'moimoi', price: 7,
      color: 0xcf9a52, x: 0.4, prop: 'panRolls', unlockAtSeconds: 40,
    },
    suya: {
      name: 'Suya', short: 'SUYA', icon: 'suya', price: 9,
      color: 0x8c4a2a, x: 2.6, prop: 'skewers', unlockAtSeconds: 85,
    },
    chapman: {
      name: 'Chapman', short: 'CHAPMAN', icon: 'chapman', price: 6,
      color: 0xd9873a, x: 4.8, prop: 'jug', unlockAtSeconds: 130,
    },
  },

  // Pickup points are spaced 2.2 apart (not 2.4) and stop short of the right
  // end so the 2.2-wide sign boards cannot collide with the bin's sign.
  pickupRadius: 1.45,

  // Pickup sign board, in world units. Wide so a one-word dish name can be set
  // BIG: at 1366x768 a 2.2x1.25 board is 111x63 screen px, and the name is
  // ~26% of that height => ~16px. The canvas matches the aspect exactly.
  sign: {
    size: [2.2, 1.25],
    badgeSize: [1.15, 0.66],
    // Portrait has to zoom out ~2.5x to fit the whole counter across a phone,
    // which shrinks everything. A landscape board is then only ~46x29px, and
    // six of those across 390px is the hard ceiling on how big a dish name can
    // get on a phone: about 9-14px cap height. The portrait card therefore
    // spends the whole card on the name with only a small icon, instead of
    // wasting a tall card on a big icon. Width stays under the 2.2 pickup
    // spacing so the six cards do not touch.
    portraitSize: [1.95, 1.5],
    portraitBadgeSize: [1.0, 0.58],
    // Sitting the card ON the counter top (bottom edge at 1.05) rather than on
    // the counter face is what makes it clear a back-row customer's bubble in
    // portrait. At 1.8 the card band finishes ~6-7px above the bubble at all
    // three phone sizes; on the counter face it overlapped by 5px.
    portraitY: 1.8,
  },

  // How long a freshly unlocked pickup point flashes its "NEW" badge.
  newBadgeSeconds: 7,

  // The bin at the end of the counter: walk in to bin the top plate. Sits at
  // x=6.95 with the pickup signs stopping at x=5.9 so the two boards clear.
  // signSize keeps a ~2:1 aspect matching the 384x192 canvas, which is what
  // puts "BIN" at ~14.6px cap height on a 1366x768 laptop.
  bin: { x: 6.95, z: -4.35, radius: 0.85, cooldown: 0.6, signSize: [1.05, 0.52],
    // Portrait: the landscape board is only 21x10px on a phone, so BIN gets a
    // tall card too. 1.3 wide still clears the last pickup sign at x=5.9.
    portraitSignSize: [1.3, 1.5], portraitY: 1.8 },

  // ------------------------------------------------------------------ player
  player: {
    // Must sit in an open walkway: table colliders (r=0.98) at z=2.8 push the
    // player back out to z>4.12, so spawning any closer traps them there.
    spawn: [0, 5.2],
    radius: 0.34,
    maxSpeed: 7.8,         // ~25% faster than the first pass
    acceleration: 32,      // ~25% snappier: stops feeling like wading
    friction: 12,          // how fast we stop when no input
    turnSpeed: 14,        // how fast the body turns to face travel
    walkCycle: 11,        // steps per second at full speed
    carryHeight: 1.02,     // y of the bottom plate (world, feet at 0)
    carryOffset: 0.52,   // how far in front of the chest the stack sits
    carrySpacing: 0.24,   // vertical gap between stacked plates
    carryTilt: 0.16,      // how much the stack leans when running
    carryLimit: 3,
    reStackTime: 0.18,  // how long plates take to slide down after one is taken
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
    // Order bubble. fitBillboard() in customers.js re-fits the sprite every
    // frame so it occupies this fraction of the VIEWPORT HEIGHT whatever the
    // camera distance — an order is the same number of pixels tall at the near
    // table and the far one, on a laptop and a phone.
    //
    // 0.049 puts the whole sprite at ~38px on a 768px laptop and ~41px on a
    // 844px phone; the art is a strip 87-109px wide. Together with the narrow
    // fraction below this keeps the dish name at ~11px cap height.
    bubbleScreenFraction: 0.049,
    bubbleScreenNarrowAt: 620,   // CSS px, matches the ui.js media query
    bubbleScreenFractionNarrow: 0.045,
    // Fallback width:height ratio of the bubble art, used before the first
    // per-dish aspect is measured. Real bubbles size their canvas to the dish
    // name, so this is only a safety net.
    bubbleAspect: 2.7,
    // The counter sign row occupies a fixed screen band and the seats sit at
    // four depths (z = -2.35, -0.05, 1.65, 3.95), so no single bubble height
    // keeps every bubble out of that band. Instead the back row's bubble sits
    // ABOVE the signs and everyone else's sits BELOW them, which also keeps
    // the natural depth order — neither is ever drawn over the other.
    bubbleHeightDeep: 2.62,     // world y, for seats behind bubbleDeepZ
    bubbleHeightShallow: 2.46,  // world y, for every other seat
    bubbleDeepZ: -1.8,          // seat z at or below this counts as back row
    // Slightly to the side of the head, so a bubble never looks like a hat.
    bubbleOffsetX: 0.35,
    // Bubbles are nudged this far inside the viewport edge so one standing at
    // the side of the room is never shaved by the bezel.
    bubbleEdgeMargin: 6,
    // Tiny delay before a customer can start losing patience, so a fresh
    // arrival isn't punished while they are still walking in.
    patienceGrace: 0.6,
    // Difficulty: lerp between the two bracketing levels by `at` (seconds).
    // Early patience is generous (~20s) and tightens from there; spawn gaps
    // start at ~6.5s so 4-5 customers are seated inside the first 40s.
    levels: [
      { at: 0,   spawn: 5.8, patience: 20,   order: 1, speed: 2.6 },
      { at: 45,  spawn: 5.2, patience: 18,   order: 1, speed: 2.8 },
      { at: 90,  spawn: 5.1, patience: 16,   order: 1, speed: 3.0 },
      { at: 140, spawn: 4.5, patience: 14,   order: 2, speed: 3.1 },
      { at: 200, spawn: 4.0, patience: 12.5, order: 2, speed: 3.2 },
      { at: 270, spawn: 3.5, patience: 11,   order: 2, speed: 3.3 },
      { at: 350, spawn: 3.0, patience: 10,   order: 2, speed: 3.4 },
    ],
    // How quickly the first customer appears once a round starts.
    firstSpawnDelay: 0.7,
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