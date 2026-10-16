// ---------------------------------------------------------------------------
// scene.js — three.js renderer, camera, lights, and the whole physical room.
//
// Everything is built from primitives. Geometries and materials are cached and
// shared (tagged `userData.cached`) so a full room + a dozen customers stays
// cheap, and so disposeAll() can free the rest without touching the cache.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { CONFIG } from './config.js';

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

/** Draw into a canvas and wrap it as a texture. */
export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.userData.cached = true;
  return tex;
}

/** Wooden board with hand-written text on it. */
function signTexture(text, {
  w = 512, h = 160, bg = '#1d6b4a', ink = '#fdf3d8', font = 64, sub = '',
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
    ctx.font = `${font}px "Comic Sans MS", "Segoe Print", "Bradley Hand", cursive`;
    ctx.fillText(text, w / 2, sub ? h / 2 - 16 : h / 2);
    if (sub) {
      ctx.font = `${Math.round(font * 0.34)}px "Comic Sans MS", "Segoe Print", cursive`;
      ctx.fillText(sub, w / 2, h / 2 + 30);
    }
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

/** The hand-written menu rail painted along the top of the back wall. */
function menuRailTexture() {
  const items = ['JOLLOF', 'EGUSI + YAM', 'MOI MOI', 'SUYA', 'ZOBO', 'CHAPMAN'];
  return canvasTexture(1024, 128, (ctx, w, h) => {
    ctx.fillStyle = '#1d6b4a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 8; y < h; y += 16) ctx.fillRect(0, y, w, 2);
    ctx.strokeStyle = '#fdf3d8';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#fdf3d8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cw = w / items.length;
    items.forEach((name, i) => {
      ctx.font = `${i === 1 ? 30 : 36}px "Comic Sans MS", "Segoe Print", cursive`;
      ctx.fillText(name, cw * (i + 0.5), h / 2 - 8);
      ctx.font = '26px "Comic Sans MS", "Segoe Print", cursive';
      ctx.fillText(['300', '400', '200', '350', '150', '150'][i], cw * (i + 0.5), h / 2 + 30);
      if (i < items.length - 1) {
        ctx.fillRect(cw * (i + 1) - 1, 20, 2, h - 40);
      }
    });
  });
}

/** A faded poster for the wall. */
function posterTexture() {
  return canvasTexture(256, 384, (ctx, w, h) => {
    ctx.fillStyle = '#f3e3c3';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c2452f';
    ctx.fillRect(0, 0, w, 96);
    ctx.fillStyle = '#fdf6e3';
    ctx.font = 'bold 44px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BUJA', w / 2, 46);
    ctx.font = '28px "Segoe UI", sans-serif';
    ctx.fillText('FOOD', w / 2, 82);
    // a big orange sun + a bowl, drawn with circles
    ctx.fillStyle = '#e8913a';
    ctx.beginPath();
    ctx.arc(w / 2, 200, 74, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a4a2a';
    ctx.beginPath();
    ctx.ellipse(w / 2, 260, 92, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a3018';
    ctx.font = '26px "Segoe UI", sans-serif';
    ctx.fillText('EAT WELL', w / 2, 336);
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
  stations: [],     // station anchors, see buildStations()
  colliders: [],    // { x, z, r } circles the player slides around
  door: null,       // where customers appear, outside the door
  doorGate: null,   // just inside the doorway
  mamiAnchor: null,
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

  // Dark ground the whole diorama sits on, so the room doesn't float in a void.
  const outside = part(planeGeo(52, 52), mat(0x2b2219), 0, -0.06, 0, { cast: false });
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
    map: signTexture(K.signText, { w: 640, h: 160, sub: 'FOOD · CHILLS · Jollof daily', font: 74 }),
    flatShading: true,
  });
  const sign = new THREE.Mesh(planeGeo(3.6, 0.9), signMat);
  sign.position.set(0, K.signY, K.signZ);
  g.add(sign);
  for (const x of [-1.55, 1.55]) {
    g.add(part(boxGeo(0.07, K.signY - K.height - 0.1, 0.07), mat(0x6b5a44),
      x, (K.signY + K.height + 0.1) / 2 - 0.45, K.signZ, { cast: false }));
  }

  // Hand-painted menu rail high on the back wall. Only a band of wall stays
  // visible from this camera, so the menu is a wide rail, not a tall board.
  const rail = new THREE.Mesh(planeGeo(6.0, 0.62),
    new THREE.MeshLambertMaterial({ map: menuRailTexture(), flatShading: true }));
  rail.position.set(0, 3.45, -C.room.depth / 2 + 0.04);
  g.add(rail);

  // Small poster tucked into the back-left corner.
  const poster = new THREE.Mesh(planeGeo(0.75, 1.15),
    new THREE.MeshLambertMaterial({ map: posterTexture(), flatShading: true }));
  poster.position.set(-7.0, 2.6, -C.room.depth / 2 + 0.04);
  g.add(poster);

  // TV sits on the back-right wall (built in buildProps).
  scene.add(g);
  buildStations(g);
}

/** The four food stations sitting on the counter. */
function buildStations(counterGroup) {
  const K = C.counter;
  const topY = K.height + 0.1;

  C.stations.forEach((cfg, i) => {
    const g = new THREE.Group();
    g.position.set(cfg.x, 0, K.z);

    if (cfg.id === 'stove' || cfg.id === 'soup') {
      // gas ring + big pot
      g.add(part(cylGeo(0.34, 0.38, 0.1, 12), mat(0x3a3a3a), 0, topY + 0.05, 0));
      const pot = part(cylGeo(0.42, 0.38, 0.5, 14), mat(cfg.id === 'stove' ? 0x8f9296 : 0x9aa0a4),
        0, topY + 0.35, 0);
      g.add(pot);
      // handles
      g.add(part(boxGeo(0.08, 0.06, 0.3), mat(0x4a4a4a), -0.44, topY + 0.5, 0, { cast: false }));
      g.add(part(boxGeo(0.08, 0.06, 0.3), mat(0x4a4a4a), 0.44, topY + 0.5, 0, { cast: false }));
      // visible stew at the top
      const stewColor = cfg.id === 'stove' ? C.dishes['jollof'].color : 0x8a6a3e;
      g.add(part(cylGeo(0.38, 0.38, 0.04, 14), mat(stewColor, { emissive: stewColor, emissiveIntensity: 0.15 }),
        0, topY + 0.58, 0, { cast: false }));
    } else if (cfg.id === 'pan') {
      // frying pan on a ring: moi moi + plantain slices + suya skewers
      g.add(part(cylGeo(0.3, 0.34, 0.1, 12), mat(0x3a3a3a), 0, topY + 0.05, 0));
      g.add(part(cylGeo(0.52, 0.44, 0.16, 16), mat(0x2f3236), 0, topY + 0.2, 0));
      g.add(part(boxGeo(0.5, 0.06, 0.1), mat(0x1f2124), 0.62, topY + 0.24, 0, { cast: false }));
      // moi moi rolls
      const moiColor = C.dishes['moi moi'].color;
      for (const [dx, dz] of [[-0.12, 0.08], [0.12, -0.08], [0.02, 0.14]]) {
        g.add(part(cylGeo(0.11, 0.11, 0.16, 8), mat(moiColor), dx, topY + 0.34, dz, { cast: false }));
      }
      // plantain slices (yellow discs leaning on the rim)
      for (let k = 0; k < 3; k++) {
        const s = part(cylGeo(0.13, 0.13, 0.04, 10), mat(0xf0c04a), -0.3 + k * 0.02, topY + 0.3, -0.34 + k * 0.06,
          { cast: false });
        s.rotation.x = 1.1;
        s.rotation.z = 0.3;
        g.add(s);
      }
      // suya skewers
      for (let k = 0; k < 2; k++) {
        const sk = part(boxGeo(0.05, 0.05, 0.72), mat(0xc9b184), 0.3 + k * 0.12, topY + 0.32, 0.1, { cast: false });
        sk.rotation.y = 0.4 + k * 0.2;
        sk.rotation.x = -0.25;
        g.add(sk);
        g.add(part(boxGeo(0.16, 0.14, 0.2), mat(C.dishes.suya.color), 0.3 + k * 0.12, topY + 0.34, 0.02, { cast: false }));
      }
    } else {
      // drinks cooler: glass-front cabinet with bottles
      const cool = part(boxGeo(1.3, 1.15, 0.6), mat(0x6f7b80), 0, topY + 0.58, -0.1);
      g.add(cool);
      g.add(part(boxGeo(1.36, 0.1, 0.66), mat(0x3f4a4f), 0, topY + 1.18, -0.1, { cast: false }));
      // glass front
      g.add(part(boxGeo(1.1, 0.85, 0.05),
        mat(0xa8d8e8, { transparent: true, opacity: 0.35, depthWrite: false }),
        0, topY + 0.6, -0.1 + 0.31, { cast: false }));
      // bottles behind the glass
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 5; c++) {
          const bx = -0.44 + c * 0.22;
          const by = topY + 0.3 + r * 0.44;
          const bottleColor = (c + r) % 2 === 0 ? C.dishes.zobo.color : C.dishes.chapman.color;
          g.add(part(cylGeo(0.075, 0.08, 0.26, 8), mat(bottleColor, { transparent: true, opacity: 0.9 }),
            bx, by, -0.1, { cast: false }));
        }
      }
    }

    // A little card on the FRONT of the counter showing what this station is
    // offering right now. Front-facing and low, so nothing in the room (pots,
    // the player, customers) ever covers it.
    const labelMat = new THREE.MeshLambertMaterial({
      map: signTexture(cfg.name.toUpperCase(), { w: 512, h: 128, bg: '#5a2f22', font: 52 }),
      flatShading: true,
      transparent: true,
    });
    const label = new THREE.Mesh(planeGeo(1.7, 0.36), labelMat);
    label.position.set(0, K.height - 0.34, K.depth / 2 + 0.04);
    g.add(label);

    counterGroup.add(g);

    // Where the player stands to collect, and how the dish shows up.
    world.stations.push({
      index: i,
      id: cfg.id,
      name: cfg.name,
      x: cfg.x,
      z: K.z + K.depth / 2 + 0.15,
      dishes: cfg.dishes.slice(),
      select: 0,
      labelMesh: label,
      steamAnchor: new THREE.Vector3(cfg.x, topY + 0.75, K.z),
    });
  });
}

/** Tell the station label which dish is currently selected. */
export function setStationSelection(station, dishId) {
  const dish = C.dishes[dishId];
  station.labelMesh.material.map = signTexture(dish.label.toUpperCase(), {
    w: 512, h: 128, bg: '#5a2f22', font: 52,
  });
  station.labelMesh.material.needsUpdate = true;
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

  // --- stools tucked into the counter corners for the "quick eat" crowd ----
  for (const x of [-7.0, 7.0]) {
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

/** Start the steam plumes above the pots and the pan. */
export function initSteam() {
  const count = C.feel.steamPuffs;
  world.stations.forEach((st) => {
    if (st.id === 'cooler') return; // cold drinks, no steam
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