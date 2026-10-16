// ---------------------------------------------------------------------------
// character.js — builds ANY character (player, Mami, customers) from ONE
// style object. Unknown or missing values fall back to sensible defaults, so a
// partial style from start.ng can never break the game.
//
// Style fields:
//   body          'female' | 'male'
//   primaryColor  shirt / dress
//   secondaryColor skirt / trousers / trim
//   skinColor
//   hairColor
//   hair          short | afro | braids | bun | ponytail | dreads | bald
//   hat           none | cap | beanie | tophat | crown
//   accessory     none | glasses | earrings | beard | scarf | backpack
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { boxGeo, cylGeo, sphGeo, torusGeo, coneGeo, mat, disposeAll } from './scene.js';

// --- skeleton proportions (metres, feet on y=0) ----------------------------
const HIP_Y = 0.84;
const SHOULDER_Y = 1.36;
const HEAD_Y = 1.58;
const HEAD_R = 0.22;
const HIP_SPAN = 0.13;   // half distance between legs
const SHOULDER_SPAN = 0.26;
// Chair seat height (config.tables.seatY). Sitting drops the hips to this so a
// seated character rests on the chair instead of hovering above it.
const SEAT_Y = CONFIG.tables.seatY;

// --- valid value lists ------------------------------------------------------
const BODIES = ['female', 'male'];
const HAIRS = ['short', 'afro', 'braids', 'bun', 'ponytail', 'dreads', 'bald'];
const HATS = ['none', 'cap', 'beanie', 'tophat', 'crown'];
const ACCESSORIES = ['none', 'glasses', 'earrings', 'beard', 'scarf', 'backpack'];

export const DEFAULT_STYLE = {
  body: 'female',
  primaryColor: '#e2564a',
  secondaryColor: '#f6efdd',
  skinColor: '#8d5a2b',
  hairColor: '#2b1a12',
  hair: 'bun',
  hat: 'none',
  accessory: 'earrings',
};

// ===========================================================================
// Style validation
// ===========================================================================

function pickOne(list, value, fallback) {
  return typeof value === 'string' && list.indexOf(value) !== -1 ? value : fallback;
}

function pickColor(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const s = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(s)) return s;
    if (/^#[0-9a-f]{3}$/i.test(s)) {
      // #abc -> #aabbcc
      return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    }
    if (/^[0-9a-f]{6}$/i.test(s)) return '#' + s;
  }
  return fallback;
}

/** Fill in every field, replacing anything unknown with the default. */
export function normaliseStyle(style) {
  const s = style && typeof style === 'object' ? style : {};
  return {
    body: pickOne(BODIES, s.body, DEFAULT_STYLE.body),
    primaryColor: pickColor(s.primaryColor, DEFAULT_STYLE.primaryColor),
    secondaryColor: pickColor(s.secondaryColor, DEFAULT_STYLE.secondaryColor),
    skinColor: pickColor(s.skinColor, DEFAULT_STYLE.skinColor),
    hairColor: pickColor(s.hairColor, DEFAULT_STYLE.hairColor),
    hair: pickOne(HAIRS, s.hair, DEFAULT_STYLE.hair),
    hat: pickOne(HATS, s.hat, DEFAULT_STYLE.hat),
    accessory: pickOne(ACCESSORIES, s.accessory, DEFAULT_STYLE.accessory),
  };
}

/** Roll the dice on a look. Used for customers (and the title screen). */
export function randomStyle(rand = Math.random) {
  const r = (n) => Math.floor(rand() * n);
  const skins = ['#8d5a2b', '#c98a5b', '#6b4226', '#e0ac7e', '#4f2f1c'];
  const hairs = ['#241812', '#3b2418', '#5a3a1e', '#8a5a2b', '#1a1a1a', '#c9a15a'];
  const shirts = ['#e2564a', '#2f7d8c', '#f2b134', '#5b8c5a', '#8c5ba8', '#d96a3a', '#3f6fbf', '#c94f7c'];
  const bottoms = ['#2b3a55', '#4a3728', '#d8d2c4', '#374a2b', '#5a3f6b', '#1f2429'];
  const styles = [
    { body: 'female', hair: 'braids', accessory: 'earrings' },
    { body: 'female', hair: 'bun', accessory: 'glasses' },
    { body: 'female', hair: 'ponytail', accessory: 'none' },
    { body: 'female', hair: 'afro', accessory: 'scarf' },
    { body: 'male', hair: 'short', accessory: 'beard' },
    { body: 'male', hair: 'short', accessory: 'none' },
    { body: 'male', hair: 'dreads', accessory: 'cap' },
    { body: 'male', hair: 'bald', accessory: 'glasses' },
    { body: 'male', hair: 'dreads', accessory: 'none' },
    { body: 'female', hair: 'short', accessory: 'none' },
  ];
  const base = styles[r(styles.length)];
  return {
    body: base.body,
    primaryColor: shirts[r(shirts.length)],
    secondaryColor: bottoms[r(bottoms.length)],
    skinColor: skins[r(skins.length)],
    hairColor: hairs[r(hairs.length)],
    hair: base.hair,
    hat: rand() < 0.28 ? ['cap', 'beanie', 'tophat', 'crown'][r(4)] : 'none',
    accessory: base.accessory,
  };
}

// ===========================================================================
// Build
// ===========================================================================

function p(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = false;
  return m;
}

/**
 * Build a character.
 * @returns {{
 *   group: THREE.Group, style: object,
 *   update: function(number, number), setSitting: function(boolean),
 *   hop: function(), squash: function(), setFacing: function(number),
 *   dispose: function()
 * }}
 */
export function buildCharacter(inputStyle) {
  const style = normaliseStyle(inputStyle);

  const skinMat = mat(style.skinColor);
  const shirtMat = mat(style.primaryColor);
  const bottomMat = mat(style.secondaryColor);
  const hairMat = mat(style.hairColor);
  const darkMat = mat(0x22262b); // shoes, sunglasses, misc trim

  // Root: position/rotation of the character in the world.
  const group = new THREE.Group();

  // `body` is what we squash, stretch, hop and sit, keeping feet on the floor.
  const body = new THREE.Group();
  group.add(body);

  const female = style.body === 'female';

  // --- hips / torso --------------------------------------------------------
  body.add(p(cylGeo(0.19, 0.21, 0.16, 8), bottomMat, 0, HIP_Y, 0));

  const torso = new THREE.Group();
  torso.position.y = HIP_Y;
  body.add(torso);
  // hexagonal torso reads as low-poly without looking like a box
  const torsoGeo = female ? cylGeo(0.24, 0.2, 0.5, 7) : cylGeo(0.28, 0.22, 0.52, 7);
  torso.add(p(torsoGeo, shirtMat, 0, 0.25, 0));
  // collar
  torso.add(p(cylGeo(0.1, 0.12, 0.06, 8), bottomMat, 0, 0.5, 0));
  // a skirt for female, a belt for male
  if (female) {
    const skirt = p(cylGeo(0.22, 0.34, 0.3, 8), bottomMat, 0, -0.06, 0);
    torso.add(skirt);
  } else {
    torso.add(p(cylGeo(0.235, 0.235, 0.07, 8), darkMat, 0, 0.06, 0));
  }

  // --- legs ----------------------------------------------------------------
  const legs = [];
  [-1, 1].forEach((side) => {
    const leg = new THREE.Group();
    leg.position.set(side * HIP_SPAN, HIP_Y, 0);
    const thighLen = female ? 0.4 : 0.42;
    leg.add(p(cylGeo(0.09, 0.08, thighLen, 6), female ? skinMat : bottomMat, 0, -thighLen / 2, 0));
    // lower leg
    const shin = new THREE.Group();
    shin.position.y = -thighLen;
    shin.add(p(cylGeo(0.075, 0.06, HIP_Y - thighLen - 0.06, 6), female ? skinMat : bottomMat,
      0, -(HIP_Y - thighLen - 0.06) / 2, 0));
    // foot
    shin.add(p(boxGeo(0.13, 0.08, 0.24), darkMat, 0, -(HIP_Y - thighLen) + 0.04, 0.04));
    leg.add(shin);
    body.add(leg);
    legs.push(leg);
  });

  // --- arms ----------------------------------------------------------------
  const arms = [];
  [-1, 1].forEach((side) => {
    const arm = new THREE.Group();
    arm.position.set(side * SHOULDER_SPAN, SHOULDER_Y, 0);
    const upper = 0.28;
    arm.add(p(cylGeo(0.06, 0.055, upper, 6), shirtMat, 0, -upper / 2, 0));
    const fore = new THREE.Group();
    fore.position.y = -upper;
    fore.add(p(cylGeo(0.05, 0.045, 0.26, 6), skinMat, 0, -0.13, 0));
    // hand
    fore.add(p(sphGeo(0.055, 6, 5), skinMat, 0, -0.28, 0));
    arm.add(fore);
    body.add(arm);
    arms.push(arm);
  });

  // --- head ----------------------------------------------------------------
  const head = new THREE.Group();
  head.position.y = HEAD_Y;
  body.add(head);
  head.add(p(sphGeo(HEAD_R, 8, 6), skinMat, 0, 0, 0));
  // face: two eyes and a mouth, only a few triangles of work
  const eyeMat = mat(0x1b1410);
  head.add(p(boxGeo(0.045, 0.055, 0.02), eyeMat, -0.075, 0.02, HEAD_R - 0.02, 0));
  head.add(p(boxGeo(0.045, 0.055, 0.02), eyeMat, 0.075, 0.02, HEAD_R - 0.02, 0));
  head.add(p(boxGeo(0.07, 0.02, 0.02), eyeMat, 0, -0.08, HEAD_R - 0.03, 0));
  // ears
  head.add(p(sphGeo(0.05, 5, 4), skinMat, -HEAD_R + 0.01, 0, 0, 0));
  head.add(p(sphGeo(0.05, 5, 4), skinMat, HEAD_R - 0.01, 0, 0, 0));
  // nose
  head.add(p(boxGeo(0.04, 0.05, 0.04), skinMat, 0, -0.03, HEAD_R - 0.01, 0));

  // --- hair ----------------------------------------------------------------
  addHair(head, style, hairMat);

  // --- hat -----------------------------------------------------------------
  addHat(head, style);

  // --- accessory -----------------------------------------------------------
  addAccessory(head, torso, style);

  // =========================================================================
  // Animation state
  // =========================================================================
  const state = {
    phase: Math.random() * Math.PI * 2,   // walk cycle offset
    facing: 0,                              // radians, smoothed towards target
    targetFacing: 0,
    sitting: false,
    hopT: 0,                                // >0 while hopping
    squashT: 0,                             // >0 while squashing
    speed: 0,                               // 0..1 smoothed for lean
  };

  /** Advance the walk cycle. speed is 0..1. */
  function update(dt, speed = 0, walkCycle = 11) {
    state.speed += (speed - state.speed) * Math.min(1, dt * 12);
    const s = state.speed;
    // Sitting drops the hips from standing height (0.84) down to chair-seat
    // height, otherwise the character hovers above the chair.
    const sitDrop = state.sitting ? -(HIP_Y - SEAT_Y) : 0;

    if (!state.sitting) {
      state.phase += dt * walkCycle * Math.max(0.12, s);
      const swing = Math.sin(state.phase) * 0.9 * s;
      const swing2 = Math.sin(state.phase + Math.PI) * 0.9 * s;
      legs[0].rotation.x = swing;
      legs[1].rotation.x = swing2;
      // knees bend a touch on the back-swing
      legs[0].children[1].rotation.x = Math.max(0, -Math.sin(state.phase)) * 0.6 * s;
      legs[1].children[1].rotation.x = Math.max(0, -Math.sin(state.phase + Math.PI)) * 0.6 * s;
      // arms counter-swing; hands tilt forward when carrying
      arms[0].rotation.x = swing2 * 0.7;
      arms[1].rotation.x = swing * 0.7;
      arms[0].rotation.z = 0.08 + s * 0.05;
      arms[1].rotation.z = -0.08 - s * 0.05;
      // vertical bob + forward lean when running
      body.position.y = sitDrop + Math.abs(Math.sin(state.phase)) * 0.05 * s;
      body.rotation.x = s * 0.13;
    } else {
      // sitting: legs forward, arms down, slight slouch
      legs[0].rotation.x = -1.45;
      legs[1].rotation.x = -1.45;
      legs[0].children[1].rotation.x = 1.5;
      legs[1].children[1].rotation.x = 1.5;
      arms[0].rotation.x = -0.25;
      arms[1].rotation.x = -0.25;
      arms[0].rotation.z = 0.14;
      arms[1].rotation.z = -0.14;
      body.rotation.x = 0.06;
      body.position.y = sitDrop;
    }

    // face the direction we're travelling
    let d = state.targetFacing - state.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    state.facing += d * Math.min(1, dt * 14);
    body.rotation.y = state.facing;

    // happy hop
    if (state.hopT > 0) {
      state.hopT = Math.max(0, state.hopT - dt / 0.42);
      const t = 1 - state.hopT;                 // 0..1
      body.position.y = Math.sin(t * Math.PI) * 0.45;
      const squash = Math.sin(t * Math.PI);
      body.scale.set(1 - squash * 0.12, 1 + squash * 0.16, 1 - squash * 0.12);
    } else if (state.squashT > 0) {
      // pickup squash & stretch
      state.squashT = Math.max(0, state.squashT - dt / 0.28);
      const t = 1 - state.squashT;
      const k = Math.sin(t * Math.PI);
      body.scale.set(1 + k * 0.22, 1 - k * 0.2, 1 + k * 0.22);
    } else if (Math.abs(body.scale.x - 1) > 0.001) {
      body.scale.set(1, 1, 1);
    }
  }

  return {
    group,
    body,
    head,
    style,
    update,
    /** Sit (true) or stand (false). */
    setSitting(v) {
      state.sitting = v;
      if (v) state.targetFacing = Math.PI; // face the table
    },
    /** Face a world direction (radians). */
    setFacing(rad) {
      state.targetFacing = rad;
    },
    hop() {
      state.hopT = 1;
      state.sitting = false;
    },
    squash() {
      state.squashT = 1;
    },
    dispose() {
      disposeAll(group);
    },
  };
}

// ===========================================================================
// Hair / hat / accessory builders
// ===========================================================================

function addHair(head, style, hairMat) {
  switch (style.hair) {
    case 'short': {
      const cap = p(sphGeo(HEAD_R + 0.015, 8, 5), hairMat, 0, 0.02, 0);
      cap.scale.set(1, 0.62, 1);
      head.add(cap);
      head.add(p(boxGeo(0.34, 0.1, 0.12), hairMat, 0, 0.02, -0.13));
      break;
    }
    case 'afro': {
      const a = p(sphGeo(HEAD_R + 0.11, 9, 7), hairMat, 0, 0.05, -0.01);
      a.scale.set(1, 0.92, 1);
      head.add(a);
      break;
    }
    case 'braids': {
      const cap = p(sphGeo(HEAD_R + 0.02, 8, 5), hairMat, 0, 0.04, 0);
      cap.scale.set(1, 0.55, 1);
      head.add(cap);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const len = 0.3 + (i % 3) * 0.06;
        const braid = p(cylGeo(0.035, 0.025, len, 5), hairMat,
          Math.cos(a) * 0.16, -0.04 - len / 2, Math.sin(a) * 0.16);
        head.add(braid);
        head.add(p(sphGeo(0.04, 5, 4), hairMat, Math.cos(a) * 0.16, -0.04 - len, Math.sin(a) * 0.16));
      }
      break;
    }
    case 'bun': {
      const cap = p(sphGeo(HEAD_R + 0.015, 8, 5), hairMat, 0, 0.03, 0);
      cap.scale.set(1, 0.6, 1);
      head.add(cap);
      head.add(p(sphGeo(0.13, 7, 6), hairMat, 0, 0.02, -0.24));
      break;
    }
    case 'ponytail': {
      const cap = p(sphGeo(HEAD_R + 0.015, 8, 5), hairMat, 0, 0.03, 0);
      cap.scale.set(1, 0.6, 1);
      head.add(cap);
      const tail = p(cylGeo(0.06, 0.04, 0.42, 6), hairMat, 0, -0.14, -0.22);
      tail.rotation.x = -0.35;
      head.add(tail);
      head.add(p(sphGeo(0.09, 6, 5), hairMat, 0, 0.12, -0.19));
      break;
    }
    case 'dreads': {
      const cap = p(sphGeo(HEAD_R + 0.02, 8, 5), hairMat, 0, 0.03, 0);
      cap.scale.set(1, 0.58, 1);
      head.add(cap);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const len = 0.24 + (i % 4) * 0.05;
        head.add(p(cylGeo(0.045, 0.035, len, 5), hairMat,
          Math.cos(a) * 0.19, -0.02 - len / 2, Math.sin(a) * 0.19));
      }
      break;
    }
    case 'bald':
    default:
      // nothing — maybe a shine highlight
      head.add(p(sphGeo(HEAD_R + 0.012, 8, 5),
        mat(0xffffff, { transparent: true, opacity: 0.12, depthWrite: false }), 0, 0.05, 0.02));
      break;
  }
}

function addHat(head, style) {
  switch (style.hat) {
    case 'cap': {
      const hatMat = mat(0x2b4f8c);
      const crown = p(sphGeo(HEAD_R + 0.06, 8, 5), hatMat, 0, 0.05, 0);
      crown.scale.set(1, 0.5, 1);
      head.add(crown);
      const brim = p(boxGeo(0.3, 0.03, 0.2), hatMat, 0, 0.03, 0.2);
      head.add(brim);
      break;
    }
    case 'beanie': {
      const hatMat = mat(0xc94f7c);
      const dome = p(sphGeo(HEAD_R + 0.06, 8, 6), hatMat, 0, 0.05, 0);
      dome.scale.set(1, 0.82, 1);
      head.add(dome);
      head.add(p(cylGeo(HEAD_R + 0.08, HEAD_R + 0.08, 0.09, 10), mat(0xa83a63), 0, 0.0, 0));
      head.add(p(sphGeo(0.06, 6, 5), hatMat, 0, HEAD_R + 0.09, 0));
      break;
    }
    case 'tophat': {
      const hatMat = mat(0x1c1c20);
      head.add(p(cylGeo(0.34, 0.34, 0.03, 12), hatMat, 0, 0.1, 0));
      head.add(p(cylGeo(0.21, 0.23, 0.34, 10), hatMat, 0, 0.28, 0));
      head.add(p(cylGeo(0.23, 0.23, 0.07, 10), mat(0x8c2f3a), 0, 0.14, 0));
      break;
    }
    case 'crown': {
      const hatMat = mat(0xe8b73a, { emissive: 0x6b4a00, emissiveIntensity: 0.6 });
      head.add(p(cylGeo(0.21, 0.22, 0.12, 10), hatMat, 0, 0.16, 0));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spike = p(coneGeo(0.045, 0.16, 5), hatMat, Math.cos(a) * 0.19, 0.29, Math.sin(a) * 0.19);
        head.add(spike);
        head.add(p(sphGeo(0.03, 5, 4), mat(0xd94f4f), Math.cos(a) * 0.19, 0.36, Math.sin(a) * 0.19));
      }
      break;
    }
    case 'none':
    default:
      break;
  }
}

function addAccessory(head, torso, style) {
  switch (style.accessory) {
    case 'glasses': {
      const glassMat = mat(0x1c1c20);
      const lensMat = mat(0xbfe3ff, { transparent: true, opacity: 0.45, depthWrite: false });
      for (const x of [-0.085, 0.085]) {
        const lens = p(torusGeo(0.055, 0.014, 6, 10), glassMat, x, 0.02, HEAD_R - 0.01);
        head.add(lens);
        const fill = p(sphGeo(0.05, 6, 4), lensMat, x, 0.02, HEAD_R - 0.02);
        fill.castShadow = false;
        head.add(fill);
      }
      head.add(p(boxGeo(0.05, 0.014, 0.014), glassMat, 0, 0.02, HEAD_R - 0.01));
      break;
    }
    case 'earrings': {
      const gold = mat(0xe8b73a, { emissive: 0x3a2c00, emissiveIntensity: 0.5 });
      for (const x of [-HEAD_R + 0.005, HEAD_R - 0.005]) {
        head.add(p(torusGeo(0.035, 0.012, 5, 8), gold, x, -0.07, 0));
      }
      break;
    }
    case 'beard': {
      const hairMat = mat(style.hairColor);
      const beard = p(boxGeo(0.24, 0.16, 0.16), hairMat, 0, -0.13, HEAD_R - 0.09);
      beard.rotation.x = -0.2;
      head.add(beard);
      // moustache
      head.add(p(boxGeo(0.16, 0.045, 0.05), hairMat, 0, -0.05, HEAD_R - 0.01));
      break;
    }
    case 'scarf': {
      // `torso` is offset to hip height, so use local coordinates here.
      const scarfMat = mat(0xd94f4f);
      const ring = p(torusGeo(0.16, 0.07, 6, 12), scarfMat, 0, SHOULDER_Y - HIP_Y, 0);
      ring.rotation.x = Math.PI / 2;
      torso.add(ring);
      const tail = p(boxGeo(0.12, 0.3, 0.05), scarfMat, 0.08, SHOULDER_Y - HIP_Y - 0.18, 0.14);
      tail.rotation.z = 0.25;
      torso.add(tail);
      break;
    }
    case 'backpack': {
      const bagMat = mat(0x6b4a2f);
      torso.add(p(boxGeo(0.34, 0.4, 0.2), bagMat, 0, 0.24, -0.28));
      torso.add(p(boxGeo(0.24, 0.14, 0.16), mat(0x8a6a45), 0, 0.06, -0.34));
      torso.add(p(boxGeo(0.06, 0.36, 0.06), bagMat, -0.16, 0.3, -0.16));
      torso.add(p(boxGeo(0.06, 0.36, 0.06), bagMat, 0.16, 0.3, -0.16));
      break;
    }
    case 'none':
    default:
      break;
  }
}