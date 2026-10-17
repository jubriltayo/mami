// ---------------------------------------------------------------------------
// platform.js — the ONLY bridge between the game and start.ng.
//
// start.ng owns sign-in, the player's character and the leaderboard. We talk to
// it through its hidden connect page (`https://start.ng/connect`) with
// postMessage, exactly as https://start.ng/docs.md describes.
//
// The game code only ever uses getCurrentUser / onUserChange / signIn (plus
// saveScore and fetchLeaderboard), so everything start.ng-specific lives here.
//
// Three rules this file never breaks:
//   1. start.ng not answering means "no answer", NOT "signed out". A timeout
//      leaves the player as a guest and never logs an error.
//   2. Off a *.start.ng address (localhost, a file:// page, a LAN preview) we
//      never even create the iframe. The game plays exactly the same.
//   3. Scores are never sent in ?test=1 or ?debug=1, because those runs are
//      automated and must not touch a real player's leaderboard.
// ---------------------------------------------------------------------------

import { CONFIG } from './config.js';
import { normaliseStyle, DEFAULT_STYLE } from './character.js';

const START_NG = 'https://start.ng';

// start.ng only answers games served from a *.start.ng address. Everywhere else
// — localhost, a LAN IP, file:// — we stay guest-only and never load the frame,
// so a local preview produces no console errors and no stray requests.
const ON_START_NG = /\.start\.ng$/.test(location.hostname);

// The start.ng homepage sends signed-out players here with ?guest when they
// choose to play without an account. Then we must not nag them to sign in.
const GUEST_BY_CHOICE = new URLSearchParams(location.search).has('guest');

// How long to wait for a reply before deciding start.ng had nothing to say.
// The docs use 5s. A short wait keeps the title screen responsive; a long one
// would leave the player staring at a guest look for longer than necessary.
const REPLY_TIMEOUT_MS = 4000;

// Every registered onUserChange listener.
const listeners = [];

function emit() {
  const current = getCurrentUser();
  for (const fn of listeners) {
    try {
      fn(current);
    } catch (err) {
      console.error('[platform] onUserChange listener threw', err);
    }
  }
}

// ---------------------------------------------------------------------------
// The connect page
// ---------------------------------------------------------------------------

let framePromise = null;

function connectFrame() {
  framePromise ??= new Promise((resolve, reject) => {
    const el = document.createElement('iframe');
    el.src = `${START_NG}/connect`;
    el.hidden = true;
    el.onload = () => resolve(el);
    el.onerror = reject;
    document.body.append(el);
  });
  return framePromise;
}

/**
 * Send a message to start.ng and resolve to its reply, or null if it did not
 * answer in time.
 *
 * Every reply is checked against e.origin, e.source AND our requestId before it
 * is believed. Checking origin is what makes the reply trustworthy; the
 * requestId stops a slow answer to an earlier question being mistaken for this
 * one; the source check stops another frame on the page answering for it.
 */
async function askStartNg(message, replyType, timeoutMs = REPLY_TIMEOUT_MS) {
  if (!ON_START_NG) return null;
  let el;
  try {
    el = await connectFrame();
  } catch {
    return null;
  }
  return new Promise((resolve) => {
    const requestId = Math.random().toString(36).slice(2);
    const done = (reply) => {
      clearTimeout(timer);
      removeEventListener('message', onMessage);
      resolve(reply);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    function onMessage(e) {
      if (e.origin !== START_NG || e.source !== el.contentWindow) return;
      if (e.data?.type === replyType && e.data.requestId === requestId) done(e.data);
    }
    addEventListener('message', onMessage);
    try {
      el.contentWindow.postMessage({ ...message, requestId }, START_NG);
    } catch {
      done(null);
    }
  });
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

let user = null;

function guestUser(style) {
  return {
    isGuest: true,
    id: null,
    name: 'Guest',
    account: null,
    face: null,
    style,
  };
}

/**
 * Who the player is when start.ng has not answered — localhost, a file:// page,
 * or start.ng simply being down. The built-in default look, named Guest.
 *
 * Note this is NOT a random look and NOT a remembered one: the player is
 * whoever start.ng says they are, and when start.ng cannot be asked there is
 * nobody to be, so it is the default.
 */
function offlineUser() {
  return guestUser(normaliseStyle(DEFAULT_STYLE));
}

user = offlineUser();

/** The user object: { isGuest, id, name, account, face, style } */
export function getCurrentUser() {
  return user;
}

/** Subscribe to user changes. Returns an unsubscribe function. */
export function onUserChange(fn) {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

/** True when the player arrived as a guest on purpose, so we must not nag. */
export function isGuestByChoice() {
  return GUEST_BY_CHOICE;
}

/** True when this page is actually hosted on start.ng. */
export function isOnStartNg() {
  return ON_START_NG;
}

/**
 * Ask start.ng who is playing and adopt the answer.
 *
 * `reply.user` is the signed-in player; `reply.guest` is start.ng's own guest
 * look. If neither, or if nothing answers at all, we stay a guest. A missing
 * answer is never treated as "signed out" — it just means we could not ask.
 */
export async function refreshUser() {
  const reply = await askStartNg({ type: 'startng:whoami' }, 'startng:user');
  const player = reply?.user ?? reply?.guest ?? null;
  if (!player) return getCurrentUser();

  const isGuest = !reply.user;
  const next = {
    isGuest,
    id: isGuest ? null : (player.id ?? null),
    name: player.name || 'Guest',
    account: isGuest ? null : (player.account ?? null),
    face: player.face ?? null,
    // normaliseStyle fills in anything missing or unrecognised, so a start.ng
    // style we do not understand yet can never break the character builder.
    style: normaliseStyle(player.style),
  };

  const changed = !user
    || user.id !== next.id
    || user.name !== next.name
    || JSON.stringify(user.style) !== JSON.stringify(next.style);
  user = next;
  if (changed) emit();
  return user;
}

/** Ask once on load, and again whenever the player comes back to the tab. */
export function startUserService() {
  if (!ON_START_NG) return;
  refreshUser().catch(() => {});

  // They may have signed in or out on start.ng in another tab.
  const recheck = () => {
    if (document.visibilityState === 'hidden') return;
    refreshUser().catch(() => {});
  };
  document.addEventListener('visibilitychange', recheck);
  addEventListener('focus', recheck);
}

/**
 * Sign in: send the player to start.ng with a link back to this game, exactly
 * as the docs describe. start.ng signs them in and returns them here.
 */
export function signIn() {
  location.href = `${START_NG}/?return_to=${encodeURIComponent(location.origin + location.pathname)}`;
  return Promise.resolve(user);
}

// ---------------------------------------------------------------------------
// Scores and leaderboard
// ---------------------------------------------------------------------------

// Scores are NEVER sent from a test or debug run: those are automated sessions
// and must not write to a real player's start.ng leaderboard.
function scoresAllowed() {
  return ON_START_NG && !CONFIG.testMode && !CONFIG.debugMode;
}

/**
 * Save a finished run. `stats` must be exactly the columns in startng.json,
 * each a whole number.
 *
 * Never blocks gameplay: this resolves to null on any failure, and callers are
 * expected to treat that as "nothing to show" rather than an error.
 *
 * @returns {Promise<null | {rank:number, best:number, improved:boolean}>}
 */
export async function saveScore(stats) {
  if (!scoresAllowed() || user?.isGuest) return null;
  const reply = await askStartNg(
    { type: 'startng:score', stats },
    'startng:scoreSaved',
  );
  if (!reply || reply.ok !== true || !reply.result) return null;
  const { rank, best, improved } = reply.result;
  if (typeof rank !== 'number') return null;
  return {
    rank,
    best: typeof best === 'number' ? best : 0,
    improved: improved === true,
  };
}

/**
 * Read the top of the leaderboard. Works for guests too.
 * @returns {Promise<Array<object>|null>} null if start.ng did not answer.
 */
export async function fetchLeaderboard(limit = 10) {
  const reply = await askStartNg(
    { type: 'startng:leaderboard', limit },
    'startng:leaderboardData',
  );
  if (!reply || reply.ok !== true || !Array.isArray(reply.entries)) return null;
  return reply.entries;
}

// --- Guest-only extras. Not part of the game API, and not reachable in normal
// --- play: the "Shuffle my look" button only exists under ?debug=1, because in
// --- a real game the server's look IS the player's start.ng character.

/** Replace the guest's look and notify listeners. Debug/shuffle use only. */
export function setGuestStyle(patch) {
  // Only meaningful while there is no real account to look after.
  if (!user.isGuest) return user;
  user = guestUser(normaliseStyle({ ...user.style, ...patch }));
  emit();
  return user;
}