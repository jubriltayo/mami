# MAMI — Naija buka rush

A low-poly 3D arcade game built with three.js. You are the only server in a
Nigerian *mami's buka* canteen: run the room, carry up to **three plates at
once**, and get everyone's order out before their patience runs out.

Everything is drawn from primitives in code — no models, no images, no fonts,
no build step, no network calls at runtime.

![MAMI's counter](cover.png)

---

## Run it

The game is plain ES modules, so it must be served over HTTP (opening
`index.html` from the filesystem will not work — the browser blocks module
imports from `file://`).

```bash
npx serve .
```

Then open <http://localhost:3000>.

Any static server works just as well:

```bash
python -m http.server 8000     # then open http://localhost:8000
php -S localhost:8000          # then open http://localhost:8000
```

There is no build step and no install. three.js r160 is vendored at
`vendor/three.module.min.js` (MIT) and wired up with a relative import map in
`index.html`.

---

## How to play

| Action | Desktop | Touch |
| --- | --- | --- |
| Move | `W` `A` `S` `D` or arrow keys | drag anywhere on the **left** of the screen |
| Drop / bin the top plate | `Q` | the **DROP** button in the HUD |

- **Walk into a pickup point** to lift that dish onto the stack in your hands.
  You can carry **3 plates**; the stack sways as you run. Every pickup point has
  its own sign showing the dish icon, name and price — there is no guessing and
  nothing to cycle through.
- **Walk up to a seated customer** to hand them a plate. **Any** plate in your
  stack that matches their order will do, not just the one on top — that plate
  is removed and the rest slide down to fill the gap.
  * Right dish → they pay and leave happy.
  * Wrong dish → it stays in your hands and they lose patience faster.
- **Get rid of a plate you do not want** by walking into the **bin** at the end
  of the counter, pressing `Q`, or tapping **DROP**.
- The **patience ring** over each customer's head goes green → yellow → red.
  When it empties they storm off and you lose a life. **3 lives.**
- Later rounds get busier, customers get less patient, and orders grow to
  **two items**.

### The menu

There is exactly **one pickup point per dish**, along the counter. You start
with three and the rest unlock as the round goes on — an unlocking pickup point
lights up and shows a **NEW** sign.

| Dish | Pickup point | Unlocks at |
| --- | --- | --- |
| Jollof rice | the jollof pot | from the start |
| Egusi + pounded yam | the egusi pot | from the start |
| Zobo | the drinks jug | from the start |
| Moi moi | the frying pan | 40s |
| Suya | the skewer grill | 85s |
| Chapman | the drinks jug | 130s |

Customers only ever order dishes that are **unlocked and on the counter**, so
you are never asked for something you cannot pick up. A locked pickup point
cannot be collected from — its sign is drawn dark and crossed out.

---

## Project layout

```
index.html            import map + canvas (the only markup)
vendor/
  three.module.min.js three.js r160, vendored
src/
  main.js       start-up, input, game loop, screen switching, effects
  config.js     ALL tuning numbers live here
  game.js       rules and state: coins, lives, score, difficulty ramp
  scene.js      three.js scene, camera, lights, the canteen itself
  character.js  builds any character from ONE style object
  customers.js  spawning, seating, orders, patience
  ui.js         HTML/CSS overlays: title, HUD, game over, joystick
  audio.js      Web Audio synthesis (no sample files)
  platform.js   start.ng bridge — guest-only stub for now
```

### platform.js

The game only ever touches `getCurrentUser()`, `onUserChange(fn)` and
`signIn()`. Nothing else. When start.ng is ready, replace that one file with
the real user service and no game code has to change.

A style object looks like this — any missing or unknown field falls back to a
default, so a partial style can never break the game:

```js
{
  body: 'female',            // female | male
  primaryColor: '#e2564a',
  secondaryColor: '#f6efdd',
  skinColor: '#8d5a2b',
  hairColor: '#2b1a12',
  hair: 'bun',               // short afro braids bun ponytail dreads bald
  hat: 'none',               // none cap beanie tophat crown
  accessory: 'earrings',     // none glasses earrings beard scarf backpack
}
```

The title screen's **Shuffle my look** button exercises the same
`onUserChange` path that a real start.ng login will use.

### End of round

Everything that happens when the round ends sits in one function,
`onGameOver({ coins, served })` in `src/game.js`. It records the best score and
fans out to whatever the UI registered via `onGameOverHook(fn)`.

### Dev flags

Two URL query switches, neither of which is ever on in normal play:

| Flag | What it does |
| --- | --- |
| `?test=1` | crushes patience and spaces arrivals so a whole round (3 storm-outs → game over → Play again) plays out in well under a minute |
| `?debug=1` | exposes `window.__mami` (`snapshot()`, `grant()`, `place()`) so the game can be driven and asserted from an automated browser test. Implied by `?test=1`. |

At start-up the game also runs a dev check that logs to the console:

```
[mami] menu check ok — 6 dishes, 6 pickup points
```

If a dish could be ordered but had no pickup point (or vice versa) it logs a
`[mami] DISH/PICKUP MISMATCH` error instead, so a typo in the dish table is
obvious without taking the game down.

---

## Tuning

Everything you'd want to change for feel is in **`src/config.js`**:

| What | Where |
| --- | --- |
| the whole menu: names, prices, icons, pickup x, unlock times | `dishes` |
| how fast you run, how snappy you stop | `player.maxSpeed`, `player.acceleration`, `player.friction` |
| how the plate stack rides and re-stacks | `player.carryHeight`, `carryOffset`, `carrySpacing`, `carryTilt`, `reStackTime` |
| difficulty ramp | `customers.levels` (one row per stage: spawn gap, patience, order size, walk speed) |
| when the first customer walks in | `customers.firstSpawnDelay` |
| how crowded the room gets | `customers.maxActiveEarly` / `maxActiveLate` |
| penalty for a wrong dish | `customers.wrongDishPenalty`, `wrongDishCooldown` |
| how close you must be to deliver | `customers.seatRadius` |
| the bin | `bin.x`, `bin.z`, `bin.radius`, `bin.cooldown` |
| how big the order bubble is | `customers.bubbleScale` |
| how long a "NEW" badge stays up | `newBadgeSeconds` |
| money | `game.baseTip`, `game.orderItemBonus`, `game.quickBonusMax`, and `dishes.*.price` |
| juice: squash, hop, shake | `feel.*` |
| camera angle and framing | `camera.position` / `camera.target`, `camera.portraitFov`, `portraitOffset` |
| warmth and how many lights | `lights.*` |
| frame rate safety | `renderer.pixelRatioCap`, `renderer.shadows` |

---

## Performance notes

- Geometries and materials are cached and shared, and tagged `userData.cached`
  so a restart can dispose everything else without touching the cache.
- Pixel ratio is capped at 2.
- The scene is a single room with at most 9 customers (12 seats).
- Measured **60 fps** in Chrome on a laptop GPU with the room completely full —
  12 customers seated at once — and 60 fps in portrait on a 390×844 viewport.
- If a phone still struggles, set `renderer.shadows: false` in `config.js` —
  that is the single biggest cost.