// ---------------------------------------------------------------------------
// ui.js — all the HTML/CSS overlays: title, HUD, game-over, toast messages and
// the touch joystick. The DOM is created here so index.html stays tiny.
//
// The joystick is a plain pointer-drag on the left half of the screen; on
// desktop the same vector is fed by WASD / arrow keys from main.js.
// ---------------------------------------------------------------------------

import { CONFIG } from './config.js';
import { drawDishIcon } from './scene.js';

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
  font-size: clamp(17px, 2.8vw, 27px); letter-spacing: .26em;
  color: #ffd9a0; margin: 14px 0 4px; text-transform: uppercase;
}
.title-note {
  font-size: clamp(14px, 2.4vw, 19px); color: #e2d0b2; max-width: 40ch;
  line-height: 1.55; margin: 10px 0 4px;
}
.best-line { font-size: clamp(15px, 1.9vw, 20px); font-weight: 600; color: #ffe6b8; margin-top: 8px; letter-spacing: .03em; }

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
  font-size: clamp(14px, 1.9vw, 19px); padding: clamp(11px, 1.4vw, 15px) clamp(20px, 2.4vw, 28px);
  margin-top: 14px;
}
.btn.ghost:active { transform: translateY(2px); }

/* ---------------------------------------------------------------- HUD */
#hud {
  position: absolute; top: 0; left: 0; right: 0;
  display: flex; gap: 8px; align-items: flex-start; justify-content: space-between;
  padding: clamp(7px, 2.2vw, 12px) clamp(8px, 2.4vw, 14px);
  opacity: 0; transition: opacity .3s ease;
}
#hud.show { opacity: 1; }
.hud-left {
  display: flex; flex-direction: column; align-items: flex-start;
  gap: clamp(5px, 0.9vw, 9px);
}
.hud-panel {
  background: rgba(12,9,6,.55);
  border: 2px solid rgba(253,243,216,.18);
  border-radius: 12px;
  padding: clamp(5px, 1.6vw, 8px) clamp(7px, 2.2vw, 12px);
  backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
  display: flex; flex-direction: column; gap: 2px;
}
/* Readability targets, in CSS px as actually rendered:
     numbers  >= 18px   |   labels / signs  >= 14px   |   order text >= 16px
   Every size below is clamp()-ed off the viewport so a 390px phone and a
   1366px laptop both land above those floors. */
.hud-stat { font-size: clamp(19px, 3.4vw, 30px); font-weight: 800; line-height: 1.1; }
.hud-label {
  font-size: clamp(14px, 1.5vw, 17px); font-weight: 700;
  letter-spacing: .16em; color: #ddc9a6; text-transform: uppercase;
}
.hud-right { display: flex; gap: 8px; align-items: flex-start; }
#hearts { font-size: clamp(22px, 3vw, 32px); letter-spacing: 4px; }
.heart-off { opacity: .22; }
/* Signed-in player, tucked under LEVEL. Deliberately quiet. */
#hud-player {
  margin-top: 3px; font-family: var(--font); font-weight: 700;
  font-size: clamp(12px, 1.3vw, 14px); letter-spacing: .04em;
  color: #ddc9a6; max-width: 22ch; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
#hud-player[hidden] { display: none; }

/* --- carry tray: deliberately TINY -------------------------------------
   Three icon slots plus DROP, sized to stay out of the game's way. It used to
   be a 92px-wide slot per plate, which on a phone pushed the whole left side
   of the counter behind the HUD.

   The dish NAMES moved out of here on purpose: at a 42px slot a seven-letter
   name like CHAPMAN cannot be drawn at a readable size — it truncates to
   "CHAP…". Each slot is now the dish's colour-coded ICON (already distinct per
   dish), with the name kept in the slot's tooltip and, at full readable size,
   on the hint bar which already lists everything you are carrying.
   DROP is the only tappable control here and it keeps a 48px invisible hit
   area even though the button itself is ~30px. */
#carrybar {
  display: flex; align-items: center; gap: 8px;
  background: rgba(12,9,6,.55);
  border: 2px solid rgba(253,243,216,.18);
  border-radius: 10px;
  padding: 4px 6px;
  backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
}
#carry { display: flex; gap: 3px; align-items: stretch; }
.slot {
  width: 42px; height: 42px; border-radius: 8px;
  border: 2px dashed rgba(253,243,216,.34);
  display: flex; align-items: center; justify-content: center;
  padding: 2px;
  color: #241505; opacity: .3;
}
.slot.filled { opacity: 1; border-style: solid; border-color: rgba(0,0,0,.4); }
.slot.top { box-shadow: 0 0 0 2px var(--gold); }
.slot .icon {
  width: 30px; height: 30px;
  background-size: contain; background-repeat: no-repeat; background-position: center;
  filter: drop-shadow(0 1px 1px rgba(0,0,0,.35));
}
.slot .nm { display: none; }

/* DROP button — always available, essential on touch */
#drop {
  position: relative;
  pointer-events: auto; cursor: pointer;
  font-family: var(--font); font-weight: 900;
  font-size: clamp(12px, 1.1vw, 14px); letter-spacing: .06em;
  color: #2a1a10; background: #e8dcc4;
  border: 2px solid rgba(0,0,0,.35); border-radius: 8px;
  padding: 5px 9px;
  display: inline-flex; align-items: center; gap: 5px;
  transition: transform .08s ease, opacity .15s ease;
}
/* Invisible 48px touch target around a ~30px button. */
#drop::before {
  content: ''; position: absolute; left: 50%; top: 50%;
  width: 48px; height: 48px; margin: -24px 0 0 -24px;
}
#drop:active { transform: translateY(2px); }
#drop.empty { opacity: .35; }
#drop kbd {
  font-family: var(--font); font-size: 10px; font-weight: 900;
  background: rgba(0,0,0,.18); border-radius: 3px; padding: 1px 4px;
}

/* mute + hint */
#mute {
  pointer-events: auto; cursor: pointer;
  width: 40px; height: 40px; border-radius: 10px;
  background: rgba(12,9,6,.55); color: var(--cream);
  border: 2px solid rgba(253,243,216,.2);
  font-size: 18px; line-height: 1; display: flex; align-items: center; justify-content: center;
}
#hint {
  position: absolute; left: 50%; bottom: clamp(14px, 2.4vw, 22px); transform: translateX(-50%);
  background: rgba(12,9,6,.68); border: 2px solid rgba(253,243,216,.2);
  padding: clamp(8px, 1.2vw, 12px) clamp(14px, 2vw, 20px);
  border-radius: 22px;
  font-size: clamp(15px, 1.8vw, 21px); font-weight: 600; letter-spacing: .02em;
  opacity: 0; transition: opacity .25s ease;
  white-space: nowrap; text-align: center; max-width: 94vw;
}
#hint.show { opacity: 1; }
#hint b { color: var(--gold); font-weight: 900; }

/* toast: +8, WRONG DISH, etc. */
#toasts {
  position: absolute; left: 50%; top: 26%; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 6px;
}
.toast {
  font-weight: 900; font-size: clamp(26px, 5.6vw, 46px); letter-spacing: .04em;
  text-shadow: 0 3px 0 rgba(0,0,0,.55), 0 0 14px rgba(0,0,0,.5);
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
.over-sub { font-size: clamp(15px, 2.2vw, 21px); color: #eddcc0; letter-spacing: .14em; margin-bottom: 22px; }
.score-grid {
  display: grid; grid-template-columns: repeat(2, minmax(110px, 1fr));
  gap: 12px; margin-bottom: 6px;
}
.score-card {
  background: rgba(253,243,216,.08); border: 2px solid rgba(253,243,216,.18);
  border-radius: 14px; padding: 14px 18px;
}
.score-num { font-size: clamp(32px, 6vw, 52px); font-weight: 900; color: var(--gold); line-height: 1; }
.score-name { font-size: clamp(13px, 1.5vw, 16px); font-weight: 700; letter-spacing: .16em; color: #dcc8a4; text-transform: uppercase; }
.newbest {
  margin-top: 16px; color: var(--gold); font-weight: 900;
  letter-spacing: .2em; font-size: clamp(16px, 1.8vw, 20px);
  animation: pulse 1s ease-in-out infinite alternate;
}
@keyframes pulse { from { opacity: .6 } to { opacity: 1 } }

/* --------------------------------------------------------------- paused */
#paused {
  position: absolute; inset: 0; display: none;
  align-items: center; justify-content: center; flex-direction: column;
  background: rgba(10,8,6,.72);
  font-size: clamp(20px, 3vw, 32px); font-weight: 800; letter-spacing: .24em;
}
#paused.show { display: flex; }

/* --------------------------------------------------------- start.ng pieces
   Deliberately small and out of the way: the player chip is a single pill under
   the title, and the leaderboard is its own screen so it never covers play. */
.chip-row { margin: 8px 0 2px; display: flex; justify-content: center; }
.title-actions {
  display: flex; flex-wrap: wrap; gap: 10px; justify-content: center;
  margin-top: 12px;
}
.title-actions .btn { margin-top: 0; }
#player-chip {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 5px 12px; border-radius: 999px;
  background: rgba(253,243,216,.10);
  border: 1px solid rgba(253,243,216,.22);
  font-family: var(--font);
}
.chip-name { font-size: 14px; font-weight: 800; color: var(--cream); }
.chip-account { font-size: 12px; color: #c9b28c; }
.chip-signin {
  font-family: var(--font); font-weight: 800; font-size: 12px;
  color: #2a1a10; background: var(--gold);
  border: 0; border-radius: 999px; padding: 4px 10px; cursor: pointer;
}
.chip-signin:hover { filter: brightness(1.08); }
.btn.small { font-size: 14px; padding: 8px 16px; margin-top: 10px; }

.over-rank {
  margin-top: 10px; font-family: var(--font); font-weight: 800;
  font-size: clamp(14px, 1.6vw, 17px); letter-spacing: .06em; color: var(--gold);
}
.over-rank:empty { display: none; }
.over-rank.invite { color: #c9b28c; font-weight: 600; letter-spacing: .02em; }

#board { z-index: 5; }
.board-title {
  font-family: var(--font); font-weight: 900;
  font-size: clamp(22px, 3vw, 30px); letter-spacing: .18em;
  color: var(--cream); margin-bottom: 14px;
}
#board-body {
  width: min(420px, 92vw); max-height: 52vh; overflow: auto;
  background: rgba(12,9,6,.62); border: 2px solid rgba(253,243,216,.18);
  border-radius: 14px; padding: 6px 0;
  font-family: var(--font);
}
#board-body .row {
  display: grid; grid-template-columns: 34px 1fr auto auto;
  gap: 10px; align-items: center;
  padding: 7px 14px; font-size: 14px; color: #e8dcc4;
}
#board-body .row .rk { color: #c9b28c; font-weight: 800; text-align: right; }
#board-body .row .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#board-body .row .cs { font-weight: 800; color: var(--gold); }
#board-body .row .sv { color: #c9b28c; font-size: 13px; }
#board-body .row.me {
  background: rgba(242,177,52,.16);
  box-shadow: inset 0 0 0 1px rgba(242,177,52,.5);
  border-radius: 8px;
}
#board-body .note { padding: 12px 14px; font-size: 13px; color: #c9b28c; }

/* ------------------------------------------------------------- narrow screens
   On a phone the counter sits across the top of the screen, so a top-left HUD
   panel covers the jollof sign. Move the carry tray down into the empty strip
   under the room and shrink it further, and let the hint wrap instead of
   running off the right edge. */
@media (max-width: 620px) {
  /* Stacked, the stats panel is a tall block sitting right on top of the
     back-wall heading. Laying it out as one row halves its height and keeps
     the counter area clear. */
  .hud-panel {
    flex-direction: row; align-items: center; gap: 14px;
    padding: 5px 10px;
  }
  #carrybar {
    position: fixed;
    left: clamp(8px, 2vw, 14px);
    bottom: clamp(8px, 1.5vh, 14px);
    gap: 7px;
    padding: 4px 6px;
  }
  #carrybar .slot { width: 36px; height: 36px; }
  #carrybar .slot .icon { width: 26px; height: 26px; }
  #drop { font-size: 12px; padding: 5px 8px; gap: 4px; }
  /* Sit ABOVE the tray rather than behind it. The hint's height varies with
     how much it has to say, so it is anchored by the tray's fixed 48px
     footprint instead of the two guessing at each other. */
  #hint {
    white-space: normal;
    bottom: 66px;
    font-size: 14px;
    line-height: 1.3;
  }
  .toast { font-size: 30px; }
}
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
 * @param {function} handlers.onDrop        DROP button / binners the top plate
 * @param {function} handlers.onSignIn      start.ng sign-in
 * @param {function} handlers.onShowBoard   open the start.ng leaderboard
 * @param {function} handlers.onHideBoard   close the leaderboard
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

  // --- start.ng player chip -----------------------------------------------
  // Small and out of the way: the character's name, their @account when they are
  // signed in, and a Sign in button for guests (hidden if they chose guest).
  const playerName = el('span', { class: 'chip-name', text: 'Guest' });
  const playerAccount = el('span', { class: 'chip-account', text: 'Not signed in' });
  const signInBtn = el('button', { class: 'chip-signin', text: 'Sign in' });
  signInBtn.addEventListener('click', () => handlers.onSignIn());
  const playerChip = el('div', { id: 'player-chip' },
    playerName, playerAccount, signInBtn);
  const chipRow = el('div', { class: 'chip-row' }, playerChip);

  const boardBtn = el('button', { class: 'btn ghost small', text: 'Leaderboard' });
  boardBtn.addEventListener('click', () => handlers.onShowBoard());
  // Play / Shuffle / Leaderboard sit in one row so the title fits a 768px
  // laptop screen without the last button falling off the bottom.
  const titleActions = el('div', { class: 'title-actions' }, titleBtn, shuffleBtn, boardBtn);
  const title = el('div', { class: 'screen show', id: 'title' },
    el('h1', { class: 'title-main', text: 'MAMI' }),
    el('div', { class: 'title-sub', text: "Naija buka rush" }),
    chipRow,
    el('p', { class: 'title-note' },
      "You are the only server in Mami's buka. Carry three plates at once, ",
      'run the room, and keep everyone happy before their patience runs out.'),
    el('div', { class: 'title-note' },
      'Desktop: WASD / arrows to move. Touch: drag on the left side.'),
    bestLine,
    titleActions,
  );
  titleBtn.addEventListener('click', () => handlers.onPlay());
  shuffleBtn.addEventListener('click', () => handlers.onShuffle());

  // ------------------------------------------------------------------ HUD
  const coinsStat = el('div', { class: 'hud-stat', text: '0' });
  const servedStat = el('div', { class: 'hud-stat', text: '0' });
  const hearts = el('div', { id: 'hearts' });
  const levelStat = el('div', { class: 'hud-label', text: 'LEVEL 1' });
  const carry = el('div', { id: 'carry' });
  // Declared with the other HUD nodes but placed in the right panel below.
  let hudName;

  // DROP button: binners the top plate. Always on screen so touch players get
  // an explicit way to get rid of the plate they do not want.
  const dropBtn = el('div', { id: 'drop', class: 'empty', title: 'Drop the top plate' },
    el('span', { text: 'DROP' }), el('kbd', { text: 'Q' }));
  dropBtn.addEventListener('click', () => handlers.onDrop());

  const statsPanel = el('div', { class: 'hud-panel' },
    el('div', {},
      el('div', { class: 'hud-label', text: 'Coins' }), coinsStat),
    el('div', {},
      el('div', { class: 'hud-label', text: 'Served' }), servedStat),
  );

  // Carry slots + DROP sit in their own bar, stacked under the stats on wide
  // screens. On a narrow screen the media query below moves this bar down to
  // the empty strip under the room, so it stops covering the counter.
  const carryBar = el('div', { id: 'carrybar' }, carry, dropBtn);
  const left = el('div', { class: 'hud-left' }, statsPanel, carryBar);
  const muteBtn = el('div', { id: 'mute', title: 'Mute' }, ICONS.on);
  muteBtn.addEventListener('click', () => {
    const muted = handlers.onMute();
    muteBtn.textContent = muted ? ICONS.off : ICONS.on;
  });
  const right = el('div', { class: 'hud-right' },
    el('div', { class: 'hud-panel' },
      hearts, levelStat,
      // Who you are, for a signed-in player. Hidden for guests — the title
      // screen already says Guest, and this is play, not menus.
      hudName = el('div', { id: 'hud-player', hidden: true }),
    ),
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
  // start.ng: rank after saving, or a short nudge for guests.
  const overRank = el('div', { class: 'over-rank' });
  const againBtn = el('button', { class: 'btn', text: 'Play again' });
  againBtn.addEventListener('click', () => handlers.onRestart());
  const overBoardBtn = el('button', { class: 'btn ghost small', text: 'Leaderboard' });
  overBoardBtn.addEventListener('click', () => handlers.onShowBoard());
  const overSignInBtn = el('button', { class: 'btn ghost small', text: 'Sign in to save your score' });
  overSignInBtn.addEventListener('click', () => handlers.onSignIn());
  const overScreen = el('div', { class: 'screen', id: 'gameover' },
    overTitle, overSub,
    el('div', { class: 'score-grid' },
      el('div', { class: 'score-card' }, overCoins, el('div', { class: 'score-name', text: 'Coins' })),
      el('div', { class: 'score-card' }, overServed, el('div', { class: 'score-name', text: 'Served' })),
    ),
    overBest,
    newBest,
    overRank,
    againBtn,
    overBoardBtn,
    overSignInBtn,
  );

  // ---------------------------------------------------------- leaderboard
  const boardBody = el('div', { id: 'board-body' });
  const boardBackBtn = el('button', { class: 'btn ghost', text: 'Back' });
  boardBackBtn.addEventListener('click', () => handlers.onHideBoard());
  const boardScreen = el('div', { class: 'screen', id: 'board' },
    el('h2', { class: 'board-title', text: 'Top servers' }),
    boardBody,
    boardBackBtn,
  );

  const paused = el('div', { id: 'paused' }, 'PAUSED');

  root.append(title, hud, hint, toasts, stick, overScreen, boardScreen, paused);

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

    // --- start.ng -------------------------------------------------------
    /** Show the player's start.ng name / @account, and a sign-in for guests. */
    setPlayer(user, { guestByChoice = false } = {}) {
      playerName.textContent = user.name || 'Guest';
      playerAccount.textContent = user.isGuest
        ? (guestByChoice ? 'Playing as a guest' : 'Not signed in')
        : (user.account ? `@${user.account}` : 'Signed in');
      // Show Sign in only to a guest who has NOT already chosen to play as one.
      signInBtn.hidden = !user.isGuest || guestByChoice;
      // Shuffling your look is a DEBUG affordance only. In a real game the server is
      // the player's own start.ng character, so there is nothing to shuffle.
      shuffleBtn.hidden = !CONFIG.debugMode;
    },

    /**
     * The signed-in player's name and @account, small, in the HUD.
     * Hidden entirely for guests — nothing to show and less clutter mid-round.
     */
    setHudPlayer(user) {
      if (!hudName) return;
      const signedIn = !user.isGuest;
      hudName.hidden = !signedIn;
      if (!signedIn) {
        hudName.textContent = '';
        return;
      }
      hudName.textContent = user.account ? `${user.name || 'Player'}  @${user.account}` : (user.name || 'Player');
      hudName.title = 'Signed in with start.ng';
    },

    /**
     * Line under the game-over scores.
     * @param {{rank:number, best:number, improved:boolean}|null} result
     * @param {boolean} canSave  false for guests → show the invitation instead
     * @param {boolean} guestByChoice
     */
    setRank(result, canSave, guestByChoice) {
      if (canSave && result) {
        overRank.classList.remove('invite');
        overRank.textContent = result.improved
          ? `New start.ng best — you're #${result.rank}!`
          : `Saved to start.ng — you're #${result.rank}`;
      } else if (canSave) {
        // Signed in, but start.ng never answered (or we are off start.ng).
        overRank.classList.remove('invite');
        overRank.textContent = 'Played offline — score not sent';
      } else if (guestByChoice) {
        overRank.classList.remove('invite');
        overRank.textContent = '';
      } else {
        overRank.classList.add('invite');
        overRank.textContent = 'Sign in to start.ng to save your best score';
      }
      // A signed-in player never needs the button; a guest gets it (unless
      // they deliberately chose to play as a guest, in which case we say
      // nothing at all).
      overSignInBtn.hidden = canSave || guestByChoice;
    },

    /**
     * Top-10 board. `myId` highlights the player's own row.
     * @param {Array<object>|null} entries  null when start.ng did not answer
     */
    showBoard(entries, myId) {
      boardBody.textContent = '';
      if (!entries) {
        boardBody.append(el('div', { class: 'note', text: 'The start.ng leaderboard is not available here.' }));
      } else if (!entries.length) {
        boardBody.append(el('div', { class: 'note', text: 'No scores yet. Be the first.' }));
      } else {
        for (const e of entries) {
          const mine = myId != null && e.player_id === myId;
          boardBody.append(el('div', { class: mine ? 'row me' : 'row' },
            el('div', { class: 'rk', text: `#${e.rank}` }),
            el('div', { class: 'nm', text: e.name || 'Guest' }),
            el('div', { class: 'cs', text: String(e.stats?.coins ?? e.score ?? 0) }),
            el('div', { class: 'sv', text: `${e.stats?.served ?? 0} served` }),
          ));
        }
      }
      boardScreen.classList.add('show');
    },

    hideBoard() {
      boardScreen.classList.remove('show');
    },

    isBoardOpen() {
      return boardScreen.classList.contains('show');
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

    /** Draw the carry slots: dish icon + dish name, bottom-first. */
    setCarry(stack) {
      if (slots.length !== CONFIG.player.carryLimit) {
        carry.textContent = '';
        slots = [];
        for (let i = 0; i < CONFIG.player.carryLimit; i++) {
          const s = el('div', { class: 'slot' },
            el('div', { class: 'icon' }),
            el('div', { class: 'nm' }));
          slots.push(s);
          carry.appendChild(s);
        }
      }
      slots.forEach((s, i) => {
        const dishId = stack[i];
        if (!dishId || !CONFIG.dishes[dishId]) {
          s.className = 'slot';
          return;
        }
        const d = CONFIG.dishes[dishId];
        s.className = 'slot filled' + (i === stack.length - 1 ? ' top' : '');
        s.style.background = hexCss(d.color);
        s.children[0].style.backgroundImage = `url(${dishIconDataUrl(dishId)})`;
        s.children[1].textContent = d.short || d.name.slice(0, 7).toUpperCase();
        // The slot is icon-only now (see the CSS), so the name lives here for
        // mouse users and in the hint bar for everyone else.
        s.title = d.name + (i === stack.length - 1 ? ' (top of stack)' : '');
      });
      // grey the DROP button out when there is nothing to drop
      dropBtn.className = stack.length ? '' : 'empty';
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

// Small square PNG of a dish icon, for the carry slots. Cached per dish.
const iconUrlCache = new Map();
function dishIconDataUrl(dishId, px = 64) {
  if (iconUrlCache.has(dishId)) return iconUrlCache.get(dishId);
  const d = CONFIG.dishes[dishId];
  if (!d) return '';
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  const ctx = c.getContext('2d');
  // pad the glyph so it does not touch the tile edges
  drawDishIcon(ctx, d.icon, px / 2, px / 2, px * 0.46);
  const url = c.toDataURL('image/png');
  iconUrlCache.set(dishId, url);
  return url;
}