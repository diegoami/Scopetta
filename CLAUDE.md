# Scopetta

A two-player Scopa game for the browser, the third of a series after
[Discola](https://github.com/diegoami/discola-web) and
[Tressette](https://github.com/diegoami/Tressette): one static page, no build
step, the 1997 card art, one opponent formula with three weight vectors.

`PLAN.md` is the architecture and the plan, and it is the reference for
anything this file does not state. Section 7 says how the work is organised:
one iteration per session, a fresh-context review per pull request, CI on every
pull request. Section 0 lists the seven decisions that were the owner's to
make, each with a default; all seven are confirmed. Tressette is the reference
for everything the plan does not state, and Discola for everything Tressette
does not; clone both beside this repo if they are not already there.

This file is a stub. Iteration 0 expands it into this repo's version of
Tressette's `CLAUDE.md`: the same rules, reworded for this game. Until then,
three of them apply already.

## The UI check runs after any UI change

```sh
node tools/check_ui.mjs
```

Not optional, and not only when something looks wrong. The rule takes effect
the moment `public/index.html` has a table (iteration 3); until then the check
and the `ui-check` skill are copied over dormant, and nobody tries to make them
pass. **An assertion only sees the states the check renders**: when the page
gains a state — a table of thirteen cards, a choice of captures, a scopa — the
check gains the row that puts it there.

## The engine is ours, and then it is frozen

`engine.js` holds the rules and the opponent as pure functions over a plain
state object. Nothing in it touches `document`, `window`, timers or
`Math.random`. Randomness arrives as an injectable `rng`. The weights are
disclosed on the settings sheet, and there are exactly as many as move a play;
none is invented to match another game's count. The sixth round is played
exactly, by search, and all three opponents play it alike.

## Conventions

- Player-facing text is Italian. Comments, commit messages and documents are
  English.
- No build step and no runtime dependencies.
- The card art is the original 1997 bitmaps, copied byte for byte from
  Tressette, which copied them from Discola. Do not redraw it and do not
  repack it.
