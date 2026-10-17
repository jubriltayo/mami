// ---------------------------------------------------------------------------
// audio.js — every sound is synthesised with the Web Audio API.
// No sample files. The context is only created/resumed after the first user
// gesture, which is what browsers require.
// ---------------------------------------------------------------------------

import { CONFIG } from './config.js';

let ctx = null;
let master = null;
let muted = CONFIG.audio.muted;
let started = false;

function ensureContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : CONFIG.audio.masterVolume;
    // A gentle low-pass keeps the synth from sounding harsh on phone speakers.
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'lowpass';
    shelf.frequency.value = 9000;
    master.connect(shelf);
    shelf.connect(ctx.destination);
  } catch (err) {
    // No audio device / blocked context: the game must still run silently.
    console.warn('[audio] unavailable, running silent', err);
    ctx = null;
    master = null;
  }
  return ctx;
}

/** Call from a real user gesture (click / key / touch) to start audio. */
export function start() {
  const c = ensureContext();
  if (!c) return;
  if (c.state === 'suspended') c.resume();
  started = true;
}

export function isStarted() {
  return started;
}

export function setMuted(v) {
  muted = !!v;
  if (master) master.gain.value = muted ? 0 : CONFIG.audio.masterVolume;
  return muted;
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  return setMuted(!muted);
}

// --- building blocks -------------------------------------------------------

/** One shaped oscillator note. */
function tone({ freq = 440, to = null, dur = 0.15, type = 'sine', gain = 0.3, delay = 0, attack = 0.01 }) {
  const c = ensureContext();
  if (!c || muted) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** A short burst of filtered noise (stomp, sizzle, thud). */
function noise({ dur = 0.2, gain = 0.3, freq = 800, type = 'lowpass', delay = 0, sweepTo = null }) {
  const c = ensureContext();
  if (!c || muted) return;
  const t0 = c.currentTime + delay;
  const frames = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    // fade the noise out so it doesn't click
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = type;
  filt.frequency.setValueAtTime(freq, t0);
  if (sweepTo !== null) filt.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt);
  filt.connect(g);
  g.connect(master);
  src.start(t0);
}

// ===========================================================================
// The sounds
// ===========================================================================

export const sfx = {
  /** Plate lifted off a station: quick wooden "tok". */
  pickup() {
    tone({ freq: 520, to: 880, dur: 0.1, type: 'triangle', gain: 0.22 });
    noise({ dur: 0.06, gain: 0.1, freq: 2400, type: 'bandpass' });
  },

  /** Dish landed on the stack. */
  stack() {
    tone({ freq: 300, to: 460, dur: 0.08, type: 'square', gain: 0.1 });
  },

  /** Right dish handed over: warm two-note. */
  serve() {
    tone({ freq: 523, dur: 0.1, type: 'sine', gain: 0.22 });
    tone({ freq: 784, dur: 0.16, type: 'sine', gain: 0.2, delay: 0.08 });
  },

  /** Coins in the tin. */
  coin() {
    tone({ freq: 1180, dur: 0.06, type: 'square', gain: 0.1 });
    tone({ freq: 1560, dur: 0.1, type: 'square', gain: 0.09, delay: 0.05 });
    tone({ freq: 2100, dur: 0.14, type: 'square', gain: 0.07, delay: 0.1 });
  },

  /** Wrong dish: a short buzz. */
  wrong() {
    tone({ freq: 220, to: 150, dur: 0.16, type: 'sawtooth', gain: 0.12 });
  },

  /** An angry customer stomping out. */
  angry() {
    noise({ dur: 0.28, gain: 0.42, freq: 420, sweepTo: 90 });
    tone({ freq: 140, to: 55, dur: 0.35, type: 'sawtooth', gain: 0.22 });
    noise({ dur: 0.22, gain: 0.3, freq: 300, sweepTo: 70, delay: 0.22 });
  },

  /** A life lost. */
  loseLife() {
    tone({ freq: 330, dur: 0.18, type: 'triangle', gain: 0.2 });
    tone({ freq: 247, dur: 0.3, type: 'triangle', gain: 0.2, delay: 0.16 });
  },

  /** Round over: sad little descending tune. */
  gameOver() {
    const notes = [523, 440, 349, 262];
    notes.forEach((f, i) => {
      tone({ freq: f, dur: 0.42, type: 'triangle', gain: 0.22, delay: i * 0.22 });
    });
    tone({ freq: 98, dur: 1.2, type: 'sine', gain: 0.18, delay: 0.7 });
  },

  /** UI click. */
  click() {
    tone({ freq: 660, dur: 0.05, type: 'square', gain: 0.1 });
  },

  /** Station selection cycled. */
  cycle() {
    tone({ freq: 400, to: 620, dur: 0.07, type: 'triangle', gain: 0.14 });
  },

  /** A customer walked in (soft door chime-ish blip). */
  arrive() {
    tone({ freq: 880, dur: 0.09, type: 'sine', gain: 0.07 });
    tone({ freq: 1174, dur: 0.12, type: 'sine', gain: 0.05, delay: 0.07 });
  },

  /** A new dish just unlocked on the menu: bright rising arpeggio. */
  unlock() {
    [523, 659, 784, 1047].forEach((f, i) => {
      tone({ freq: f, dur: 0.16, type: 'triangle', gain: 0.16, delay: i * 0.075 });
    });
  },

  /** A plate binned / dropped: short dull thud. */
  bin() {
    tone({ freq: 180, to: 90, dur: 0.16, type: 'square', gain: 0.14 });
    noise({ dur: 0.12, gain: 0.12, freq: 700, sweepTo: 160 });
  },
};