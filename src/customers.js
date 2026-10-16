// ---------------------------------------------------------------------------
// customers.js — arrivals, seating, orders and patience.
//
// Customers walk in the door, follow a short fixed list of waypoints (the
// "aisles"), sit down, and hold up an order bubble with a patience ring above
// their head. No pathfinding library: the room is laid out so straight walks
// between the aisles and the chairs are always clear.
//
// The module never mutates game state itself — it reports events through
// callbacks so main.js/game.js stay in charge of score and lives.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { world, canvasTexture, sphGeo, cylGeo, mat } from './scene.js';
import { buildCharacter, randomStyle } from './character.js';

const C = CONFIG;
const K = C.customers;

// ===========================================================================
// Order bubble art (drawn in code, cached per dish+count)
// ===========================================================================

const bubbleCache = new Map();

/** Little food glyph per dish, drawn with canvas 2D. */
function drawDishIcon(ctx, icon, cx, cy, r) {
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

/** Speech bubble with the dish icon, name and how many are still needed. */
function bubbleTexture(dishId, count) {
  const key = `${dishId}|${count}`;
  let tex = bubbleCache.get(key);
  if (tex) return tex;
  const dish = C.dishes[dishId];
  tex = canvasTexture(256, 256, (ctx, w, h) => {
    // bubble body
    ctx.fillStyle = '#fdfaf0';
    ctx.strokeStyle = '#3a2c1e';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.roundRect(14, 10, w - 28, 190, 34);
    ctx.fill();
    ctx.stroke();
    // tail
    ctx.beginPath();
    ctx.moveTo(w / 2 - 22, 196);
    ctx.lineTo(w / 2 + 4, 244);
    ctx.lineTo(w / 2 + 26, 196);
    ctx.closePath();
    ctx.fillStyle = '#fdfaf0';
    ctx.fill();
    ctx.stroke();
    // clear the seam under the tail
    ctx.strokeStyle = '#fdfaf0';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 20, 200); ctx.lineTo(w / 2 + 24, 200); ctx.stroke();

    drawDishIcon(ctx, dish.icon, w / 2, 96, 58);

    ctx.fillStyle = '#2b1f14';
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px "Segoe UI", sans-serif';
    ctx.fillText(dish.label.toUpperCase(), w / 2, 178);
    if (count > 1) {
      ctx.fillStyle = '#c2452f';
      ctx.font = 'bold 30px "Segoe UI", sans-serif';
      ctx.fillText(`×${count}`, w / 2, 66);
    }
  });
  bubbleCache.set(key, tex);
  return tex;
}

// ===========================================================================
// Patience ring geometry cache (rebuilt from 20 buckets, never per frame)
// ===========================================================================

const ARC_SEGMENTS = 20;
const arcGeoCache = new Map();
const RING_INNER = 0.3;
const RING_OUTER = 0.4;

function arcGeometry(fraction) {
  const bucket = Math.max(0, Math.min(ARC_SEGMENTS, Math.round(fraction * ARC_SEGMENTS)));
  let g = arcGeoCache.get(bucket);
  if (!g) {
    const theta = (bucket / ARC_SEGMENTS) * Math.PI * 2;
    g = new THREE.RingGeometry(RING_INNER, RING_OUTER, ARC_SEGMENTS + 1, 1, -Math.PI / 2, theta);
    g.rotateX(-Math.PI / 2);
    g.userData.cached = true;
    arcGeoCache.set(bucket, g);
  }
  return g;
}

let baseRingGeo = null;
function baseRing() {
  if (!baseRingGeo) {
    baseRingGeo = new THREE.RingGeometry(RING_INNER, RING_OUTER, 24);
    baseRingGeo.rotateX(-Math.PI / 2);
    baseRingGeo.userData.cached = true;
  }
  return baseRingGeo;
}

// green -> yellow -> red
const COL_GOOD = new THREE.Color(0x3ddc84);
const COL_WARN = new THREE.Color(0xf2c53d);
const COL_BAD = new THREE.Color(0xe0403a);
const tmpColor = new THREE.Color();

function patienceColor(f) {
  if (f > 0.5) return tmpColor.copy(COL_WARN).lerp(COL_GOOD, (f - 0.5) / 0.5);
  return tmpColor.copy(COL_BAD).lerp(COL_WARN, f / 0.5);
}

// ===========================================================================
// Routing
// ===========================================================================

const AISLE_X = C.lanes.x;

/** Fixed waypoint route from the door to a seat. */
function routeToSeat(seat) {
  // pick the aisle whose z is closest to the chair
  let laneZ = C.lanes.z[0];
  for (const z of C.lanes.z) {
    if (Math.abs(z - seat.z) < Math.abs(laneZ - seat.z)) laneZ = z;
  }
  const side = Math.sign(laneZ - seat.z) || 1;
  return [
    new THREE.Vector3(C.door.spawnX, 0, C.door.z),
    new THREE.Vector3(C.door.gateX, 0, C.door.z),
    new THREE.Vector3(AISLE_X, 0, laneZ),
    new THREE.Vector3(seat.x, 0, laneZ),
    new THREE.Vector3(seat.x + side * 1.4, 0, seat.z),
    new THREE.Vector3(seat.x, 0, seat.z),
  ];
}

/** Walk back out the same way. */
function routeToDoor(route) {
  return route.slice().reverse();
}

// ===========================================================================
// System
// ===========================================================================

let nextId = 1;

/**
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {object} opts.difficulty  () => { spawn, patience, order, speed, maxActive }
 * @param {object} opts.callbacks   { onArrive, onServe, onWrong, onLoseLife, onLeave }
 */
export function createCustomerSystem({ scene, difficulty, callbacks }) {
  /** @type {Array<object>} live customers */
  let list = [];
  let spawnTimer = 2.5;
  const tmpVec = new THREE.Vector3();

  function freeSeat() {
    const taken = new Set(list.filter((c) => c.state !== 'gone').map((c) => c.seat.index));
    return world.seats.find((s) => !taken.has(s.index)) || null;
  }

  function makeOrder(itemCount) {
    const keys = Object.keys(C.dishes);
    const order = [];
    for (let i = 0; i < itemCount; i++) {
      // avoid two identical items in one order — it reads as a mistake
      let pick;
      let guard = 0;
      do {
        pick = keys[Math.floor(Math.random() * keys.length)];
        guard++;
      } while (order.indexOf(pick) !== -1 && guard < 8);
      order.push(pick);
    }
    return order;
  }

  function spawn() {
    const seat = freeSeat();
    if (!seat) return false;
    const d = difficulty();

    const style = randomStyle();
    const char = buildCharacter(style);
    const group = new THREE.Group();
    group.add(char.group);
    scene.add(group);

    // patience ring above the head
    const arcMat = new THREE.MeshBasicMaterial({
      color: COL_GOOD.clone(), transparent: true, opacity: 0.95, side: THREE.DoubleSide,
    });
    const ringBase = new THREE.Mesh(baseRing(), new THREE.MeshBasicMaterial({
      color: 0x1b1410, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
    }));
    const arc = new THREE.Mesh(arcGeometry(1), arcMat);
    ringBase.position.y = 2.14;
    arc.position.y = 2.15;
    group.add(ringBase, arc);

    // order bubble
    const order = makeOrder(d.order);
    const spriteMat = new THREE.SpriteMaterial({
      map: bubbleTexture(order[0], 1), transparent: true, depthWrite: false,
    });
    const bubble = new THREE.Sprite(spriteMat);
    bubble.scale.set(1.15, 1.15, 1);
    bubble.position.y = 2.72;
    group.add(bubble);

    const cust = {
      id: nextId++,
      char,
      group,
      seat,
      order,
      orderIndex: 0,
      patience: d.patience,
      patienceMax: d.patience,
      state: 'walk',
      route: routeToSeat(seat),
      routeIdx: 0,
      speed: d.speed,
      arc,
      arcMat,
      ringBase,
      bubble,
      wrongCooldown: 0,
      sitTimer: 0,
      walkSpeedNow: 0,
      leaving: null,
    };
    group.position.copy(cust.route[0]);
    list.push(cust);
    if (callbacks.onArrive) callbacks.onArrive(cust);
    return true;
  }

  /** Refresh the bubble to show the next thing this customer wants. */
  function refreshBubble(cust) {
    const remaining = cust.order.length - cust.orderIndex;
    const need = cust.order[cust.orderIndex];
    const tex = bubbleTexture(need, remaining);
    if (cust.bubble.material.map !== tex) {
      cust.bubble.material.map = tex;
      cust.bubble.material.needsUpdate = true;
    }
    cust.bubble.visible = true;
  }

  function updateRing(cust) {
    const f = Math.max(0, Math.min(1, cust.patience / cust.patienceMax));
    cust.arc.geometry = arcGeometry(f);
    cust.arcMat.color.copy(patienceColor(f));
  }

  function sendHome(cust, angry) {
    cust.state = angry ? 'storming' : 'leaving';
    cust.leaving = routeToDoor(cust.route);
    cust.leaving[0] = cust.group.position.clone(); // start exactly where they are
    cust.route = cust.leaving;
    cust.routeIdx = 0;
    cust.char.setSitting(false);
    cust.bubble.visible = false;
    cust.ringBase.visible = false;
    cust.arc.visible = false;
    cust.speed = angry ? K.stormSpeed : K.leaveSpeed;
    if (!angry && callbacks.onLeave) callbacks.onLeave(cust);
  }

  function despawn(cust) {
    cust.char.dispose();
    cust.state = 'gone';
  }

  // --- movement ------------------------------------------------------------

  function moveAlongRoute(cust, dt) {
    const target = cust.route[cust.routeIdx];
    tmpVec.set(target.x - cust.group.position.x, 0, target.z - cust.group.position.z);
    const dist = tmpVec.length();
    if (dist < 0.12) {
      cust.routeIdx++;
      if (cust.routeIdx >= cust.route.length) {
        cust.walkSpeedNow = 0;
        return true; // arrived
      }
      return false;
    }
    tmpVec.divideScalar(dist);
    const step = Math.min(dist, cust.speed * dt);
    cust.group.position.x += tmpVec.x * step;
    cust.group.position.z += tmpVec.z * step;
    cust.walkSpeedNow = Math.min(1, cust.speed / 3.2);
    // face travel direction
    cust.char.setFacing(Math.atan2(tmpVec.x, tmpVec.z));
    return false;
  }

  // --- delivery ------------------------------------------------------------

  /** The waiting customer the player is currently standing next to. */
  function customerInReach(playerPos) {
    let best = null;
    let bestD = K.seatRadius;
    for (const c of list) {
      if (c.state !== 'waiting') continue;
      const dx = c.group.position.x - playerPos.x;
      const dz = c.group.position.z - playerPos.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  /**
   * Hand the top plate to whoever is in reach.
   * @returns {null|{type:'served'|'wrong'|'done', customer:object, dish:string}}
   */
  function deliver(playerPos, topDish) {
    const cust = customerInReach(playerPos);
    if (!cust || !topDish) return null;
    if (cust.wrongCooldown > 0) return null;

    const need = cust.order[cust.orderIndex];
    if (topDish === need) {
      cust.orderIndex++;
      cust.wrongCooldown = 0.25;
      const fraction = cust.patience / cust.patienceMax;
      const result = { type: 'served', customer: cust, dish: topDish, fraction };
      if (cust.orderIndex >= cust.order.length) {
        cust.orderIndex = cust.order.length;
        cust.state = 'happy';
        cust.sitTimer = K.happyDelay;
        cust.bubble.visible = false;
        cust.ringBase.visible = false;
        cust.arc.visible = false;
        cust.char.hop();
      } else {
        refreshBubble(cust);
      }
      if (callbacks.onServe) callbacks.onServe(result);
      return result;
    }

    // wrong dish: it stays in your hands and they lose patience fast
    cust.patience = Math.max(0, cust.patience - K.wrongDishPenalty);
    cust.wrongCooldown = K.wrongDishCooldown;
    cust.char.squash();
    cust.patienceFlash = 0.5;
    updateRing(cust);
    if (cust.patience <= 0) {
      losePatience(cust);
    }
    if (callbacks.onWrong) callbacks.onWrong(cust);
    return { type: 'wrong', customer: cust, dish: topDish };
  }

  function losePatience(cust) {
    sendHome(cust, true);
    cust.storming = true;
    if (callbacks.onLoseLife) callbacks.onLoseLife(cust);
  }

  // --- main tick -----------------------------------------------------------

  function update(dt, playerPos) {
    // spawning
    const d = difficulty();
    const liveCount = list.filter((c) => c.state !== 'gone').length;
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      if (liveCount < d.maxActive) {
        if (spawn()) spawnTimer = d.spawn;
        else spawnTimer = 1.0; // no free seat, try again shortly
      } else {
        spawnTimer = 0.8;
      }
    }

    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];

      if (c.state === 'walk') {
        if (moveAlongRoute(c, dt)) {
          c.state = 'sitting';
          c.sitTimer = 0.18;
        }
      } else if (c.state === 'sitting') {
        c.sitTimer -= dt;
        c.walkSpeedNow = 0;
        if (c.sitTimer <= 0) {
          c.state = 'waiting';
          c.char.setSitting(true);
          refreshBubble(c);
          c.grace = K.patienceGrace;
        }
      } else if (c.state === 'waiting') {
        if (c.wrongCooldown > 0) c.wrongCooldown -= dt;
        c.grace -= dt;
        if (c.grace <= 0) {
          c.patience -= dt;
          if (c.patience <= 0) losePatience(c);
        }
        updateRing(c);
        // little idle fidget
        c.char.update(dt, 0, C.player.walkCycle);
      } else if (c.state === 'happy') {
        c.sitTimer -= dt;
        if (c.sitTimer <= 0) sendHome(c, false);
      } else if (c.state === 'leaving' || c.state === 'storming') {
        if (moveAlongRoute(c, dt)) despawn(c);
      }

      if (c.state !== 'gone') {
        c.char.update(dt, c.walkSpeedNow, C.player.walkCycle);
      }
    }

    // remove finished customers
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].state === 'gone') list.splice(i, 1);
    }
  }

  // --- lifecycle -----------------------------------------------------------

  function reset() {
    for (const c of list) c.char.dispose();
    list = [];
    spawnTimer = 2.5;
  }

  return {
    update,
    reset,
    deliver,
    customerInReach,
    get all() {
      return list;
    },
    get waitingCount() {
      return list.filter((c) => c.state === 'waiting').length;
    },
  };
}

/** A single plate of food, used for the player's carry stack. */
export function buildPlate(dishId) {
  const dish = C.dishes[dishId] || C.dishes['jollof'];
  const g = new THREE.Group();
  const plate = new THREE.Mesh(cylGeo(0.26, 0.22, 0.05, 12), mat(0xf4efe2));
  plate.castShadow = true;
  g.add(plate);
  const food = new THREE.Mesh(cylGeo(0.17, 0.2, 0.14, 10), mat(dish.color));
  food.position.y = 0.09;
  food.castShadow = true;
  g.add(food);
  // a little garnish so each dish looks different from above
  const garnish = new THREE.Mesh(sphGeo(0.07, 6, 5), mat(0x4f8f3a));
  garnish.position.set(0.07, 0.17, 0.05);
  g.add(garnish);
  g.userData.dish = dishId;
  return g;
}