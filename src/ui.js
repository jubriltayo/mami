// ---------------------------------------------------------------------------
// ui.js — all the HTML/CSS overlays: title, HUD, game-over, toast messages and
// the touch joystick. The DOM is created here so index.html stays tiny.
//
// The joystick is a plain pointer-drag on the left half of the screen; on
// desktop the same vector is fed by WASD / arrow keys from main.js.
// ---------------------------------------------------------------------------

import { CONFIG } from './config.js';

const CSS = `
:root {
  --cream: #fdf3d8;
  --green: #1d6b4a;
  --deep:  #14100c;
  --gold:  #f2b134;
  --red:   #d94f3d;
  --font: "Segoe UI", system-ui, -apple-system, "Helvetica Neue", sans-serif;
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; height: 100%; overflow: hidden;
  background: #14100c; color: var(--cream);
  font-family: var(--font);
  -webkit-user-select: none; user-select: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: none;
}
#app { position: fixed; inset: 0; }
canvas { display: block; width: 100%; height: 100%; }
#ui { position: fixed; inset: 0; pointer-events: none; z-index: 10; }

.screen {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; padding: 24px;
  background: radial-gradient(ellipse at 50% 40%, rgba(20,14,8,0.55), rgba(10,8,6,0.92));
  opacity: 0; visibility: hidden; transition: opacity .35s ease;
  pointer-events: none;
}
.screen.show { opacity: 1; visibility: visible; pointer-events: auto; }

.title-main {
  font-size: clamp(64px, 17vw, 150px);
  font-weight: 900; letter-spacing: .12em; line-height: .9;
  color: var(--gold);
  text-shadow: 0 4px 0 #7a3b18, 0 10px 26px rgba(0,0,0,.7);
  margin: 0;
}
.title-sub {
  font-size: clamp(14px, 3.6vw, 22px); letter-spacing: .34em;
  color: #ffd9a0; margin: 14px 0 4px; text-transform: uppercase;
}
.title-note {
  font-size: clamp(12px, 3vw, 16px); color: #d8c4a4; max-width: 34ch;
  line-height: 1.55; margin: 10px 0 4px;
}
.best-line { font-size: 15px; color: #ffe6b8; margin-top: 6px; letter-spacing: .05em; }

.btn {
  pointer-events: auto; cursor: pointer;
  font-family: var(--font); font-weight: 800;
  font-size: clamp(17px, 4.4vw, 26px); letter-spacing: .16em;
  color: #241505; background: var(--gold);
  border: 0; border-radius: 14px; padding: 16px 46px;
  box-shadow: 0 6px 0 #a06f14, 0 12px 24px rgba(0,0,0,.45);
  margin-top: 22px; text-transform: uppercase;
  transition: transform .08s ease, box-shadow .08s ease;
}
.btn:active { transform: translateY(4px); box-shadow: 0 2px 0 #a06f14; }
.btn.ghost {
  background: transparent; color: var(--cream);
  box-shadow: inset 0 0 0 2px rgba(253,243,216,.45);
  font-size: clamp(12px, 3vw, 15px); padding: 11px 24px; margin-top: 14px;
}
.btn.ghost:active { transform: translateY(2px); }

/* ---------------------------------------------------------------- HUD */
#hud {
  position: absolute; top: 0; left: 0; right: 0;
  display: flex; gap: 10px; align-items: flex-start; justify-content: space-between;
  padding: 12px 14px; opacity: 0; transition: opacity .3s ease;
}
#hud.show { opacity: 1; }
.hud-panel {
  background: rgba(12,9,6,.55);
  border: 2px solid rgba(253,243,216,.18);
  border-radius: 12px; padding: 8px 12px;
  backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
}
.hud-stat { font-size: clamp(15px, 4vw, 22px); font-weight: 800; line-height: 1.15; }
.hud-label { font-size: 10px; letter-spacing: .2em; color: #c9b28c; text-transform: uppercase; }
.hud-right { display: flex; gap: 8px; align-items: flex-start; }
#hearts { font-size: clamp(17px, 4.4vw, 24px); letter-spacing: 4px; }
.heart-off { opacity: .22; }

/* carry stack readout */
#carry { display: flex; gap: 6px; align-items: center; margin-top: 8px; }
.slot {
  width: 34px; height: 34px; border-radius: 8px;
  border: 2px dashed rgba(253,243,216,.3);
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 800; letter-spacing: .02em;
  color: #241505; opacity: .28;
}
.slot.filled { opacity: 1; border-style: solid; border-color: rgba(0,0,0,.35); }
.slot.top { box-shadow: 0 0 0 2px var(--gold); }

/* mute + hint */
#mute {
  pointer-events: auto; cursor: pointer;
  width: 40px; height: 40px; border-radius: 10px;
  background: rgba(12,9,6,.55); color: var(--cream);
  border: 2px solid rgba(253,243,216,.2);
  font-size: 18px; line-height: 1; display: flex; align-items: center; justify-content: center;
}
#hint {
  position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%);
  background: rgba(12,9,6,.6); border: 2px solid rgba(253,243,216,.16);
  padding: 9px 16px; border-radius: 20px; font-size: 13px; letter-spacing: .04em;
  opacity: 0; transition: opacity .25s ease; white-space: nowrap; text-align: center;
}
#hint.show { opacity: 1; }
#hint b { color: var(--gold); }

/* toast: +8, WRONG DISH, etc. */
#toasts {
  position: absolute; left: 50%; top: 26%; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 6px;
}
.toast {
  font-weight: 900; font-size: clamp(20px, 5.6vw, 34px); letter-spacing: .06em;
  text-shadow: 0 3px 0 rgba(0,0,0,.5);
  animation: toastUp 1.05s ease-out forwards;
}
.toast.coin { color: var(--gold); }
.toast.bad { color: var(--red); }
.toast.good { color: #7ee08a; }
@keyframes toastUp {
  0%   { opacity: 0; transform: translateY(14px) scale(.8); }
  18%  { opacity: 1; transform: translateY(0) scale(1.08); }
  70%  { opacity: 1; transform: translateY(-16px) scale(1); }
  100% { opacity: 0; transform: translateY(-46px) scale(.95); }
}

/* -------------------------------------------------------------- joystick */
#stick {
  position: absolute; width: 132px; height: 132px; margin: -66px 0 0 -66px;
  border-radius: 50%; border: 3px solid rgba(253,243,216,.28);
  background: rgba(253,243,216,.07); opacity: 0;
  transition: opacity .12s ease; left: -999px; top: -999px;
}
#stick.on { opacity: 1; }
#knob {
  position: absolute; left: 50%; top: 50%; width: 58px; height: 58px;
  margin: -29px 0 0 -29px; border-radius: 50%;
  background: rgba(253,243,216,.45); border: 3px solid rgba(253,243,216,.7);
}

/* ----------------------------------------------------------- game over */
.over-title {
  font-size: clamp(38px, 10vw, 82px); font-weight: 900; letter-spacing: .06em;
  color: var(--red); text-shadow: 0 4px 0 #5c1a10, 0 12px 30px rgba(0,0,0,.7);
  margin: 0;
}
.over-sub { font-size: clamp(13px, 3.2vw, 18px); color: #e8d5b4; letter-spacing: .2em; margin-bottom: 22px; }
.score-grid {
  display: grid; grid-template-columns: repeat(2, minmax(110px, 1fr));
  gap: 12px; margin-bottom: 6px;
}
.score-card {
  background: rgba(253,243,216,.08); border: 2px solid rgba(253,243,216,.18);
  border-radius: 14px; padding: 14px 18px;
}
.score-num { font-size: clamp(26px, 7vw, 44px); font-weight: 900; color: var(--gold); line-height: 1; }
.score-name { font-size: 11px; letter-spacing: .18em; color: #c9b28c; text-transform: uppercase; }
.newbest {
  margin-top: 16px; color: var(--gold); font-weight: 800;
  letter-spacing: .22em; font-size: 14px; animation: pulse 1s ease-in-out infinite alternate;
}
@keyframes pulse { from { opacity: .6 } to { opacity: 1 } }

/* --------------------------------------------------------------- paused */
#paused {
  position: absolute; inset: 0; display: none;
  align-items: center; justify-content: center; flex-direction: column;
  background: rgba(10,8,6,.72); font-size: 22px; letter-spacing: .3em;
}
#paused.show { display: flex; }
`;

const ICONS = { on: '🔊', off: '🔇' };

/** Small helper: el('div', {class: 'x'}, 'text') */
function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v);
  }
  for (const c of children) {
    if (typeof c === 'string') n.appendChild(document.createTextNode(c));
    else if (c) n.appendChild(c);
  }
  return n;
}

// ===========================================================================
// Init
// ===========================================================================

/**
 * @param {object} handlers
 * @param {function} handlers.onPlay        title button
 * @param {function} handlers.onShuffle     shuffle-look button
 * @param {function} handlers.onRestart     play-again button
 * @param {function} handlers.onMute        mute button (returns new muted state)
 */
export function initUI(handlers) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = el('div', { id: 'ui' });
  document.body.appendChild(root);

  // ---------------------------------------------------------------- title
  const titleBtn = el('button', { class: 'btn', text: 'Play' });
  const shuffleBtn = el('button', { class: 'btn ghost', text: 'Shuffle my look' });
  const bestLine = el('div', { class: 'best-line' });
  const title = el('div', { class: 'screen show', id: 'title' },
    el('h1', { class: 'title-main', text: 'MAMI' }),
    el('div', { class: 'title-sub', text: "Naija buka rush" }),
    el('p', { class: 'title-note' },
      "You are the only server in Mami's buka. Carry three plates at once, ",
      'run the room, and keep everyone happy before their patience runs out.'),
    el('div', { class: 'title-note' },
      'Desktop: WASD / arrows to move. Touch: drag on the left side.'),
    bestLine,
    titleBtn,
    shuffleBtn,
  );
  titleBtn.addEventListener('click', () => handlers.onPlay());
  shuffleBtn.addEventListener('click', () => handlers.onShuffle());

  // ------------------------------------------------------------------ HUD
  const coinsStat = el('div', { class: 'hud-stat', text: '0' });
  const servedStat = el('div', { class: 'hud-stat', text: '0' });
  const hearts = el('div', { id: 'hearts' });
  const levelStat = el('div', { class: 'hud-label', text: 'LEVEL 1' });
  const carry = el('div', { id: 'carry' });

  const left = el('div', { class: 'hud-panel' },
    el('div', {},
      el('div', { class: 'hud-label', text: 'Coins' }), coinsStat),
    el('div', {},
      el('div', { class: 'hud-label', text: 'Served' }), servedStat),
    carry,
  );
  const muteBtn = el('div', { id: 'mute', title: 'Mute' }, ICONS.on);
  muteBtn.addEventListener('click', () => {
    const muted = handlers.onMute();
    muteBtn.textContent = muted ? ICONS.off : ICONS.on;
  });
  const right = el('div', { class: 'hud-right' },
    el('div', { class: 'hud-panel' }, hearts, levelStat),
    muteBtn,
  );
  const hint = el('div', { id: 'hint' });
  const hud = el('div', { id: 'hud' }, left, right);

  // --------------------------------------------------------------- toasts
  const toasts = el('div', { id: 'toasts' });

  // -------------------------------------------------------------- joystick
  const knob = el('div', { id: 'knob' });
  const stick = el('div', { id: 'stick' }, knob);
  const joystick = { x: 0, y: 0 };

  // ------------------------------------------------------------- game over
  const overTitle = el('div', { class: 'over-title', text: 'SERVICE OVER' });
  const overSub = el('div', { class: 'over-sub', text: 'MAMI says you owe me' });
  const overCoins = el('div', { class: 'score-num', text: '0' });
  const overServed = el('div', { class: 'score-num', text: '0' });
  const overBest = el('div', { class: 'best-line' });
  const newBest = el('div', { class: 'newbest', text: 'NEW BEST!' });
  const againBtn = el('button', { class: 'btn', text: 'Play again' });
  againBtn.addEventListener('click', () => handlers.onRestart());
  const overScreen = el('div', { class: 'screen', id: 'gameover' },
    overTitle, overSub,
    el('div', { class: 'score-grid' },
      el('div', { class: 'score-card' }, overCoins, el('div', { class: 'score-name', text: 'Coins' })),
      el('div', { class: 'score-card' }, overServed, el('div', { class: 'score-name', text: 'Served' })),
    ),
    overBest,
    newBest,
    againBtn,
  );

  const paused = el('div', { id: 'paused' }, 'PAUSED');

  root.append(title, hud, hint, toasts, stick, overScreen, paused);

  // =========================================================================
  // Joystick input — pointer drag anywhere on the LEFT half of the screen.
  // =========================================================================
  const STICK_R = 52;
  let stickId = null;
  let baseX = 0;
  let baseY = 0;

  function stickMove(dx, dy) {
    const len = Math.hypot(dx, dy);
    const clamped = len > STICK_R ? STICK_R / len : 1;
    knob.style.transform = `translate(${dx * clamped}px, ${dy * clamped}px)`;
    // small dead zone so a resting thumb doesn't creep
    const nx = (dx * clamped) / STICK_R;
    const ny = (dy * clamped) / STICK_R;
    const mag = Math.hypot(nx, ny);
    if (mag < 0.14) {
      joystick.x = 0;
      joystick.y = 0;
    } else {
      joystick.x = nx;
      joystick.y = ny;
    }
  }

  function stickEnd() {
    stickId = null;
    stick.classList.remove('on');
    stick.style.left = '-999px';
    knob.style.transform = 'translate(0,0)';
    joystick.x = 0;
    joystick.y = 0;
  }

  window.addEventListener('pointerdown', (e) => {
    if (e.clientX > window.innerWidth / 2) return;
    if (stickId !== null) return;
    stickId = e.pointerId;
    baseX = e.clientX;
    baseY = e.clientY;
    stick.style.left = `${baseX}px`;
    stick.style.top = `${baseY}px`;
    stick.classList.add('on');
    stickMove(0, 0);
    e.preventDefault();
  }, { passive: false });

  window.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    stickMove(e.clientX - baseX, e.clientY - baseY);
    e.preventDefault();
  }, { passive: false });

  window.addEventListener('pointerup', (e) => {
    if (e.pointerId === stickId) stickEnd();
  });
  window.addEventListener('pointercancel', (e) => {
    if (e.pointerId === stickId) stickEnd();
  });

  // =========================================================================
  // Public API
  // =========================================================================
  let slots = [];

  return {
    /** Joystick vector: x = strafe, y = forward (screen down = +y). */
    joystick,

    setBest(best) {
      bestLine.textContent = best.coins > 0
        ? `Best: ${best.coins} coins · ${best.served} customers`
        : 'No rounds played yet';
    },

    showTitle(show) {
      title.classList.toggle('show', show);
    },

    showHud(show) {
      hud.classList.toggle('show', show);
    },

    showGameOver(summary) {
      overCoins.textContent = summary.coins;
      overServed.textContent = summary.served;
      overBest.textContent = `Best: ${summary.best.coins} coins · ${summary.best.served} served`;
      newBest.style.display = summary.isBest ? '' : 'none';
      overScreen.classList.add('show');
    },

    hideGameOver() {
      overScreen.classList.remove('show');
    },

    setPaused(on) {
      paused.classList.toggle('show', on);
    },

    updateHUD({ coins, served, lives, level }) {
      coinsStat.textContent = coins;
      servedStat.textContent = served;
      levelStat.textContent = `LEVEL ${level}`;
      hearts.textContent = '';
      for (let i = 0; i < CONFIG.game.lives; i++) {
        hearts.appendChild(el('span', {
          class: i < lives ? '' : 'heart-off',
          text: '♥',
        }));
      }
    },

    /** Draw the three carry slots. `stack` is bottom-first. */
    setCarry(stack) {
      if (slots.length !== CONFIG.player.carryLimit) {
        carry.textContent = '';
        slots = [];
        for (let i = 0; i < CONFIG.player.carryLimit; i++) {
          const s = el('div', { class: 'slot' });
          slots.push(s);
          carry.appendChild(s);
        }
      }
      slots.forEach((s, i) => {
        const dishId = stack[i];
        if (!dishId) {
          s.className = 'slot';
          s.textContent = '';
          return;
        }
        const d = CONFIG.dishes[dishId];
        s.className = 'slot filled' + (i === stack.length - 1 ? ' top' : '');
        s.textContent = d.short || d.label.slice(0, 6).toUpperCase();
        s.style.background = hexCss(d.color);
      });
    },

    /** Contextual hint under the HUD. */
    setHint(html) {
      if (!html) {
        hint.classList.remove('show');
        return;
      }
      hint.innerHTML = html;
      hint.classList.add('show');
    },

    /** Floating text: {text, kind} where kind is 'coin' | 'bad' | 'good'. */
    toast(text, kind = 'coin') {
      const t = el('div', { class: `toast ${kind}`, text });
      toasts.appendChild(t);
      setTimeout(() => t.remove(), 1100);
    },

    setMuteIcon(muted) {
      muteBtn.textContent = muted ? ICONS.off : ICONS.on;
    },
  };
}

// config colours are 0xRRGGBB numbers; CSS wants #rrggbb
function hexCss(value) {
  if (typeof value === 'string') return value;
  return '#' + (value >>> 0).toString(16).slice(-6).padStart(6, '0');
}