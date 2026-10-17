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
import {
  world, canvasTexture, sphGeo, cylGeo, mat, drawDishIcon,
  screenSizeFor, getCamera, drawOutlinedText,
} from './scene.js';
import { buildCharacter, randomStyle } from './character.js';

const C = CONFIG;
const K = C.customers;

// ===========================================================================
// Order bubble + patience bar art (drawn in code, cached)
// ===========================================================================

const bubbleCache = new Map();
const bubbleAspectCache = new Map();

// Bold system stack, matching the one used for the counter signs.
const UI_FONT = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';

// The bubble art is a TIDY STRIP — 152px tall, and only as wide as the dish
// name actually needs — with the patience bar living INSIDE the panel along its
// bottom edge.
//
// A square sprite at a small on-screen size is mostly empty panel and forces
// the dish name down to ~9px. A strip puts the icon on the left where it takes
// little height and gives the name a full single line. The canvas width is
// MEASURED per dish (with a floor), so ZOBO does not drag a hundred-odd pixels
// of blank panel across the counter, while CHAPMAN still gets the width it
// needs instead of spilling over the edge.
//
// Everything here is in canvas units. The sprite is drawn 0.049 of a 768px
// viewport tall, so at 1366x768 one canvas px is 0.25 screen px:
//   icon 72px -> 18px   name cap 45px -> 11px   bar 24px -> 6px
// and the whole bubble is 87-109px wide.
const BUBBLE_H = 152;
const BUBBLE_PAD = 6;
const PANEL_TOP = 6;
const PANEL_BOT = 146;
const ICON_CX = 52;
const ICON_CY = 52;
const ICON_R = 36;
const NAME_FONT = 62;
const NAME_X = 108;           // left edge of the name's region
const NAME_CY = 52;
const NAME_MAX_W = 300;       // long names squeeze/shrink to fit, never spill
const NAME_TRAIL = 26;        // canvas of clear space after the name
const NAME_LEAD = 12;         // canvas of clear space before the name region
const MIN_W = 350;            // floor, so short names still look deliberate
const BADGE_R = 16;
// Patience bar band, inside the panel's lower third.
const BAR_TOP = 104;
const BAR_BOT = 128;

// Offscreen 2D context used only to measure text before sizing the canvas.
const measureCtx = document.createElement('canvas').getContext('2d');

function bubbleTexture(dishId, count) {
  const key = `${dishId}|${count}`;
  let tex = bubbleCache.get(key);
  if (tex) return tex;
  const dish = C.dishes[dishId];
  const hex = '#' + (dish.color >>> 0).toString(16).slice(-6).padStart(6, '0');
  const text = (dish.short || dish.name).toUpperCase();
  const multi = count > 1;

  // Measure first, so the panel is exactly as wide as icon + name + badge.
  // A multi-item order reserves its badge's width BEFORE the name is placed,
  // so the badge can never end up sitting on top of the last letter.
  const badgeSpace = multi ? BADGE_R * 2 + 14 : 0;
  const nameCap = multi ? NAME_MAX_W - 20 : NAME_MAX_W;
  measureCtx.font = `900 ${NAME_FONT}px ${UI_FONT}`;
  const nameW = Math.min(nameCap, measureCtx.measureText(text).width);
  const W = Math.round(Math.max(MIN_W, NAME_X + nameW + badgeSpace + NAME_TRAIL));
  bubbleAspectCache.set(key, W / BUBBLE_H);

  tex = canvasTexture(W, BUBBLE_H, (ctx, w, h) => {
    const px = BUBBLE_PAD;
    const py = PANEL_TOP;
    const bw = w - BUBBLE_PAD * 2;
    const bh = PANEL_BOT - PANEL_TOP;
    const panelRight = px + bw;

    // --- bubble panel: white, heavy dark border -------------------------
    ctx.fillStyle = '#fffdf6';
    ctx.strokeStyle = '#1b1410';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.roundRect(px, py, bw, bh, 20);
    ctx.fill();
    ctx.stroke();

    // --- dish colour band down the left edge (reads at a glance) --------
    ctx.save();
    ctx.beginPath(); ctx.roundRect(px, py, bw, bh, 20); ctx.clip();
    ctx.fillStyle = hex;
    ctx.fillRect(px, py, 11, bh);
    ctx.restore();

    // --- dish icon, deliberately small ----------------------------------
    drawDishIcon(ctx, dish.icon, ICON_CX, ICON_CY, ICON_R);

    // --- SHORT name, ONE line, in the region between icon and badge.
    // The region is bounded on both sides so the name can never touch the
    // icon, the badge or the panel edge; drawOutlinedText squeezes
    // horizontally before it shrinks the font, so a long name keeps its
    // cap height.
    const regionL = NAME_X;
    const regionR = panelRight - NAME_LEAD - badgeSpace;
    drawOutlinedText(
      ctx, text,
      (regionL + regionR) / 2, NAME_CY,
      regionR - regionL, NAME_FONT, 40,
      { halo: 13, ink: 6, fill: '#1b1410' },
    );

    // --- quantity badge, only for multi-item orders ---------------------
    if (multi) {
      const badgeCx = regionR + badgeSpace / 2;
      ctx.fillStyle = '#c2452f';
      ctx.strokeStyle = '#fffdf6';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(badgeCx, NAME_CY, BADGE_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff6e6';
      // drawOutlinedText restores its own alignment, so set it explicitly or
      // the badge text draws left-aligned out of the circle.
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${count > 9 ? 13 : 19}px ${UI_FONT}`;
      ctx.fillText(`×${count}`, badgeCx, NAME_CY + 1);
    }
  });
  bubbleCache.set(key, tex);
  return tex;
}

/** On-screen width:height ratio of a bubble for a given dish + count. */
function bubbleAspectFor(dishId, count) {
  bubbleTexture(dishId, count);
  return bubbleAspectCache.get(`${dishId}|${count}`) || 2.4;
}

const BAR_H = (BAR_BOT - BAR_TOP) / BUBBLE_H;
// Centre of the bar band, expressed as an offset below the sprite's centre.
const BAR_DROP = 0.5 - ((BAR_TOP + BAR_BOT) / 2) / BUBBLE_H;
const BAR_W = 0.84;               // sprite width, as a fraction of bubble width

/**
 * Patience bar art: one reusable pill. The FILL is not baked in — the sprite is
 * scaled on x and tinted per frame, so a single texture serves every customer
 * at every fill level and the bar animates smoothly instead of stepping
 * through pre-rendered buckets.
 */
let barTex = null;
function barTexture() {
  if (barTex) return barTex;
  barTex = canvasTexture(400, BAR_BOT - BAR_TOP, (ctx, w, h) => {
    ctx.fillStyle = '#fffdf6';
    ctx.strokeStyle = '#1b1410';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(3, 2, w - 6, h - 4, (h - 4) / 2);
    ctx.fill();
    ctx.stroke();
  });
  return barTex;
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
 * @param {function} opts.orderPool  () => string[] dish ids a customer may order
 * @param {object} opts.callbacks   { onArrive, onServe, onWrong, onLoseLife, onLeave }
 */
export function createCustomerSystem({ scene, difficulty, orderPool, callbacks }) {
  /** @type {Array<object>} live customers */
  let list = [];
  let spawnTimer = K.firstSpawnDelay;
  const tmpVec = new THREE.Vector3();

  function freeSeat() {
    const taken = new Set(list.filter((c) => c.state !== 'gone').map((c) => c.seat.index));
    return world.seats.find((s) => !taken.has(s.index)) || null;
  }

  function makeOrder(itemCount) {
    // Only dishes that are BOTH unlocked and on the counter with a pickup
    // point. Asking for a locked dish would be unfair — there is no way to get
    // it. orderPool() is the single source of truth for this.
    const keys = orderPool();
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

    // Patience bar, hung under the bubble. Same billboard trick as the bubble:
    // a sprite scaled on x and tinted per frame, so one texture serves everyone.
    const bar = new THREE.Sprite(new THREE.SpriteMaterial({
      map: barTexture(), transparent: true, depthWrite: false, depthTest: false,
      color: COL_GOOD.clone(),
    }));
    bar.renderOrder = 11;            // ON TOP of the bubble panel it sits inside
    bar.visible = false;
    group.add(bar);

    // Order bubble. A THREE.Sprite always faces the camera (billboard), and
    // its scale is re-fitted every frame in update() so it occupies a constant
    // fraction of the screen no matter how far away the customer is.
    //
    // Hidden until they are actually SEATED: while walking in, a customer can
    // be at the very edge of the room and a screen-constant sprite gets clipped
    // in half against the viewport edge.
    const order = makeOrder(d.order);
    const bubble = new THREE.Sprite(new THREE.SpriteMaterial({
      map: bubbleTexture(order[0], 1), transparent: true, depthWrite: false, depthTest: false,
    }));
    bubble.position.set(K.bubbleOffsetX, K.bubbleHeightShallow, 0);
    bubble.renderOrder = 10; // always draw over people and furniture
    bubble.visible = false;
    group.add(bubble);
    const bubbleAspect = bubbleAspectFor(order[0], 1);

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
      bar,
      bubble,
      bubbleAspect,
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

  /** Show the order bubble + patience bar for a seated customer. */
  function refreshBubble(cust) {
    const remaining = cust.order.length - cust.orderIndex;
    const need = cust.order[cust.orderIndex];
    const tex = bubbleTexture(need, remaining);
    if (cust.bubble.material.map !== tex) {
      cust.bubble.material.map = tex;
      cust.bubble.material.needsUpdate = true;
      cust.bubbleAspect = bubbleAspectFor(need, remaining);
    }
    cust.bubble.visible = true;
    cust.bar.visible = true;
    updateBar(cust);
  }

  /** Hide both — used when the customer is done or walking away. */
  function hideOrder(cust) {
    cust.bubble.visible = false;
    cust.bar.visible = false;
  }

  function updateBar(cust) {
    const f = Math.max(0, Math.min(1, cust.patience / cust.patienceMax));
    cust.bar.material.color.copy(patienceColor(f));
    // Width and left anchor are set in fitBillboard(), which owns the world
    // size; stash the fraction here so both stay in sync from one number.
    cust.barFrac = f;
  }

  function sendHome(cust, angry) {
    cust.state = angry ? 'storming' : 'leaving';
    cust.leaving = routeToDoor(cust.route);
    cust.leaving[0] = cust.group.position.clone(); // start exactly where they are
    cust.route = cust.leaving;
    cust.routeIdx = 0;
    cust.char.setSitting(false);
    hideOrder(cust);
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
   * Hand a plate to whoever is in reach.
   *
   * ANY plate in the carried stack that matches what this customer wants will
   * do — it does not have to be the one on top. `stack` is the player's plates
   * bottom-first; the matching index comes back in the result so the caller can
   * pull that exact plate off.
   *
   * @param {{x:number,z:number}} playerPos
   * @param {string[]} stack dish ids, bottom first
   * @returns {null|{type:'served'|'wrong', customer:object, dish:string, index:number}}
   */
  function deliver(playerPos, stack) {
    const cust = customerInReach(playerPos);
    if (!cust || !stack || stack.length === 0) return null;
    if (cust.wrongCooldown > 0) return null;

    const need = cust.order[cust.orderIndex];
    const index = stack.indexOf(need);

    if (index >= 0) {
      cust.orderIndex++;
      // Just enough to stop the same frame double-processing; a two-item order
      // should still go out back-to-back without a visible pause.
      cust.wrongCooldown = 0.1;
      const fraction = cust.patience / cust.patienceMax;
      const result = { type: 'served', customer: cust, dish: need, index, fraction };
      if (cust.orderIndex >= cust.order.length) {
        cust.orderIndex = cust.order.length;
        cust.state = 'happy';
        cust.sitTimer = K.happyDelay;
        hideOrder(cust);
        cust.char.hop();
      } else {
        refreshBubble(cust);
      }
      if (callbacks.onServe) callbacks.onServe(result);
      return result;
    }

    // wrong dish: nothing is taken off the stack, but they lose patience fast
    cust.patience = Math.max(0, cust.patience - K.wrongDishPenalty);
    cust.wrongCooldown = K.wrongDishCooldown;
    cust.char.squash();
    cust.patienceFlash = 0.5;
    updateBar(cust);
    if (cust.patience <= 0) {
      losePatience(cust);
    }
    if (callbacks.onWrong) callbacks.onWrong(cust);
    return { type: 'wrong', customer: cust, dish: need, index: -1 };
  }

  function losePatience(cust) {
    sendHome(cust, true);
    cust.storming = true;
    if (callbacks.onLoseLife) callbacks.onLoseLife(cust);
  }

  // --- main tick -----------------------------------------------------------

  /**
   * Keep a customer's order bubble AND patience bar at a CONSTANT size on
   * screen, and hung off each other.
   *
   * A sprite in three.js always billboards to the camera, so it already faces
   * the viewer; what it does not do by default is keep its pixel size steady as
   * it moves nearer or further away. Solving the projection for the sprite's
   * distance to the camera and rescaling every frame gives an order bubble that
   * is exactly the same number of pixels tall whether the customer is at the
   * near table or the far one, and on both a laptop and a phone.
   *
   * The bar is sized as a fraction of the bubble's world height so the two can
   * never drift apart, and its left edge is pinned so the fill drains from the
   * right towards the left.
   */
  const bubbleWorld = new THREE.Vector3();
  function fitBillboard(c) {
    if (!c.bubble.visible) return;
    const cam = getCamera();
    if (!cam) return;
    c.bubble.getWorldPosition(bubbleWorld);
    const fraction = window.innerWidth < K.bubbleScreenNarrowAt
      ? K.bubbleScreenFractionNarrow
      : K.bubbleScreenFraction;
    const size = screenSizeFor(fraction, cam.position.distanceTo(bubbleWorld));
    // Guard: a NaN scale makes a sprite vanish with no error, which is a
    // miserable thing to debug. Fall back to a sane world size instead.
    const h = Number.isFinite(size) && size > 0 ? size : 1.2;
    const aspect = c.bubbleAspect || K.bubbleAspect;

    // Back-row bubbles ride ABOVE the counter sign row; everyone else's sits
    // BELOW it, so a bubble never lands on a pickup sign at all.
    const y = c.group.position.z <= K.bubbleDeepZ
      ? K.bubbleHeightDeep
      : K.bubbleHeightShallow;
    c.bubble.position.y = y;
    c.bubble.scale.set(h * aspect, h, 1);

    if (c.bar.visible) {
      const bh = h * BAR_H;                    // bar world height, ~6px
      const bwFull = h * aspect * BAR_W;       // bar world width, full
      const f = c.barFrac == null ? 1 : c.barFrac;
      // BAR_DROP is the bar's offset from the bubble's centre in sprite-local
      // units (negative = below centre), so it is ADDED to the bubble's height.
      // Pin the bar's LEFT edge too, so the fill drains from right to left.
      c.bar.position.set(
        K.bubbleOffsetX - bwFull / 2 + bwFull * f / 2,
        y + h * BAR_DROP,
        0,
      );
      c.bar.scale.set(bwFull * f, bh, 1);
      // Same NaN guard as the bubble: a bad fraction would silently blank it.
      if (!Number.isFinite(c.bar.scale.x) || c.bar.scale.x <= 0) {
        c.bar.scale.set(bwFull, bh, 1);
        c.bar.position.x = 0;
      }
    }
  }

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
        updateBar(c);
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
        fitBillboard(c);
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
    // First customer walks in almost immediately, so a round starts with
    // something to do instead of an empty room.
    spawnTimer = K.firstSpawnDelay;
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