// ---------------------------------------------------------------------------
// main.js — start-up, input, the game loop and screen switching.
//
// Wiring order: scene → characters → UI/audio → customer system → loop.
// Everything tunable lives in config.js; every rule lives in game.js.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { getCurrentUser, onUserChange, setGuestStyle } from './platform.js';
import { initScene, initSteam, render, update as updateScene, resize, world, shake, setCameraPose, setStationSelection, disposeAll, cylGeo, mat } from './scene.js';
import { buildCharacter, randomStyle } from './character.js';
import { createCustomerSystem, buildPlate } from './customers.js';
import { initUI } from './ui.js';
import * as audio from './audio.js';
import { game, STATE, startRound, tick, difficulty, serveValue, addCoins, addServed, loseLife, onGameOverHook } from './game.js';

// Read ?test=1 from the URL and enable test mode
const urlParams = new URLSearchParams(window.location.search);
CONFIG.testMode = urlParams.get('test') === '1';

const C = CONFIG;

// ===========================================================================
// Boot
// ===========================================================================

const canvas = document.getElementById('game');
const view = initScene(canvas);
const scene = view.scene;
initSteam();
resize();

/** Everything that belongs to one round gets parented here so restart is clean. */
const roundRoot = new THREE.Group();
scene.add(roundRoot);

// --- Mami, the owner, standing behind her counter -------------------------
const mami = buildCharacter({
  body: 'female',
  primaryColor: '#1d6b4a',
  secondaryColor: '#f2b134',
  skinColor: '#7a4a22',
  hairColor: '#241812',
  hair: 'braids',
  hat: 'none',
  accessory: 'earrings',
});
mami.group.position.set(C.mami.x, 0, C.mami.z);
mami.setFacing(C.mami.turn);
scene.add(mami.group);

// ===========================================================================
// Player + carry stack
// ===========================================================================

let player = null;

/** A soft marker on the floor so you never lose yourself in a busy room. */
const playerRing = new THREE.Mesh(
  new THREE.RingGeometry(0.36, 0.5, 20),
  new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
);
playerRing.rotation.x = -Math.PI / 2;
playerRing.position.y = 0.02;
roundRoot.add(playerRing);

/** The stack of plates. Lives in the world, not inside the character, so it
 *  can sway independently of the walk animation. */
const carryRoot = new THREE.Group();
roundRoot.add(carryRoot);
let carry = [];       // dish ids, bottom first
let facing = 0;

function makePlayer(style) {
  if (player) {
    carryRoot.remove(player.group);
    player.dispose();
  }
  player = buildCharacter(style);
  player.group.position.set(world.playerSpawn.x, 0, world.playerSpawn.z);
  roundRoot.add(player.group);
  carryRoot.position.copy(player.group.position);
  carryRoot.position.y = C.player.carryHeight;
  facing = Math.PI;
  player.setFacing(facing);
}

makePlayer(getCurrentUser().style);

// start.ng (or the title screen shuffle) can change the look mid-session
onUserChange((user) => {
  makePlayer(user.style);
});

// ===========================================================================
// Effects: coin pops and floating +N text
// ===========================================================================

const effects = [];
const coinTexCache = new Map();

/** Small canvas texture for "+12" style floating text. */
function numberTexture(n) {
  const key = String(n);
  let tex = coinTexCache.get(key);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 80;
  const ctx = c.getContext('2d');
  ctx.font = '900 52px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.strokeText(`+${n}`, 80, 42);
  ctx.fillStyle = '#f2b134';
  ctx.fillText(`+${n}`, 80, 42);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.cached = true;
  coinTexCache.set(key, tex);
  return tex;
}

/** Coins fly out of the customer and a +N floats up. */
function popCoins(x, y, z, amount) {
  const group = new THREE.Group();
  group.position.set(x, y, z);

  for (let i = 0; i < Math.min(6, 2 + Math.round(amount / 4)); i++) {
    const coin = new THREE.Mesh(cylGeo(0.075, 0.075, 0.02, 10), mat(0xf2c93c, {
      emissive: 0x6b4a00, emissiveIntensity: 0.7,
    }));
    coin.castShadow = true;
    coin.position.set((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3);
    group.add(coin);
  }

  const text = new THREE.Sprite(new THREE.SpriteMaterial({
    map: numberTexture(amount), transparent: true, depthWrite: false, depthTest: false,
  }));
  text.scale.set(0.9, 0.45, 1);
  group.add(text);

  roundRoot.add(group);
  effects.push({
    obj: group,
    life: C.game.coinPopLife,
    max: C.game.coinPopLife,
    coins: group.children.slice(0, -1),
    text,
  });
}

function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.life -= dt;
    const t = 1 - Math.max(0, e.life) / e.max; // 0 -> 1
    for (const coin of e.coins) {
      coin.rotation.y += dt * 14;
      coin.position.y += (1.6 - t * 2.4) * dt * 3;
      coin.scale.setScalar(Math.max(0, 1 - t * 0.6));
    }
    e.text.position.y = 0.4 + t * 1.1;
    e.text.scale.set(0.9 * (1 + t * 0.25), 0.45 * (1 + t * 0.25), 1);
    if (e.life <= 0) {
      disposeAll(e.obj);
      effects.splice(i, 1);
    }
  }
}

// ===========================================================================
// UI + audio
// ===========================================================================

let ui = null;

const uiReady = () => ui;

ui = initUI({
  onPlay() {
    audio.start();
    audio.sfx.click();
    beginRound();
  },
  onShuffle() {
    audio.start();
    audio.sfx.click();
    setGuestStyle(randomStyle());
  },
  onRestart() {
    audio.start();
    audio.sfx.click();
    ui.hideGameOver();
    beginRound();
  },
  onMute() {
    audio.start();
    return audio.toggleMute();
  },
});

ui.setBest(game.best);
ui.setMuteIcon(audio.isMuted());

onGameOverHook((summary) => {
  ui.showHud(false);
  ui.showGameOver(summary);
  audio.sfx.gameOver();
});

// ===========================================================================
// Customers
// ===========================================================================

// Customers. Off the clock (title / game over) they use a calm difficulty so
// the room stays alive without anyone storming out over the title screen.
const CALM = { spawn: 5.5, patience: 99999, order: 1, speed: 1.1, maxActive: 4, level: 1 };
const customers = createCustomerSystem({
  scene: roundRoot,
  difficulty: () => (game.state === STATE.PLAYING ? difficulty() : CALM),
  callbacks: {
    onArrive() {
      audio.sfx.arrive();
    },
    onServe(result) {
      const value = serveValue(result.dish,
        result.customer.order.length - result.customer.orderIndex, result.fraction);
      addCoins(value);
      addServed();
      audio.sfx.serve();
      setTimeout(() => audio.sfx.coin(), 90);
      popCoins(result.customer.group.position.x, 1.5, result.customer.group.position.z, value);
      ui.toast(`+${value}`, 'coin');
      shake(C.feel.shakeOnServe);
    },
    onWrong() {
      audio.sfx.wrong();
      ui.toast('WRONG DISH!', 'bad');
    },
    onLoseLife() {
      audio.sfx.angry();
      if (game.state !== STATE.PLAYING) return; // off the clock: harmless
      setTimeout(() => audio.sfx.loseLife(), 320);
      shake(C.feel.shakeOnStormOut);
      if (!loseLife()) ui.toast('WALKED OUT!', 'bad');
    },
    onLeave() {
      // happy customer — the coins were already paid
    },
  },
});

// ===========================================================================
// Input
// ===========================================================================

const keys = new Set();
const MOVE_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    audio.start();
    if (game.state === STATE.PLAYING) cycleStation();
    return;
  }
  if (MOVE_KEYS.has(e.code)) {
    e.preventDefault();
    keys.add(e.code);
    audio.start();
  }
});

window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

/** Combined movement vector: keyboard OR joystick. */
function moveVector() {
  let x = 0;
  let y = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;

  if (x === 0 && y === 0 && uiReady()) {
    x = ui.joystick.x;
    y = ui.joystick.y;
  }

  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  return { x, y };
}

// ===========================================================================
// Round control
// ===========================================================================

function beginRound() {
  // clear the room of the previous round
  for (const e of effects) disposeAll(e.obj);
  effects.length = 0;
  customers.reset();
  clearCarry();
  startRound();
  player.group.position.set(world.playerSpawn.x, 0, world.playerSpawn.z);
  player.group.rotation.set(0, 0, 0);
  velocity.set(0, 0, 0);
  carryRoot.visible = true;
  setCameraPose(C.camera.position, C.camera.target);
  ui.showTitle(false);
  ui.hideGameOver();
  ui.showHud(true);
  ui.updateHUD({ coins: 0, served: 0, lives: game.lives, level: 1 });
  ui.setCarry([]);
}

function clearCarry() {
  for (const plate of carry) carryRoot.remove(plate);
  carry = [];
  ui.setCarry([]);
}

/** Push the plate on top of the stack onto a customer. */
function popTopPlate() {
  const plate = carry.pop();
  if (plate) carryRoot.remove(plate);
  ui.setCarry(carry.map((p) => p.userData.dish));
}

// ===========================================================================
// Player movement + collision
// ===========================================================================

const velocity = new THREE.Vector3();
const desired = new THREE.Vector3();

/** Circle vs circles, then clamp to the room. Push the player out. */
function resolveCollisions(pos) {
  const B = C.room.bounds;
  const R = C.player.radius;
  pos.x = Math.min(B.maxX, Math.max(B.minX, pos.x));
  pos.z = Math.min(B.maxZ, Math.max(B.minZ, pos.z));
  for (let pass = 0; pass < 2; pass++) {
    for (const c of world.colliders) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const min = c.r + R;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min) {
        const d = Math.sqrt(d2);
        if (d > 0.0001) {
          pos.x = c.x + (dx / d) * min;
          pos.z = c.z + (dz / d) * min;
        } else {
          pos.x = c.x + min; // dead centre: shove them out sideways
        }
      }
    }
  }
}

function movePlayer(dt) {
  const input = moveVector();
  desired.set(input.x, 0, input.y);
  const wants = desired.lengthSq() > 0.0001;

  if (wants) {
    desired.normalize().multiplyScalar(C.player.maxSpeed);
    velocity.x += (desired.x - velocity.x) * Math.min(1, dt * C.player.acceleration);
    velocity.z += (desired.z - velocity.z) * Math.min(1, dt * C.player.acceleration);
  } else {
    const f = Math.max(0, 1 - dt * C.player.friction);
    velocity.x *= f;
    velocity.z *= f;
  }

  const pos = player.group.position;
  pos.x += velocity.x * dt;
  pos.z += velocity.z * dt;
  resolveCollisions(pos);

  const speed = velocity.length();
  const speed01 = Math.min(1, speed / C.player.maxSpeed);
  if (speed > 0.2) {
    const target = Math.atan2(velocity.x, velocity.z);
    let d = target - facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    facing += d * Math.min(1, dt * C.player.turnSpeed);
  }
  player.setFacing(facing);
  player.update(dt, speed01, C.player.walkCycle);

  playerRing.position.x = pos.x;
  playerRing.position.z = pos.z;
  playerRing.scale.setScalar(1 + Math.sin(elapsed * 4) * 0.04);

  // the stack follows the player's chest, leaning when running
  carryRoot.position.set(pos.x, C.player.carryHeight, pos.z);
  carryRoot.rotation.y = facing;
  const sway = Math.sin(performance.now() * 0.012) * C.player.carryTilt * speed01;
  carryRoot.rotation.z = sway;
  carryRoot.rotation.x = -C.player.carryTilt * speed01 * 0.6 + (carry.length > 1 ? -0.06 : 0);
  carryRoot.visible = carry.length > 0;
}

// ===========================================================================
// Stations
// ===========================================================================

/** The station the player is standing at, if any. */
function nearbyStation() {
  const p = player.group.position;
  if (p.z > -3.1) return null; // too far from the counter
  let best = null;
  let bestD = Infinity;
  for (const st of world.stations) {
    const d = Math.abs(p.x - st.x);
    if (d < C.pickupRadius && d < bestD) {
      bestD = d;
      best = st;
    }
  }
  return best;
}

let lastStation = null;

/** Space / tap: switch which dish the multi-dish station is offering. */
function cycleStation() {
  const st = nearbyStation();
  if (!st || st.dishes.length < 2) return;
  st.select = (st.select + 1) % st.dishes.length;
  setStationSelection(st, st.dishes[st.select]);
  audio.sfx.cycle();
  ui.setHint(`<b>${st.name}</b> now gives <b>${C.dishes[st.dishes[st.select]].label}</b>`);
}

function updateStations() {
  const st = nearbyStation();
  if (st !== lastStation) {
    lastStation = st;
    if (st) {
      // set the label to match the selection (also fixes the initial label)
      setStationSelection(st, st.dishes[st.select]);
      // walking into a station puts that dish in your hands
      if (carry.length < C.player.carryLimit) {
        takeDish(st.dishes[st.select]);
      }
    }
  }
}

/** Add a plate to the top of the stack. */
function takeDish(dishId) {
  if (carry.length >= C.player.carryLimit) return false;
  const plate = buildPlate(dishId);
  // +z is the direction the character faces, so plates sit in front of the
  // chest, not inside the body.
  plate.position.set(0, carry.length * C.player.carrySpacing, C.player.carryOffset);
  carryRoot.add(plate);
  carry.push(plate);
  ui.setCarry(carry.map((p) => p.userData.dish));
  player.squash();          // squash & stretch
  audio.sfx.pickup();
  if (carry.length > 1) audio.sfx.stack();
  return true;
}

// ===========================================================================
// Contextual hint
// ===========================================================================

let lastHint = '';
function updateHint() {
  const st = nearbyStation();
  if (st && carry.length < C.player.carryLimit) {
    const dish = C.dishes[st.dishes[st.select]].label;
    const extra = st.dishes.length > 1 ? ' · <b>Space</b> to switch' : '';
    setHint(`<b>${st.name}</b> → ${dish}${extra}`);
    return;
  }
  if (carry.length >= C.player.carryLimit) {
    const top = C.dishes[carry[carry.length - 1].userData.dish].label;
    setHint(`Carrying ${carry.length}/${C.player.carryLimit} — top: <b>${top}</b>`);
    return;
  }
  const near = customers.customerInReach(player.group.position);
  if (near) {
    const need = C.dishes[near.order[near.orderIndex]];
    const count = near.order.length - near.orderIndex;
    setHint(`They want <b>${need.label}</b>${count > 1 ? ` ×${count}` : ''}`);
    return;
  }
  setHint('');
}

function setHint(html) {
  if (html === lastHint) return;
  lastHint = html;
  ui.setHint(html);
}

// ===========================================================================
// Pause when the tab is hidden
// ===========================================================================

let paused = false;
let wasPlayingBeforePause = false;

document.addEventListener('visibilitychange', () => {
  paused = document.hidden;
  ui.setPaused(paused);
  if (!paused) lastFrameTime = performance.now();
});

// ===========================================================================
// Game loop
// ===========================================================================

let lastFrameTime = performance.now();
let hudTimer = 0;
let elapsed = 0;

// --- frame rate tracking ---------------------------------------------------
// Rolling average over the last ~30 frames, plus the worst frame seen, so a
// stutter during the opening seconds can't hide inside a long average.
let lastFps = 0;
let fpsAccum = 0;
let fpsFrames = 0;
let fpsWindowStart = performance.now();

function trackFps(now) {
  fpsAccum += now - (fpsWindowStart || now);
  fpsFrames++;
  if (fpsAccum >= 500) {
    lastFps = Math.round((fpsFrames * 1000) / fpsAccum);
    fpsAccum = 0;
    fpsFrames = 0;
  }
  fpsWindowStart = now;
}

function frame(now) {
  requestAnimationFrame(frame);

  let dt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  trackFps(now);
  // a long frame (tab switch, GC) must not teleport anyone
  dt = Math.min(dt, 0.05);

  if (!paused) {
    elapsed += dt;
    const playing = game.state === STATE.PLAYING;

    if (playing) {
      tick(dt);
      movePlayer(dt);
      updateStations();

      // hand the top plate to whoever we're standing next to
      if (carry.length > 0) {
        const top = carry[carry.length - 1].userData.dish;
        const result = customers.deliver(player.group.position, top);
        if (result && result.type === 'served') popTopPlate();
      }
    } else {
      // title / game over: nobody is playing, so the player just stands there
      player.update(dt, 0, C.player.walkCycle);
      playerRing.position.x = player.group.position.x;
      playerRing.position.z = player.group.position.z;
    }

    // Customers always tick — off the clock they get a calm difficulty so the
    // room stays alive without anyone losing a life over the title screen.
    customers.update(dt, player.group.position);

    mami.update(dt, 0, 6);
    updateEffects(dt);
    updateHint();

    hudTimer -= dt;
    if (hudTimer <= 0) {
      hudTimer = 0.1;
      if (game.state === STATE.PLAYING) {
        ui.updateHUD({
          coins: game.coins,
          served: game.served,
          lives: game.lives,
          level: game.level,
        });
      }
    }
  }

  updateScene(dt, elapsed, game.state !== STATE.PLAYING, player.group.position);
  render();
}

// ===========================================================================
// Go
// ===========================================================================

// Pick a starting look if we don't have one yet.
if (!getCurrentUser().style) setGuestStyle(randomStyle());
ui.setBest(game.best);
ui.showHud(false);
requestAnimationFrame(frame);

// ---------------------------------------------------------------------------
// Test mode hook (?test=1): exposes live state so the game loop can be driven
// and asserted from an automated browser test. Never present in normal play.
// ---------------------------------------------------------------------------
if (CONFIG.testMode) {
  window.__mami = {
    game,
    config: C,
    /** Live snapshot of the things a test wants to assert on. */
    snapshot() {
      return {
        state: game.state,
        lives: game.lives,
        coins: game.coins,
        served: game.served,
        lost: game.lost,
        elapsed: +game.elapsed.toFixed(2),
        carry: carry.map((p) => p.userData.dish),
        customers: customers.all.map((c) => ({
          state: c.state,
          dish: c.order[c.orderIndex] || null,
          order: c.order.slice(),
          orderIndex: c.orderIndex,
          patience: +c.patience.toFixed(2),
          patienceMax: c.patienceMax,
        })),
        fps: lastFps,
      };
    },
    /** Give the player plates instantly, for delivery tests. */
    grant(dishIds) {
      for (const id of dishIds) takeDish(id);
      return carry.map((p) => p.userData.dish);
    },
    /** Teleport the player, for collision / reach tests. */
    place(x, z) {
      player.group.position.set(x, 0, z);
      velocity.set(0, 0, 0);
      return [player.group.position.x, player.group.position.z];
    },
    start: beginRound,
  };
  console.log('[mami] test mode active — window.__mami ready');
}