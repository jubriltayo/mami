// ---------------------------------------------------------------------------
// game.js — rules and state only. No three.js in here.
//
// This file owns coins, customers served, lives, the difficulty ramp, the best
// score in localStorage, and the ONE end-of-round hook: onGameOver({ coins,
// served }).
// ---------------------------------------------------------------------------

import { CONFIG } from './config.js';

const BEST_KEY = 'mami.best';

export const STATE = {
  TITLE: 'title',
  PLAYING: 'playing',
  GAMEOVER: 'gameover',
};

/** Live game state. Reset by start(). */
export const game = {
  state: STATE.TITLE,
  coins: 0,
  served: 0,
  lost: 0,
  lives: CONFIG.game.lives,
  elapsed: 0,
  level: 1,
  best: readBest(),
};

// ===========================================================================
// Best score (localStorage)
// ===========================================================================

function readBest() {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (!raw) return { coins: 0, served: 0 };
    const v = JSON.parse(raw);
    return { coins: Number(v.coins) || 0, served: Number(v.served) || 0 };
  } catch (err) {
    return { coins: 0, served: 0 };
  }
}

function writeBest() {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(game.best));
  } catch (err) {
    /* storage disabled — the run still works, the score just isn't remembered */
  }
}

// ===========================================================================
// End-of-round hook
// ===========================================================================

// Subscribers (ui.js / main.js) register here; onGameOver fans out to them.
const gameOverHooks = [];

/** Register something to run when the round ends. Returns an unsubscribe fn. */
export function onGameOverHook(fn) {
  gameOverHooks.push(fn);
  return () => {
    const i = gameOverHooks.indexOf(fn);
    if (i >= 0) gameOverHooks.splice(i, 1);
  };
}

/**
 * THE end-of-round hook. Called once, when the last life is gone.
 * Everything that should happen "when the round ends" happens here:
 * best score, audio cue and the game-over screen.
 * @param {{coins:number, served:number}} summary
 */
export function onGameOver({ coins, served }) {
  game.state = STATE.GAMEOVER;

  const isBest = coins > game.best.coins;
  if (isBest) {
    game.best.coins = coins;
    game.best.served = Math.max(game.best.served, served);
    writeBest();
  }

  const summary = {
    coins,
    served,
    lost: game.lost,
    lives: game.lives,
    elapsed: game.elapsed,
    best: { ...game.best },
    isBest,
  };

  for (const fn of gameOverHooks) {
    try {
      fn(summary);
    } catch (err) {
      console.error('[game] onGameOver hook threw', err);
    }
  }
  return summary;
}

// ===========================================================================
// Round flow
// ===========================================================================

export function startRound() {
  game.state = STATE.PLAYING;
  game.coins = 0;
  game.served = 0;
  game.lost = 0;
  game.lives = CONFIG.game.lives;
  game.elapsed = 0;
  game.level = 1;
}

/** Called every frame while playing. */
export function tick(dt) {
  if (game.state !== STATE.PLAYING) return;
  game.elapsed += dt;
  game.level = difficulty().level;
}

/** Coins for one served dish. Fast service is worth more. */
export function serveValue(dishId, itemsLeft, patienceFraction) {
  const dish = CONFIG.dishes[dishId];
  const base = dish ? dish.price : 5;
  const orderBonus = CONFIG.game.orderItemBonus * Math.max(0, itemsLeft - 1);
  const quick = patienceFraction > CONFIG.game.quickBonusFraction
    ? Math.round(CONFIG.game.quickBonusMax * (patienceFraction - CONFIG.game.quickBonusFraction)
        / (1 - CONFIG.game.quickBonusFraction))
    : 0;
  return base + CONFIG.game.baseTip + orderBonus + quick;
}

/** Add coins, and report the total for the "coin pop" float. */
export function addCoins(amount) {
  game.coins += amount;
  return game.coins;
}

export function addServed() {
  game.served += 1;
}

/**
 * A customer stormed out.
 * @returns {boolean} true if this ended the round
 */
export function loseLife() {
  game.lives -= 1;
  game.lost += 1;
  if (game.lives <= 0) {
    game.lives = 0;
    onGameOver({ coins: game.coins, served: game.served });
    return true;
  }
  return false;
}

// ===========================================================================
// Difficulty ramp
// ===========================================================================

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * Current difficulty, interpolated between the two bracketing levels so the
 * ramp is smooth rather than stepping.
 * @returns {{spawn:number, patience:number, order:number, speed:number,
 *            maxActive:number, level:number}}
 */
export function difficulty() {
  const levels = CONFIG.customers.levels;
  let i = 0;
  while (i < levels.length - 1 && game.elapsed >= levels[i + 1].at) i++;
  const a = levels[i];
  const b = levels[Math.min(i + 1, levels.length - 1)];

  const span = b.at - a.at;
  const t = span > 0 ? clamp01((game.elapsed - a.at) / span) : 1;

  // order size flips once we're more than halfway into a level
  const order = t < 0.5 ? a.order : b.order;

  // how crowded the room gets tracks overall progress, not local interpolation
  const progress = (i + t) / Math.max(1, levels.length - 1);
  const maxActive = Math.round(lerp(
    CONFIG.customers.maxActiveEarly,
    CONFIG.customers.maxActiveLate,
    clamp01(progress),
  ));

  return {
    spawn: lerp(a.spawn, b.spawn, t),
    patience: lerp(a.patience, b.patience, t),
    order,
    speed: lerp(a.speed, b.speed, t),
    maxActive: Math.max(CONFIG.customers.maxActiveEarly, maxActive),
    level: i + 1,
  };
}