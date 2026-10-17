// ---------------------------------------------------------------------------
// scene.js — three.js renderer, camera, lights, and the whole physical room.
//
// Everything is built from primitives. Geometries and materials are cached and
// shared (tagged `userData.cached`) so a full room + a dozen customers stays
// cheap, and so disposeAll() can free the rest without touching the cache.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { CONFIG, dishList } from './config.js';

const C = CONFIG;

// ===========================================================================
// Shared geometry + material caches
// ===========================================================================

const geoCache = new Map();
const matCache = new Map();

/** Cached box geometry. */
export function boxGeo(w, h, d) {
  const key = `box|${w}|${h}|${d}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    g.userData.cached = true;
    geoCache.set(key, g);
  }
  return g;
}

/** Cached cylinder. */
export function cylGeo(rTop, rBottom, h, seg = 10) {
  const key = `cyl|${rTop}|${rBottom}|${h}|${seg}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(rTop, rBottom, h, seg);
    g.userData.cached = true;
    geoCache.set(key, g);
  }
  return g;
}

/** Cached sphere. */
export function sphGeo(r, wSeg = 10, hSeg = 7) {
  const key = `sph|${r}|${wSeg}|${hSeg}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.SphereGeometry(r, wSeg, hSeg);
    g.userData.cached = true;
    geoCache.set(key, g);
  }
  return g;
}

/** Cached cone. */
export function coneGeo(r, h, seg = 8) {
  const key = `cone|${r}|${h}|${seg}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.ConeGeometry(r, h, seg);
    g.userData.cached = true;
    geoCache.set(key, g);
  }
  return g;
}

/** Cached torus (rings, glasses, handles). */
export function torusGeo(r, tube, seg = 8, rad = 14) {
  const key = `tor|${r}|${tube}|${seg}|${rad}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.TorusGeometry(r, tube, seg, rad);
    g.userData.cached = true;
    geoCache.set(key, g);
  }
  return g;
}

/** Cached flat plane. */
export function planeGeo(w, h) {
  const key = `pln|${w}|${h}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.PlaneGeometry(w, h);
    g.userData.cached = true;
    geoCache.set(key, g);
  }
  return g;
}

/**
 * Cached flat-shaded material. Colours may be '#rrggbb' or 0xrrggbb.
 * opts: { emissive, emissiveIntensity, transparent, opacity, side, depthWrite }
 */
export function mat(color, opts = {}) {
  const key = `mat|${color}|${JSON.stringify(opts)}`;
  let m = matCache.get(key);
  if (!m) {
    const c = new THREE.Color(color);
    m = new THREE.MeshLambertMaterial({
      color: c,
      flatShading: true,
      emissive: opts.emissive !== undefined ? new THREE.Color(opts.emissive) : 0x000000,
      emissiveIntensity: opts.emissiveIntensity !== undefined ? opts.emissiveIntensity : 1,
      transparent: opts.transparent === true,
      opacity: opts.opacity !== undefined ? opts.opacity : 1,
      side: opts.side !== undefined ? opts.side : THREE.FrontSide,
      depthWrite: opts.depthWrite !== undefined ? opts.depthWrite : true,
    });
    m.userData.cached = true;
    matCache.set(key, m);
  }
  return m;
}

/** Mesh helper: mesh + shadow flags in one line. */
function part(geo, material, x = 0, y = 0, z = 0, { cast = true, receive = false } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// ===========================================================================
// Canvas textures (sign, menu board, poster) — drawn in code, no image files
// ===========================================================================

/** Max anisotropy the current renderer supports (1 if nothing is up yet). */
function maxAniso() {
  return renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
}

/**
 * Draw into a canvas and wrap it as a texture.
 *
 * Text clarity rules used everywhere: caller asks for the size it wants to be
 * seen at on screen, we draw it at >=2x that, we use a bold system font, and we
 * let the GPU pick the best mip/filter so downscaling stays crisp.
 *
 * @param {number} w  canvas width in px (pass the DISPLAYED width * 2+)
 * @param {number} h  canvas height in px
 * @param {function(CanvasRenderingContext2D, number, number)} draw
 */
export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  // Crisp text: round glyph positions so glyphs land on whole pixels.
  ctx.textRendering = 'geometricPrecision';
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso();
  // Downscale with mipmaps + trilinear, which is what keeps small distant text
  // legible instead of shimmering.
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  tex.userData.cached = true;
  return tex;
}

// The handwritten face, shared by every decorative board.
const HAND_FONT = '"Comic Sans MS", "Segoe Print", "Bradley Hand", cursive';

// Poster type size in its 720x600 canvas. Big because the card is only ~59px
// tall on screen — anything smaller drops under the readable-size floor.
const POSTER_FONT = 210;

/**
 * Wooden board with hand-written text on it.
 *
 * The text is MEASURED and shrunk until it fits with a real margin on both
 * sides. Handwriting faces vary wildly in width between machines, so a fixed
 * font size that looks right on the dev box silently runs "MAMI'S BUKA" off
 * the edge of its board elsewhere.
 */
function signTexture(text, {
  w = 512, h = 160, bg = '#1d6b4a', ink = '#fdf3d8', font = 64, sub = '',
  margin = 0.08,
} = {}) {
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    // board grain
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 2;
    for (let y = 12; y < h; y += 22) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y + 6);
      ctx.stroke();
    }
    ctx.strokeStyle = ink;
    ctx.lineWidth = 5;
    ctx.strokeRect(9, 9, w - 18, h - 18);
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxW = w * (1 - margin * 2);
    let size = font;
    ctx.font = `bold ${size}px ${HAND_FONT}`;
    while (ctx.measureText(text).width > maxW && size > 12) {
      size -= 2;
      ctx.font = `bold ${size}px ${HAND_FONT}`;
    }
    ctx.fillText(text, w / 2, sub ? h * 0.36 : h / 2);

    if (sub) {
      // Proportional, not a fixed pixel count: a subtitle must never shrink
      // below the readable floor just because the board got shorter. Fitted
      // independently so a long subtitle cannot push the main text off.
      let ss = Math.round(size * 0.42);
      ctx.font = `${ss}px ${HAND_FONT}`;
      while (ctx.measureText(sub).width > maxW && ss > 10) {
        ss -= 1;
        ctx.font = `${ss}px ${HAND_FONT}`;
      }
      ctx.fillText(sub, w / 2, h * 0.72);
    }
  });
}

// ---------------------------------------------------------------------------
// Dish icon painter — ONE implementation, used by the counter signs here and
// by the customer order bubbles in customers.js (which imports it from here,
// so the bubble and the sign can never drift apart).
// ---------------------------------------------------------------------------

/**
 * Draw a food glyph for a dish icon key, centred on (cx, cy) with radius r.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} icon key from CONFIG.dishes[id].icon
 */
export function drawDishIcon(ctx, icon, cx, cy, r) {
  ctx.save();
  ctx.translate(cx, cy);
  switch (icon) {
    case 'jollof': {
      // plate of orange rice with a plantain on the side
      ctx.fillStyle = '#efe3cd';
      ctx.beginPath(); ctx.ellipse(0, r * 0.42, r * 1.15, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e07a2b';
      ctx.beginPath(); ctx.arc(0, r * 0.2, r * 0.78, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f0c04a';
      ctx.beginPath(); ctx.ellipse(r * 0.72, r * 0.3, r * 0.3, r * 0.16, 0.4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'egusi': {
      // white pounded yam with brown soup
      ctx.fillStyle = '#efe3cd';
      ctx.beginPath(); ctx.ellipse(0, r * 0.4, r * 1.1, r * 0.36, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c59a5b';
      ctx.beginPath(); ctx.ellipse(-r * 0.15, r * 0.24, r * 0.85, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f7f2e6';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(r * 0.45 - i * r * 0.05, -r * 0.3 + i * r * 0.42, r * 0.34, r * 0.2, 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'moimoi': {
      ctx.fillStyle = '#efe3cd';
      ctx.beginPath(); ctx.ellipse(0, r * 0.45, r * 1.1, r * 0.36, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#cf9a52';
      for (const [dx, dy] of [[-0.45, 0.1], [0.4, 0.14], [0, -0.4]]) {
        ctx.beginPath(); ctx.arc(dx * r, dy * r, r * 0.42, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'suya': {
      ctx.strokeStyle = '#c9b184';
      ctx.lineWidth = r * 0.16;
      for (const dy of [-0.42, 0.3]) {
        ctx.beginPath(); ctx.moveTo(-r, dy * r); ctx.lineTo(r, dy * r); ctx.stroke();
      }
      ctx.fillStyle = '#8c4a2a';
      for (const dy of [-0.42, 0.3]) {
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc((i - 1) * r * 0.5, dy * r, r * 0.26, 0, Math.PI * 2); ctx.fill();
        }
      }
      break;
    }
    case 'zobo': {
      ctx.fillStyle = '#b0203c';
      ctx.beginPath();
      ctx.moveTo(-r * 0.45, -r * 0.7); ctx.lineTo(r * 0.45, -r * 0.7);
      ctx.lineTo(r * 0.3, r * 0.8); ctx.lineTo(-r * 0.3, r * 0.8);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#f4d9a0';
      ctx.lineWidth = r * 0.12;
      ctx.beginPath(); ctx.moveTo(r * 0.6, -r * 0.6); ctx.lineTo(r * 0.95, -r * 0.95); ctx.stroke();
      break;
    }
    case 'chapman':
    default: {
      ctx.fillStyle = '#d9873a';
      ctx.beginPath();
      ctx.moveTo(-r * 0.45, -r * 0.7); ctx.lineTo(r * 0.45, -r * 0.7);
      ctx.lineTo(r * 0.3, r * 0.8); ctx.lineTo(-r * 0.3, r * 0.8);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f2b134';
      ctx.beginPath(); ctx.ellipse(0, -r * 0.7, r * 0.45, r * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
  }
  ctx.restore();
}

const hexCss = (v) => '#' + (v >>> 0).toString(16).slice(-6).padStart(6, '0');

// One bold system stack for every piece of FUNCTIONAL text (pickup signs,
// order bubbles). Decorative boards keep the handwritten face.
export const UI_FONT = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';

/**
 * Work out how to draw `text` inside `maxW` while keeping it as TALL as
 * possible.
 *
 * Shrinking the font is the obvious way to fit a long name, but font size is
 * what sets the on-screen cap height — so shrinking "CHAPMAN" would push it
 * under the readable-size floor. Instead we squeeze horizontally first and only
 * fall back to a smaller font if the squeeze gets extreme.
 *
 * @returns {{size:number, sx:number}} font size and horizontal scale to apply
 */
export function fitTextMetrics(ctx, text, maxW, maxSize, minSize, minSx = 0.7) {
  let size = maxSize;
  ctx.font = `900 ${size}px ${UI_FONT}`;
  const w = ctx.measureText(text).width;
  if (w <= maxW) return { size, sx: 1 };

  let sx = maxW / w;
  if (sx < minSx) {
    // too much squeeze to be honest — start trading height for width
    sx = minSx;
    while (size > minSize) {
      size -= 4;
      ctx.font = `900 ${size}px ${UI_FONT}`;
      if (ctx.measureText(text).width * sx <= maxW) break;
    }
  }
  return { size, sx };
}

/**
 * Draw bold text centred on (cx, cy), fitted to maxW, with a white halo and a
 * dark outline so it stays readable over anything.
 */
export function drawOutlinedText(ctx, text, cx, cy, maxW, maxSize, minSize, opts = {}) {
  const { halo = 34, ink = 12, fill = '#1b1410' } = opts;
  const { size, sx } = fitTextMetrics(ctx, text, maxW, maxSize, minSize);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(sx, 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${size}px ${UI_FONT}`;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  // keep the outline visually even after the horizontal squeeze
  ctx.lineWidth = halo / sx;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText(text, 0, 0);
  ctx.lineWidth = ink / sx;
  ctx.strokeStyle = fill;
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, 0);
  ctx.restore();
  return size;
}

/**
 * The sign on a pickup point: a BIG dish icon with the dish name in bold
 * underneath, dark text on a light panel so it reads at a glance from the
 * top-down camera. No price — that lives in CONFIG only.
 *
 * Locked pickups are drawn washed out with a "SOON" ribbon, so it is obvious
 * that walking in there will not give you anything yet.
 *
 * @param {object} dish   CONFIG.dishes[id]
 * @param {boolean} unlocked
 */
function pickupSignTexture(dish, unlocked) {
  // Canvas is 1126x640, matching the 2.2x1.25 plane's aspect exactly, and drawn
  // ~10x the size the sign actually occupies on screen (111x63 px on a
  // 1366x768 laptop) so the downscale is heavily mipmapped and never blurry.
  return canvasTexture(1126, 640, (ctx, w, h) => {
    // --- panel -----------------------------------------------------------
    ctx.fillStyle = unlocked ? '#fdf6e3' : '#2b2724';
    roundRect(ctx, 10, 10, w - 20, h - 20, 44);
    ctx.fill();

    // --- border: thick, in the dish colour -------------------------------
    ctx.strokeStyle = unlocked ? hexCss(dish.color) : '#5a524c';
    ctx.lineWidth = 26;
    roundRect(ctx, 24, 24, w - 48, h - 48, 32);
    ctx.stroke();

    if (!unlocked) {
      // Deliberately recessive. A locked point must never compete with the
      // three live ones for the player's eye, so the whole board is pushed
      // well down in contrast and the SOON tag is small and dull — it only
      // needs to be legible enough to say "not yet", not to shout.
      ctx.fillStyle = 'rgba(24,21,19,0.88)';
      roundRect(ctx, 36, 36, w - 72, h - 72, 24);
      ctx.fill();

      ctx.save();
      ctx.globalAlpha = 0.22;
      drawDishIcon(ctx, dish.icon, w / 2, 210, 116);
      ctx.restore();

      // SOON ribbon: smaller than the lit board's dish name and low-saturation,
      // so a locked point never competes for the eye — but still big enough to
      // actually read at ~8px on a laptop. (At 62px it was ~4px, i.e. ink.)
      ctx.fillStyle = '#5c5348';
      ctx.strokeStyle = '#2a241f';
      ctx.lineWidth = 10;
      roundRect(ctx, w / 2 - 230, 348, 460, 150, 30);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#b3a99a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 115px ${UI_FONT}`;
      ctx.fillText('SOON', w / 2, 424);
      return;
    }

    // --- the BIG dish icon ----------------------------------------------
    drawDishIcon(ctx, dish.icon, w / 2, 218, 138);

    // --- the dish name, as large as it will go ---------------------------
    const text = (dish.short || dish.name).toUpperCase();
    drawOutlinedText(ctx, text, w / 2, 470, w - 80, 232, 120, {
      halo: 36, ink: 13, fill: '#1b1410',
    });
  });
}

/** Round-rect path helper (kept local so the sign code reads top-down). */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** The little NEW tag that pops on a pickup point when it unlocks. */
function newBadgeTexture() {
  return canvasTexture(512, 296, (ctx, w, h) => {
    ctx.fillStyle = '#f2b134';
    ctx.strokeStyle = '#5c3604';
    ctx.lineWidth = 20;
    roundRect(ctx, 16, 16, w - 32, h - 32, 44);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#3a2200';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 210px ${UI_FONT}`;
    ctx.fillText('NEW', w / 2, h / 2 + 8);
  });
}

/** Tiled floor: cheap checker + grout drawn once into a canvas. */
function floorTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const tiles = 4;
    const s = w / tiles;
    for (let y = 0; y < tiles; y++) {
      for (let x = 0; x < tiles; x++) {
        const light = (x + y) % 2 === 0;
        ctx.fillStyle = light ? '#bda88a' : '#9a8467';
        ctx.fillRect(x * s, y * s, s, s);
        // speckle
        for (let i = 0; i < 26; i++) {
          ctx.fillStyle = `rgba(${light ? '255,245,225' : '60,45,30'},${0.05 + Math.random() * 0.07})`;
          ctx.fillRect(x * s + Math.random() * s, y * s + Math.random() * s, 2, 2);
        }
      }
    }
    // grout
    ctx.strokeStyle = 'rgba(70,54,38,0.55)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= tiles; i++) {
      ctx.beginPath();
      ctx.moveTo(i * s, 0); ctx.lineTo(i * s, h);
      ctx.moveTo(0, i * s); ctx.lineTo(w, i * s);
      ctx.stroke();
    }
  });
}

/** Back-wall notice board. It carries ONE readable heading rather than a dish
 *  list: six names side by side could not be made legible at this camera
 *  distance (see buildCounter), and the counter signs already name every dish.
 */
function menuRailTexture() {
  return canvasTexture(1280, 262, (ctx, w, h) => {
    ctx.fillStyle = '#1d6b4a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 14; y < h; y += 30) ctx.fillRect(0, y, w, 4);
    ctx.strokeStyle = '#fdf3d8';
    ctx.lineWidth = 12;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = '#fdf3d8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 150px ${HAND_FONT}`;
    ctx.fillText("TODAY'S MENU", w / 2, h / 2);
  });
}

/** A faded poster for the wall. */
/** Wall poster. Deliberately just two big words: at the size this card
 *  actually occupies on screen (~59px tall) anything smaller than ~197px in
 *  this canvas falls under the readable-size floor, so there is no room for a
 *  third line or much decoration. */
function posterTexture() {
  return canvasTexture(720, 600, (ctx, w, h) => {
    ctx.fillStyle = '#f3e3c3';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c2452f';
    ctx.lineWidth = 18;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    // a sun disc behind the type, kept clear of the letterforms
    ctx.fillStyle = '#e8913a';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 200, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fdf6e3';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${POSTER_FONT}px ${UI_FONT}`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 26;
    ctx.strokeStyle = '#c2452f';
    ctx.strokeText('BUKA', w / 2, h * 0.34);
    ctx.fillText('BUKA', w / 2, h * 0.34);
    ctx.strokeText('FOOD', w / 2, h * 0.66);
    ctx.fillText('FOOD', w / 2, h * 0.66);
  });
}

// ===========================================================================
// World state
// ===========================================================================

/**
 * The built world. Populated by buildWorld() and read by main.js / customers.js.
 */
export const world = {
  seats: [],        // { x, z, table, side }  chair positions, index = seat id
  pickups: [],      // one labelled pickup point per dish, see buildPickups()
  bin: null,        // the bin at the end of the counter, see buildBin()
  colliders: [],    // { x, z, r } circles the player slides around
  door: null,       // where customers appear, outside the door
  doorGate: null,   // just inside the doorway
  playerSpawn: new THREE.Vector3(C.player.spawn[0], 0, C.player.spawn[1]),
};

let renderer = null;
let scene = null;
let camera = null;
let baseCamPos = new THREE.Vector3();
let baseCamTarget = new THREE.Vector3();
let shakeAmount = 0;
let titleOrbit = 0;
let portrait = false;                 // tall screens get a closer, following camera
const followSmooth = new THREE.Vector3();

const steamPuffs = [];
let fan = null;
let tvScreen = null;
const bulbs = [];
let tvTimer = 0;

// ===========================================================================
// Init
// ===========================================================================

/** Create renderer + scene + camera and build the room into them. */
export function initScene(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: C.renderer.antialias });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, C.renderer.pixelRatioCap));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  if (C.renderer.shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  scene = new THREE.Scene();
  scene.background = new THREE.Color(C.renderer.background);
  scene.fog = new THREE.Fog(C.renderer.fog.color, C.renderer.fog.near, C.renderer.fog.far);

  camera = new THREE.PerspectiveCamera(
    C.camera.fov,
    window.innerWidth / window.innerHeight,
    C.camera.near,
    C.camera.far,
  );
  setCameraPose(C.camera.position, C.camera.target);

  buildLights();
  buildRoom();
  buildCounter();
  buildTables();
  buildProps();

  window.addEventListener('resize', resize);
  return { renderer, scene, camera };
}

/** Move the camera, remembering the pose so screen shake can offset it. */
export function setCameraPose(position, target) {
  baseCamPos.set(position[0], position[1], position[2]);
  baseCamTarget.set(target[0], target[1], target[2]);
  camera.position.copy(baseCamPos);
  camera.lookAt(baseCamTarget);
}

/**
 * How many world units tall something must be to occupy `fraction` of the
 * viewport height when it is `distance` away from the camera.
 *
 * Used to keep billboards (order bubbles) a CONSTANT size on screen, so a
 * customer at the far side of the room is as readable as one at the near side,
 * and the text keeps its size when the window is resized or the portrait
 * camera kicks in.
 *
 * @param {number} fraction of viewport height (0..1)
 * @param {number} distance from camera to the object, in world units
 * @returns {number} world-unit size to scale the object to
 */
export function screenSizeFor(fraction, distance) {
  const halfFov = (camera ? camera.fov : 45) * Math.PI / 360;
  return fraction * 2 * Math.max(0.001, distance) * Math.tan(halfFov);
}

/** The live camera, for distance maths in other modules. */
export function getCamera() {
  return camera;
}

export function resize() {
  if (!renderer) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, C.renderer.pixelRatioCap));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // A phone in portrait is far too narrow to see 16m of room at once, so we
  // zoom in and let the camera follow the player instead.
  portrait = h > w * 1.1;
  camera.fov = portrait ? C.camera.portraitFov : C.camera.fov;
  camera.updateProjectionMatrix();
  if (portrait) followSmooth.set(0, 0, 0);
}

/** Render one frame. */
export function render() {
  renderer.render(scene, camera);
}

/** Add a screen shake impulse (0..1-ish). */
export function shake(amount) {
  shakeAmount = Math.min(1.2, shakeAmount + amount);
}

// ===========================================================================
// Lights
// ===========================================================================

function buildLights() {
  const L = C.lights;
  scene.add(new THREE.AmbientLight(L.ambient.color, L.ambient.intensity));
  scene.add(new THREE.HemisphereLight(L.hemisphere.sky, L.hemisphere.ground, L.hemisphere.intensity));

  const bulb = new THREE.PointLight(L.bulb.color, L.bulb.intensity, L.bulb.distance, L.bulb.decay);
  bulb.position.set(-0.4, L.bulb.y, -0.6);
  scene.add(bulb);
  bulbs.push({ light: bulb, base: L.bulb.intensity, phase: Math.random() * 10 });

  const bulb2 = new THREE.PointLight(L.bulbBack.color, L.bulbBack.intensity, L.bulbBack.distance, L.bulbBack.decay);
  bulb2.position.set(4.6, L.bulbBack.y, -4.4);
  scene.add(bulb2);
  bulbs.push({ light: bulb2, base: L.bulbBack.intensity, phase: Math.random() * 10 });

  const doorFill = new THREE.PointLight(L.doorFill.color, L.doorFill.intensity, L.doorFill.distance, L.doorFill.decay);
  doorFill.position.set(C.door.x + 0.8, 2.2, C.door.z);
  scene.add(doorFill);

  // The only shadow caster: a soft warm key light from above and in front.
  const key = new THREE.DirectionalLight(0xffd2a0, 0.55);
  key.position.set(5, 12, 9);
  if (C.renderer.shadows) {
    key.castShadow = true;
    key.shadow.mapSize.set(C.renderer.shadowMapSize, C.renderer.shadowMapSize);
    const s = key.shadow.camera;
    s.left = -12; s.right = 12; s.top = 12; s.bottom = -12;
    s.near = 1; s.far = 34;
    key.shadow.bias = -0.0016;
  }
  scene.add(key);
}

// ===========================================================================
// Room shell: floor, walls, zinc roof, door
// ===========================================================================

function buildRoom() {
  const R = C.room;
  const room = new THREE.Group();
  room.name = 'room';

  // Dusty ground the whole diorama sits on. In portrait the camera follows the
  // player toward the front wall, so this has to read as ground rather than a
  // black void at the bottom of the screen.
  const outside = part(planeGeo(52, 52),
    mat(0x544435, { emissive: 0x14100b, emissiveIntensity: 1 }), 0, -0.06, 0, { cast: false });
  outside.rotation.x = -Math.PI / 2;
  room.add(outside);

  // Floor — a thick slab for the walls to sit on, plus a tiled top surface.
  const floor = part(boxGeo(R.width + 0.6, 0.4, R.depth + 0.6), mat(0x6f5c48), 0, -0.22, 0,
    { cast: false, receive: true });
  room.add(floor);

  // A step up to the open front of the canteen.
  room.add(part(boxGeo(R.width + 0.6, 0.16, 0.9), mat(0x7a6853), 0, -0.08, R.depth / 2 + 0.45,
    { cast: false, receive: true }));

  const tiles = new THREE.Mesh(
    planeGeo(R.width, R.depth),
    new THREE.MeshLambertMaterial({ map: floorTexture(), flatShading: true }),
  );
  tiles.rotation.x = -Math.PI / 2;
  tiles.position.y = 0.001;
  tiles.receiveShadow = true;
  room.add(tiles);

  // A painted band along the bottom of the walls (buka green, like real ones).
  const skirtH = 0.55;
  const backSkirt = part(boxGeo(R.width, skirtH, 0.1), mat(0x2f6b52), 0, skirtH / 2, -R.depth / 2 + 0.06,
    { cast: false });
  const leftSkirt = part(boxGeo(0.1, skirtH, R.depth), mat(0x2f6b52), -R.width / 2 + 0.06, skirtH / 2, 0,
    { cast: false });
  const rightSkirt = part(boxGeo(0.1, skirtH, R.depth), mat(0x2f6b52), R.width / 2 - 0.06, skirtH / 2, 0,
    { cast: false });
  room.add(backSkirt, leftSkirt, rightSkirt);

  // Walls: full height at the back and both sides, low at the front so the
  // camera can see in. The left wall has a doorway.
  const wallT = 0.28;
  const wallMat = mat(R.wallColor);
  const back = part(boxGeo(R.width + wallT * 2, R.wallHeight, wallT), wallMat, 0, R.wallHeight / 2, -R.depth / 2 - wallT / 2,
    { cast: false, receive: true });
  room.add(back);

  // Right wall (solid).
  room.add(part(boxGeo(wallT, R.wallHeight, R.depth + wallT * 2), wallMat,
    R.width / 2 + wallT / 2, R.wallHeight / 2, 0, { cast: false, receive: true }));

  // Left wall in two pieces, leaving the door gap.
  const D = C.door;
  const gapFront = (R.depth / 2) - (D.z + D.width / 2);
  const gapBack = (D.z - D.width / 2) - (-R.depth / 2);
  const leftWallMat = wallMat;
  // segment towards the front of the room (+z)
  room.add(part(boxGeo(wallT, R.wallHeight, gapFront), leftWallMat,
    -R.width / 2 - wallT / 2, R.wallHeight / 2, (D.z + D.width / 2) + gapFront / 2,
    { cast: false, receive: true }));
  // segment towards the back of the room (-z)
  room.add(part(boxGeo(wallT, R.wallHeight, gapBack), leftWallMat,
    -R.width / 2 - wallT / 2, R.wallHeight / 2, (-R.depth / 2) - gapBack / 2,
    { cast: false, receive: true }));
  // lintel above the door
  const lintelH = R.wallHeight - D.height;
  room.add(part(boxGeo(wallT, lintelH, D.width), leftWallMat,
    -R.width / 2 - wallT / 2, D.height + lintelH / 2, D.z, { cast: false }));

  // Low front wall so the room reads as enclosed.
  room.add(part(boxGeo(R.width + wallT * 2, R.frontWallHeight, wallT), wallMat,
    0, R.frontWallHeight / 2, R.depth / 2 + wallT / 2, { cast: false, receive: true }));

  // Zinc roof. The camera looks down at ~40 degrees, so a roof spanning the
  // room would hide the whole back wall (menu board, poster, TV). Instead the
  // corrugated sheeting sits as an overhang ABOVE and BEHIND the wall line —
  // far enough that the sightline to the wall clears it — plus a fascia beam.
  const roofY = R.wallHeight + 0.35;
  const panelMat = mat(0x9aa0a6);
  for (let i = 0; i < 3; i++) {
    const z = -R.depth / 2 - 0.22 - i * 0.34;
    room.add(part(boxGeo(R.width + 0.9, 0.07, 0.2), panelMat, 0, roofY + (i % 2) * 0.06, z, { cast: false }));
    room.add(part(boxGeo(R.width + 0.9, 0.05, 0.16), mat(0x7d838a), 0, roofY + 0.1, z - 0.17, { cast: false }));
  }
  // fascia along the top of the back wall
  const beamMat = mat(0x7a6a56);
  room.add(part(boxGeo(R.width + 0.9, 0.16, 0.14), beamMat, 0, R.wallHeight + 0.12, -R.depth / 2 - 0.16, { cast: false }));

  buildDoorway(room);

  scene.add(room);
}

function buildDoorway(room) {
  const D = C.door;
  const frameMat = mat(C.room.trimColor);
  // frame posts + head
  room.add(part(boxGeo(0.34, D.height + 0.2, 0.16), frameMat, D.x + 0.02, (D.height + 0.2) / 2, D.z - D.width / 2 - 0.08, { cast: false }));
  room.add(part(boxGeo(0.34, D.height + 0.2, 0.16), frameMat, D.x + 0.02, (D.height + 0.2) / 2, D.z + D.width / 2 + 0.08, { cast: false }));
  room.add(part(boxGeo(0.34, 0.2, D.width + 0.3), frameMat, D.x + 0.02, D.height + 0.1, D.z, { cast: false }));
  // a door panel, standing open against the inside of the wall
  const doorPanel = new THREE.Group();
  const panelW = D.width * 0.62;
  doorPanel.add(part(boxGeo(0.07, D.height - 0.12, panelW), mat(0x8a5a3b),
    0, (D.height - 0.12) / 2, panelW / 2, { cast: false }));
  doorPanel.position.set(D.x + 0.2, 0, D.z + D.width / 2 - 0.06);
  doorPanel.rotation.y = Math.PI - 0.14; // folded back flat against the wall
  room.add(doorPanel);

  // dark "outside" behind the doorway so it doesn't look like a hole
  const outside = part(planeGeo(D.width, D.height),
    mat(0x0d0b0a, { side: THREE.DoubleSide }), D.x + 0.05, D.height / 2, D.z, { cast: false });
  outside.rotation.y = -Math.PI / 2;
  room.add(outside);

  world.door = new THREE.Vector3(D.spawnX, 0, D.z);
  world.doorGate = new THREE.Vector3(D.gateX, 0, D.z);
}

// ===========================================================================
// Counter, sign, Mami's spot, stations
// ===========================================================================

function buildCounter() {
  const K = C.counter;
  const g = new THREE.Group();

  const body = part(boxGeo(K.width, K.height, K.depth), mat(K.color), 0, K.height / 2, K.z, { receive: true });
  g.add(body);
  // lighter worktop slab
  g.add(part(boxGeo(K.width + 0.16, 0.1, K.depth + 0.14), mat(K.topColor), 0, K.height + 0.05, K.z));
  // front panel detail: vertical slats
  for (let x = -K.width / 2 + 0.4; x < K.width / 2; x += 0.62) {
    g.add(part(boxGeo(0.08, K.height - 0.25, 0.04), mat(0x7d5f3d), x, K.height / 2 - 0.05, K.z + K.depth / 2 + 0.02, { cast: false }));
  }
  // raised back shelf for the pots (low enough to see Mami over it)
  g.add(part(boxGeo(K.width, 0.35, 0.24), mat(0x8a6a45), 0, K.height + 0.22, K.z - K.depth / 2 + 0.02));

  // Hand-written sign over the counter, carried on two posts off the worktop
  // (nothing hangs from the ceiling in the middle of the room — it would hide
  // the play area from the camera).
  const signMat = new THREE.MeshLambertMaterial({
    map: signTexture(K.signText, { w: 640, h: 180, font: 96 }),
    flatShading: true,
  });
  const sign = new THREE.Mesh(planeGeo(3.6, 1.0), signMat);
  sign.position.set(0, K.signY, K.signZ);
  g.add(sign);
  for (const x of [-1.55, 1.55]) {
    g.add(part(boxGeo(0.07, K.signY - K.height - 0.1, 0.07), mat(0x6b5a44),
      x, (K.signY + K.height + 0.1) / 2 - 0.45, K.signZ, { cast: false }));
  }

  // Back-wall notice board. It carries ONE big readable heading rather than the
  // old six-item price list: fitting six dish names side by side at this camera
  // distance needs a ~10:1 board and the words collide long before that. The
  // dish names live on the counter signs, which are far clearer.
  const rail = new THREE.Mesh(planeGeo(4.4, 0.9),
    new THREE.MeshLambertMaterial({ map: menuRailTexture(), flatShading: true }));
  rail.position.set(-3.4, 3.4, -C.room.depth / 2 + 0.04);
  g.add(rail);

  // Poster, moved right of centre: the HUD's top-left panel covers the
  // back-left corner of the wall at this camera distance.
  const poster = new THREE.Mesh(planeGeo(1.5, 1.25),
    new THREE.MeshLambertMaterial({ map: posterTexture(), flatShading: true }));
  poster.position.set(5.2, 2.6, -C.room.depth / 2 + 0.04);
  g.add(poster);

  // TV sits on the back-right wall (built in buildProps).
  scene.add(g);
  buildPickups(g);
  buildBin(g);
}

// ---------------------------------------------------------------------------
// Pickup points — one per dish, built straight from the CONFIG.dishes table.
// ---------------------------------------------------------------------------

/** The counter prop shown at a pickup point, chosen by dish.prop. */
function buildProp(kind, dish, g, topY) {
  switch (kind) {
    case 'potRice':
    case 'potSoup': {
      const body = kind === 'potRice' ? 0x8f9296 : 0x9aa0a4;
      g.add(part(cylGeo(0.34, 0.38, 0.1, 12), mat(0x3a3a3a), 0, topY + 0.05, 0));
      g.add(part(cylGeo(0.42, 0.38, 0.5, 14), mat(body), 0, topY + 0.35, 0));
      g.add(part(boxGeo(0.08, 0.06, 0.3), mat(0x4a4a4a), -0.44, topY + 0.5, 0, { cast: false }));
      g.add(part(boxGeo(0.08, 0.06, 0.3), mat(0x4a4a4a), 0.44, topY + 0.5, 0, { cast: false }));
      // visible stew, in the dish's own colour
      g.add(part(cylGeo(0.38, 0.38, 0.04, 14),
        mat(dish.color, { emissive: dish.color, emissiveIntensity: 0.2 }),
        0, topY + 0.58, 0, { cast: false }));
      if (kind === 'potSoup') {
        // lumps of pounded yam sitting on top of the soup
        for (const [dx, dz] of [[-0.14, 0.06], [0.1, -0.1], [0.02, 0.16]]) {
          g.add(part(sphGeo(0.13, 6, 5), mat(0xf4efe2), dx, topY + 0.62, dz, { cast: false }));
        }
      }
      return true; // steams
    }
    case 'jug': {
      // a big drink jug: body, shoulder, neck, cap
      g.add(part(cylGeo(0.2, 0.22, 0.44, 10), mat(dish.color, { emissive: dish.color, emissiveIntensity: 0.25 }),
        0, topY + 0.24, 0));
      g.add(part(cylGeo(0.11, 0.2, 0.12, 10), mat(dish.color), 0, topY + 0.5, 0, { cast: false }));
      g.add(part(cylGeo(0.12, 0.12, 0.08, 10), mat(0xf4efe2), 0, topY + 0.58, 0, { cast: false }));
      // handle
      const handle = part(torusGeo(0.12, 0.025, 6, 10), mat(0xf4efe2), 0.2, topY + 0.34, 0, { cast: false });
      handle.rotation.y = Math.PI / 2;
      g.add(handle);
      // a couple of cups beside it
      g.add(part(cylGeo(0.08, 0.06, 0.13, 8), mat(0xe8dcc4), -0.32, topY + 0.07, 0.12, { cast: false }));
      g.add(part(cylGeo(0.08, 0.06, 0.13, 8), mat(0xe8dcc4), -0.32, topY + 0.07, -0.1, { cast: false }));
      return false;
    }
    case 'panRolls': {
      g.add(part(cylGeo(0.3, 0.34, 0.1, 12), mat(0x3a3a3a), 0, topY + 0.05, 0));
      g.add(part(cylGeo(0.5, 0.42, 0.16, 16), mat(0x2f3236), 0, topY + 0.2, 0));
      g.add(part(boxGeo(0.48, 0.06, 0.1), mat(0x1f2124), 0.58, topY + 0.24, 0, { cast: false }));
      for (const [dx, dz] of [[-0.14, 0.08], [0.12, -0.08], [0.02, 0.16]]) {
        g.add(part(cylGeo(0.11, 0.11, 0.16, 8), mat(dish.color), dx, topY + 0.34, dz, { cast: false }));
      }
      // plantain slices leaning on the rim
      for (let k = 0; k < 2; k++) {
        const s = part(cylGeo(0.12, 0.12, 0.04, 10), mat(0xf0c04a), -0.34 + k * 0.06, topY + 0.3, -0.3,
          { cast: false });
        s.rotation.x = 1.1;
        g.add(s);
      }
      return true; // frying, so it steams
    }
    case 'skewers':
    default: {
      // suya: a little grill rack of skewers
      g.add(part(boxGeo(0.7, 0.06, 0.34), mat(0x3a3a3a), 0, topY + 0.06, 0, { cast: false }));
      for (let k = 0; k < 3; k++) {
        const z = -0.16 + k * 0.16;
        g.add(part(boxGeo(0.66, 0.04, 0.04), mat(dish.color), 0, topY + 0.13, z, { cast: false }));
        g.add(part(cylGeo(0.022, 0.022, 0.7, 5), mat(0xc9b184), 0, topY + 0.15, z, { cast: false }));
        // meat lumps along the skewer
        for (let m = -1; m <= 1; m++) {
          g.add(part(boxGeo(0.15, 0.13, 0.14), mat(0x6b3a1c), m * 0.2, topY + 0.17, z, { cast: false }));
        }
      }
      return true;
    }
  }
}

/**
 * Build one labelled pickup point per dish and record it in world.pickups.
 * The sign shows the dish icon AND its name, so there is never any guessing
 * about what walking into a spot will put in your hands.
 */
function buildPickups(counterGroup) {
  const K = C.counter;
  const topY = K.height + 0.1;

  for (const dish of dishList()) {
    const g = new THREE.Group();
    g.position.set(dish.x, 0, K.z);

    const steams = buildProp(dish.prop, dish, g, topY);

    // Sign on the FRONT of the counter: front-facing and low, so nothing in
    // the room (pots, the player, customers) ever covers it. Deliberately big —
    // this is the only thing telling you what walking in here will give you.
    const sign = new THREE.Mesh(planeGeo(C.sign.size[0], C.sign.size[1]),
      new THREE.MeshLambertMaterial({ map: pickupSignTexture(dish, false), flatShading: true, transparent: true }));
    sign.position.set(0, K.height - 0.42, K.depth / 2 + 0.06);
    // The material is transparent, so it lands in the same render list as the
    // order bubbles. Sorting it AFTER them means a customer's bubble can never
    // hide which pickup serves which dish — the signs always win.
    sign.renderOrder = 20;
    g.add(sign);

    // "NEW" badge, shown briefly when this pickup unlocks.
    const badge = new THREE.Mesh(planeGeo(C.sign.badgeSize[0], C.sign.badgeSize[1]),
      new THREE.MeshLambertMaterial({ map: newBadgeTexture(), flatShading: true, transparent: true }));
    badge.position.set(C.sign.size[0] * 0.42, K.height + 0.28, K.depth / 2 + 0.07);
    badge.renderOrder = 21;
    badge.visible = false;
    g.add(badge);

    counterGroup.add(g);

    const pickup = {
      index: world.pickups.length,
      dishId: dish.id,
      name: dish.name,
      short: dish.short,
      icon: dish.icon,
      x: dish.x,
      // Where the player stands to collect.
      z: K.z + K.depth / 2 + 0.15,
      signMesh: sign,
      badgeMesh: badge,
      badgeTime: 0,
      unlocked: dish.unlockAtSeconds <= 0,
      unlockAt: dish.unlockAtSeconds,
      steamAnchor: steams ? new THREE.Vector3(dish.x, topY + 0.75, K.z) : null,
    };
    // Locked pickups start dimmed and say so.
    sign.material.map = pickupSignTexture(dish, pickup.unlocked);
    sign.material.needsUpdate = true;
    world.pickups.push(pickup);
  }
}

/** The bin at the end of the counter: walk into it to bin the top plate. */
function buildBin(counterGroup) {
  const K = C.counter;
  const B = C.bin;
  const topY = K.height + 0.1;
  const g = new THREE.Group();
  g.position.set(B.x, 0, K.z);

  // galvanised bucket with a dark rim and a bin bag
  g.add(part(cylGeo(0.34, 0.28, 0.52, 12), mat(0x7e8890), 0, topY + 0.26, 0));
  g.add(part(torusGeo(0.34, 0.03, 6, 12), mat(0x4a4f55), 0, topY + 0.52, 0, { cast: false }));
  const bag = part(sphGeo(0.3, 8, 6), mat(0x22252a), 0, topY + 0.46, 0, { cast: false });
  bag.scale.set(1, 0.55, 1);
  g.add(bag);

  // A sign so it reads as a bin, not a pot. At the old 1.0x0.50 board "BIN"
  // rendered at ~11.6px; 1.05x0.52 with a 384x192 canvas and the measuring
  // signTexture puts it at ~14.6px on a 1366x768 laptop.
  const sign = new THREE.Mesh(planeGeo(B.signSize[0], B.signSize[1]),
    new THREE.MeshLambertMaterial({ map: signTexture('BIN', { w: 384, h: 192, bg: '#3b3b3b', font: 150, margin: 0.12 }), flatShading: true, transparent: true }));
  sign.position.set(0, K.height - 0.42, K.depth / 2 + 0.04);
  g.add(sign);

  counterGroup.add(g);
  world.bin = { x: B.x, z: B.z, radius: B.radius, cooldown: 0, group: g };
}

// ===========================================================================
// Tables + chairs
// ===========================================================================

function buildTables() {
  const T = C.tables;
  const topMat = mat(T.colors.top);
  const legMat = mat(T.colors.leg);
  const chairMat = mat(T.colors.chair);

  T.x.forEach((x, xi) => {
    T.z.forEach((z, zi) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);

      // round top + central pedestal + foot
      g.add(part(cylGeo(T.radius, T.radius, 0.09, 14), topMat, 0, T.topY, 0));
      g.add(part(cylGeo(0.12, 0.16, T.topY - 0.05, 8), legMat, 0, (T.topY - 0.05) / 2, 0, { cast: false }));
      g.add(part(cylGeo(0.42, 0.46, 0.07, 12), legMat, 0, 0.035, 0, { cast: false }));

      // two plastic chairs, north and south
      [-1, 1].forEach((side) => {
        const chair = new THREE.Group();
        chair.position.set(0, 0, side * T.seatOffsetZ);
        // seat pan
        chair.add(part(boxGeo(0.62, 0.08, 0.58), chairMat, 0, 0.44, 0));
        // back rest, leaning slightly
        const back = part(boxGeo(0.62, 0.5, 0.07), chairMat, 0, 0.72, side * 0.26);
        back.rotation.x = side * 0.12;
        chair.add(back);
        // legs
        for (const [lx, lz] of [[-0.24, -0.22], [0.24, -0.22], [-0.24, 0.22], [0.24, 0.22]]) {
          chair.add(part(boxGeo(0.06, 0.44, 0.06), legMat, lx, 0.22, lz, { cast: false }));
        }
        g.add(chair);

        // Register the seat: where the customer sits and where we deliver to.
        world.seats.push({
          index: world.seats.length,
          x,
          z: z + side * T.seatOffsetZ,
          table: xi * T.z.length + zi,
          side,
        });
      });

      scene.add(g);
      // Collision circle covering the table and its chairs.
      world.colliders.push({ x, z, r: T.collideRadius });
    });
  });
}

// ===========================================================================
// Ceiling fan, TV, clutter
// ===========================================================================

function buildProps() {
  // --- hanging bulbs -------------------------------------------------------
  for (const [x, y, z] of [[-0.4, C.lights.bulb.y, -0.6], [4.6, C.lights.bulbBack.y, -4.4]]) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    // flex
    g.add(part(cylGeo(0.018, 0.018, C.room.wallHeight - y, 5), mat(0x2a2a2a), 0,
      (C.room.wallHeight - y) / 2, 0, { cast: false }));
    // holder + glowing bulb
    g.add(part(cylGeo(0.06, 0.08, 0.1, 8), mat(0x9a9a9a), 0, -0.02, 0, { cast: false }));
    const bulb = part(sphGeo(0.11, 8, 6), mat(0xfff0c0, { emissive: 0xffcf80, emissiveIntensity: 1.5 }),
      0, -0.16, 0, { cast: false });
    g.add(bulb);
    scene.add(g);
  }

  // --- ceiling fan ---------------------------------------------------------
  const fanGroup = new THREE.Group();
  // Sits over the counter's left end. This is the one spot where the fan's
  // silhouette misses the sign, the menu rail and every station card.
  fanGroup.position.set(-3.5, C.room.wallHeight - 0.28, -3.0);
  fanGroup.add(part(cylGeo(0.05, 0.05, 0.36, 6), mat(0x4a4a4a), 0, 0.18, 0, { cast: false }));
  const blades = new THREE.Group();
  blades.position.y = -0.02;
  for (let i = 0; i < 4; i++) {
    const b = part(boxGeo(0.86, 0.03, 0.2), mat(0xa88a63), 0.43, 0, 0);
    b.rotation.z = 0.12;
    const arm = new THREE.Group();
    arm.rotation.y = (i / 4) * Math.PI * 2;
    arm.add(b);
    blades.add(arm);
  }
  blades.add(part(cylGeo(0.1, 0.12, 0.12, 8), mat(0x4a4a4a), 0, 0, 0, { cast: false }));
  fanGroup.add(blades);
  scene.add(fanGroup);
  fan = blades;

  // --- TV on the back wall -------------------------------------------------
  // A small set on a bracket; the screen flickers in update().
  const tvGroup = new THREE.Group();
  tvGroup.position.set(7.0, 2.55, -C.room.depth / 2 + 0.12);
  tvGroup.add(part(boxGeo(1.66, 1.14, 0.16), mat(0x2b2b2b), 0, 0, 0, { cast: false }));
  tvScreen = part(planeGeo(1.44, 0.92), mat(0x2b4a8a, { emissive: 0x2b4a8a, emissiveIntensity: 0.8 }),
    0, 0, 0.09, { cast: false });
  tvGroup.add(tvScreen);
  // little aerial
  tvGroup.add(part(boxGeo(0.03, 0.4, 0.03), mat(0x9a9a9a), 0.35, 0.74, 0, { cast: false }));
  tvGroup.add(part(boxGeo(0.5, 0.03, 0.03), mat(0x9a9a9a), 0.35, 0.92, 0, { cast: false }));
  scene.add(tvGroup);

  // --- shelves on the right wall (otherwise it's a big blank slab) --------
  for (let row = 0; row < 2; row++) {
    const y = 1.5 + row * 0.72;
    const shelf = part(boxGeo(0.34, 0.06, 5.2), mat(C.room.trimColor), C.room.width / 2 - 0.18, y, -0.6,
      { cast: false });
    scene.add(shelf);
    // bottles, tins and a couple of mugs
    for (let i = 0; i < 9; i++) {
      const z = -3.0 + i * 0.58;
      const kind = i % 3;
      const color = [C.dishes.zobo.color, C.dishes.chapman.color, 0x6f9f4f][i % 3];
      // (drink bottles on the wall shelf — just dressing)
      if (kind === 0) {
        scene.add(part(cylGeo(0.07, 0.08, 0.28, 7), mat(color), C.room.width / 2 - 0.2, y + 0.17, z, { cast: false }));
        scene.add(part(cylGeo(0.035, 0.05, 0.1, 6), mat(color), C.room.width / 2 - 0.2, y + 0.36, z, { cast: false }));
      } else if (kind === 1) {
        scene.add(part(cylGeo(0.09, 0.09, 0.2, 8), mat(0xd8c9a8), C.room.width / 2 - 0.2, y + 0.13, z, { cast: false }));
        scene.add(part(cylGeo(0.09, 0.09, 0.015, 8), mat(color), C.room.width / 2 - 0.2, y + 0.235, z, { cast: false }));
      } else {
        scene.add(part(cylGeo(0.08, 0.07, 0.16, 8), mat(0xf4efe2), C.room.width / 2 - 0.2, y + 0.11, z, { cast: false }));
      }
    }
  }

  // --- a couple of crates + water jerrycans behind the counter --------------
  for (let i = 0; i < 3; i++) {
    scene.add(part(boxGeo(0.5, 0.34, 0.5), mat(0x3f6f8f), -6.4 + i * 0.0, 0.17, -5.6 + i * 0.42, { cast: false }));
  }
  scene.add(part(boxGeo(0.44, 0.62, 0.44), mat(0x3d8fbf), 3.6, 0.31, -5.65, { cast: false }));
  scene.add(part(boxGeo(0.44, 0.62, 0.44), mat(0x3d8fbf), 4.15, 0.31, -5.65, { cast: false }));

  // --- one stool tucked into the LEFT counter corner for the "quick eat"
  // crowd. Nothing on the right: the bin lives there and needs a clear
  // approach (a collider here would wall the player off from it).
  {
    const x = -7.0;
    const g = new THREE.Group();
    g.position.set(x, 0, -4.3);
    g.add(part(cylGeo(0.24, 0.26, 0.08, 10), mat(C.tables.colors.chair), 0, 0.62, 0));
    g.add(part(cylGeo(0.07, 0.07, 0.6, 6), mat(C.tables.colors.leg), 0, 0.3, 0, { cast: false }));
    g.add(part(cylGeo(0.2, 0.22, 0.05, 10), mat(C.tables.colors.leg), 0, 0.025, 0, { cast: false }));
    scene.add(g);
    world.colliders.push({ x, z: -4.3, r: 0.36 });
  }
}

// ===========================================================================
// Steam
// ===========================================================================

/** Start the steam plumes above whichever pickup points cook something hot. */
export function initSteam() {
  const count = C.feel.steamPuffs;
  world.pickups.forEach((st) => {
    if (!st.steamAnchor) return; // cold drinks, no steam
    for (let i = 0; i < count; i++) {
      // Each puff needs its OWN material: opacity is animated per puff, and a
      // cached material would be shared by all of them.
      const puffMat = new THREE.MeshLambertMaterial({
        color: 0xfff8ee,
        emissive: 0x6b5a48,
        emissiveIntensity: 0.9,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const m = new THREE.Mesh(sphGeo(0.09, 6, 5), puffMat);
      m.position.copy(st.steamAnchor);
      m.userData.puff = {
        anchor: st.steamAnchor,
        t: (i / count + Math.random() * 0.15) % 1,
        speed: 0.55 + Math.random() * 0.4,
        drift: (Math.random() - 0.5) * 0.35,
        grow: 0.9 + Math.random() * 0.7,
      };
      steamPuffs.push(m);
      scene.add(m);
    }
  });
}

// ===========================================================================
// Per-frame update
// ===========================================================================

/**
 * Unlock pickup points as the round goes on and retire their NEW badges.
 * @param {number} elapsed seconds into the round
 * @returns {Array<object>} pickups that unlocked on this frame
 */
export function updatePickupUnlocks(elapsed) {
  const fresh = [];
  for (const p of world.pickups) {
    if (!p.unlocked && elapsed >= p.unlockAt) {
      p.unlocked = true;
      p.signMesh.material.map = pickupSignTexture(C.dishes[p.dishId], true);
      p.signMesh.material.needsUpdate = true;
      p.badgeTime = C.newBadgeSeconds;
      p.badgeMesh.visible = true;
      // light the prop up so the unlock is obvious across the room
      p.signMesh.material.emissive = new THREE.Color(C.dishes[p.dishId].color);
      p.signMesh.material.emissiveIntensity = 0.28;
      fresh.push(p);
    } else if (p.badgeTime > 0) {
      p.badgeTime -= 1 / 60;
      if (p.badgeTime <= 0) p.badgeMesh.visible = false;
    }
  }
  return fresh;
}

/** Reset every pickup back to its locked/unlocked starting state. */
export function resetPickups() {
  for (const p of world.pickups) {
    const dish = C.dishes[p.dishId];
    p.unlocked = dish.unlockAtSeconds <= 0;
    p.badgeTime = 0;
    p.badgeMesh.visible = false;
    p.signMesh.material.map = pickupSignTexture(dish, p.unlocked);
    p.signMesh.material.emissive.setHex(0x000000);
    p.signMesh.material.emissiveIntensity = 1;
    p.signMesh.material.needsUpdate = true;
  }
}

/**
 * Animate the room: fan, TV, bulbs, steam, camera shake, title orbit.
 * @param {number} dt
 * @param {number} elapsed
 * @param {boolean} orbiting  slow drift on the title / game-over screens
 * @param {THREE.Vector3|null} follow  player position, portrait only
 */
export function update(dt, elapsed, orbiting = false, follow = null) {
  // fan
  if (fan) fan.rotation.y += dt * 9;

  // TV: jump between football clips (colour + brightness flicker)
  if (tvScreen) {
    tvTimer -= dt;
    if (tvTimer <= 0) {
      tvTimer = 0.12 + Math.random() * 0.5;
      const hue = Math.random();
      const c = new THREE.Color().setHSL(hue, 0.55, 0.4);
      tvScreen.material.color.copy(c);
      tvScreen.material.emissive.copy(c);
      tvScreen.material.emissiveIntensity = 0.5 + Math.random() * 0.9;
    }
  }

  // bulb flicker — tiny, warm, alive
  for (const b of bulbs) {
    const f = 1 + C.lights.bulbFlicker * Math.sin(elapsed * 9 + b.phase) * Math.sin(elapsed * 3.3 + b.phase * 2);
    b.light.intensity = b.base * f;
  }

  // steam
  for (const p of steamPuffs) {
    const d = p.userData.puff;
    d.t += dt * d.speed * 0.55;
    if (d.t > 1) d.t -= 1;
    const rise = d.t * C.feel.steamRise * 1.6;
    p.position.set(
      d.anchor.x + Math.sin(d.t * 4 + d.drift) * 0.12 + d.drift * d.t,
      d.anchor.y + rise,
      d.anchor.z + Math.cos(d.t * 3 + d.drift) * 0.1,
    );
    const s = 0.4 + d.t * 1.1 * d.grow;
    p.scale.setScalar(s);
    // fade in then out
    p.material.opacity = Math.sin(d.t * Math.PI) * 0.5;
  }

  // camera
  if (orbiting) titleOrbit += dt * C.camera.titleOrbitSpeed;
  const ox = orbiting ? Math.sin(titleOrbit) * 2.6 : 0;
  const oz = orbiting ? Math.cos(titleOrbit * 0.7) * 1.2 : 0;

  // Portrait: slide the camera along with the player so the room stays legible.
  if (portrait) {
    const off = C.camera.portraitOffset;
    if (follow && !orbiting) {
      const L = C.camera.followLimits;
      followSmooth.lerp(follow, Math.min(1, dt * 4));
      baseCamTarget.set(
        Math.max(-L.x, Math.min(L.x, followSmooth.x)),
        0.9,
        Math.max(-L.z, Math.min(L.z, followSmooth.z + C.camera.portraitLookAhead)),
      );
      baseCamPos.set(baseCamTarget.x + off[0], off[1], baseCamTarget.z + off[2]);
    } else {
      // Title / game over: a high, centred look at the whole counter.
      baseCamTarget.set(0, 1.1, -1.2);
      baseCamPos.set(0, 15.5, 14.5);
    }
  }

  if (shakeAmount > 0.0001) {
    shakeAmount = Math.max(0, shakeAmount - dt * C.camera.shakeDecay * (0.4 + shakeAmount));
    const s = shakeAmount * 0.34;
    camera.position.set(
      baseCamPos.x + ox + (Math.random() - 0.5) * s,
      baseCamPos.y + (Math.random() - 0.5) * s,
      baseCamPos.z + oz + (Math.random() - 0.5) * s,
    );
  } else {
    camera.position.set(baseCamPos.x + ox, baseCamPos.y, baseCamPos.z + oz);
  }
  camera.lookAt(baseCamTarget);
}

// ===========================================================================
// Cleanup
// ===========================================================================

/**
 * Dispose every geometry/material under `root` EXCEPT the shared caches.
 * Returns the number of freed resources (handy for the console).
 */
export function disposeAll(root) {
  let freed = 0;
  root.traverse((o) => {
    if (o.geometry && !o.geometry.userData.cached) {
      o.geometry.dispose();
      freed++;
    }
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) {
      if (!m.userData.cached) {
        if (m.map && m.map.userData && m.map.userData.cached) m.map.dispose();
        m.dispose();
        freed++;
      }
    }
  });
  root.removeFromParent();
  return freed;
}

export { steamPuffs };