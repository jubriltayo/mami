// ---------------------------------------------------------------------------
// platform.js — the ONLY bridge between the game and start.ng.
//
// For now it is a guest-only stub. The game code never touches anything else,
// so swapping in the real start.ng user service later means replacing this file
// and nothing else.
// ---------------------------------------------------------------------------

// Default look for a brand new guest (also used as the fallback style).
const GUEST_STYLE = {
  body: 'female',
  primaryColor: '#e2564a',
  secondaryColor: '#f6efdd',
  skinColor: '#8d5a2b',
  hairColor: '#2b1a12',
  hair: 'bun',
  hat: 'none',
  accessory: 'earrings',
};

// A fake signed-in guest. `isGuest` is true so we know there's no real account.
const guestUser = {
  isGuest: true,
  id: 'guest',
  name: 'Guest',
  style: GUEST_STYLE,
};

// Local "current user" so the title screen's randomise button survives reloads.
const STORAGE_KEY = 'mami.style';

// Every registered onUserChange listener.
const listeners = [];

function emit() {
  for (const fn of listeners) {
    try {
      fn(getCurrentUser());
    } catch (err) {
      console.error('[platform] onUserChange listener threw', err);
    }
  }
}

let user = loadGuest();

function loadGuest() {
  // Try to remember a look the player picked on the title screen.
  let style = { ...GUEST_STYLE };
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) style = { ...style, ...JSON.parse(saved) };
  } catch (err) {
    // Private mode / disabled storage — the default look is fine.
  }
  return { ...guestUser, style };
}

/** The user object: { isGuest, id, name, style } */
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

/** Sign in. Does nothing yet — start.ng will own this later. */
export function signIn() {
  // TODO(start.ng): hand off to the real auth flow.
  return Promise.resolve(user);
}

// --- Guest-only extras used by the title screen. Not part of the game API. ---

/** Replace the guest's look and notify listeners. */
export function setGuestStyle(patch) {
  user = { ...user, style: { ...user.style, ...patch } };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user.style));
  } catch (err) {
    /* storage unavailable, look still applies for this session */
  }
  emit();
  return user;
}