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
| Switch dish at a station | `Space` / `Enter` | — |

- **Walk into a station** to lift its dish onto the stack in your hands. You
  can carry **3 plates**; the stack sways as you run.
- **Walk up to a seated customer** to hand them the plate on top of your stack.
  * Right dish → they pay and leave happy.
  * Wrong dish → it stays in your hands and they lose patience faster.
- The **patience ring** over each customer's head goes green → yellow → red.
  When it empties they storm off and you lose a life. **3 lives.**
- The **frying pan** and the **drinks cooler** serve two dishes each. Press
  `Space` while standing at one of them to switch which one you're taking.
- Later rounds get busier, customers get less patient, and orders grow to
  **two items**.

### The menu

**Jollof** · **Egusi + pounded yam** · **Moi moi** · **Suya** · **Zobo** ·
**Chapman** — across four stations: the jollof pot, the egusi pot, the frying
pan (plantain, moi moi and suya skewers), and the drinks cooler.

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

---

## Tuning

Everything you'd want to change for feel is in **`src/config.js`**:

| What | Where |
| --- | --- |
| how fast you run, how snappy you stop | `player.maxSpeed`, `player.acceleration`, `player.friction` |
| how the plate stack rides | `player.carryHeight`, `player.carryOffset`, `player.carrySpacing`, `player.carryTilt` |
| difficulty ramp | `customers.levels` (one row per stage: spawn gap, patience, order size, walk speed) |
| how crowded the room gets | `customers.maxActiveEarly` / `maxActiveLate` |
| penalty for a wrong dish | `customers.wrongDishPenalty` |
| how close you must be to deliver | `customers.seatRadius` |
| money | `game.baseTip`, `game.orderItemBonus`, `game.quickBonusMax`, and `dishes.*.price` |
| juice: squash, hop, shake | `feel.*` |
| camera angle and framing | `camera.position` / `camera.target`, `camera.portraitFov` |
| warmth and how many lights | `lights.*` |
| frame rate safety | `renderer.pixelRatioCap`, `renderer.shadows` |

---

## Performance notes

- Geometries and materials are cached and shared, and tagged `userData.cached`
  so a restart can dispose everything else without touching the cache.
- Pixel ratio is capped at 2.
- The scene is a single room with at most 9 customers.
- If a phone still struggles, set `renderer.shadows: false` in `config.js` —
  that is the single biggest cost.