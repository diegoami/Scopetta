# Scopetta

A two-player Scopa game for the browser, the third of a series after
[Discola](https://github.com/diegoami/discola-web) and
[Tressette](https://github.com/diegoami/Tressette): one static page, no build
step, the 1997 card art, one opponent formula with a weight vector per name.

`PLAN.md` is the architecture and the plan, and it is the reference for
anything this file does not state. Section 7 says how the work is organised:
one iteration per session, a fresh-context review per pull request, CI on every
pull request. Section 0 lists the seven decisions that were the owner's to
make, each with a default; all seven are confirmed. Tressette is the reference
for everything the plan does not state, and Discola for everything Tressette
does not; clone both beside this repo if they are not already there.

## After any UI change, run the UI check

```sh
node tools/check_ui.mjs
```

Not optional, and not only when something looks wrong. It runs in CI on every
pull request as well, and a red check does not merge.

**Until iteration 3 this rule is suspended, and only until then.** The check
and the `ui-check` skill were copied from Tressette in iteration 0, before
there was a table to check, and the copy is still Tressette's inside: ten-card
fixtures, tricks, declarations, `tressette.history`. Nobody runs it and nobody
tries to make it pass while `public/index.html` holds a title and the font
links. Iteration 3 rewrites it, adds the rows §3.7 of `PLAN.md` lists, and
gives `check.yml` the job that runs it; from that commit the paragraph above
applies without exception.

Every UI defect Discola shipped was invisible in the diff and threw no error:
cards overlapping the hand, the player's own hand pushed below the fold, the
table drifting apart until it stopped reading as one surface, body copy at
12.5px, and every screen rendering at once behind a click-eating overlay.
Tressette forked that table and inherited every one of them. This game forks it
again, so it inherits them a second time, plus the table row's own. Reading the
diff catches none of them; the check catches each one it has a row for.

That last clause is the whole of it. **An assertion only sees the states the
check renders.** Tressette's iteration 3 shipped a table where a finished trick
was never drawn, a declaration was cut in half at every phone width, and your
own name plate hung below the fold — with every assertion green, because no
pass ever rendered a finished trick, an announcement, or measured anything
below your cards. The states this game has that exist only in the middle of a
deal, and so only if a pass puts the page in them: a table of thirteen cards, a
choice of captures, a scopa, a hand empty for a beat between rounds, the 36th
play and the leftovers, a pile with three scope showing. When the page gains a
state, the check gains the row that puts it there, and that is the harder half
of the work.

The `ui-check` skill explains what it covers and how to read a failure.

## The card size is a budget, and it has two terms

Discola's budget was height alone. Tressette added a width term for a fan of
ten cards. Both terms are kept here, and `--cw` is the smaller of the two — but
the width term comes from somewhere else, because a Scopa hand is three whole
cards and needs no fan:

```
height:  (100dvh − --chrome) / --rows / --ratio
width:   (100vw − 2 × --pad-inline − 4 × --gap) / 5
```

The width term is the widest seat row, which is the opponent's: their pile,
three cards and the deck, five card widths and four gaps. `--rows` is 3 in
landscape and 4 in portrait, where the middle stacks.

`--chrome` is **derived** from the spacing tokens next to it — never hard-code
it. It was hand-estimated three times in Discola and wrong three times,
silently, because a card too tall for its row does not error, it just lands on
the hand below.

**Every term of `--chrome` is derived, including the ones that look like
constants.** Tressette's `--plates` was 76px, forked from Discola, against two
name plates that cost 120px on a 770px-wide screen, because their type is
expressed in vw — and the player's own plate hung below the fold while the
check said `pass`. A number in that block is a defect waiting for the screen
that disagrees with it.

Anything that takes vertical space on the table is in the budget, and is in the
flow whether or not it has something in it: the line that names the proposed
capture costs `--say` whether or not a card is raised, because a row that costs
nothing while empty moves every card below it the moment it fills. Anything
that cannot be budgeted floats over the table and out of the budget — here that
is the "Scopa!" toast, as it was Tressette's declarations.

## The middle row is a table, not a trick

This is the project's own way to fail silently, and it is the risk the plan
ranks first. The middle of the table is not two cards facing each other; it is
*the table*, holding four cards at the deal and anything from zero to thirteen
after that. Thirteen is the bound the rules allow and it is reachable in play,
so the check renders thirteen rather than the largest a random deal happened to
produce.

Thirteen cards do not sit side by side on a phone. Two rules, in this order:
the middle row **wraps** in portrait, the first `ceil(n/2)` cards above; and a
row past capacity is a **fan**, stepping by

```
min(--cw + --gap, (row width − --cw) / (n − 1))
```

so cards space out while they fit and overlap when they do not. Tressette's fan
assertions move to this row with it: the strip is never under `min(24px, .45 of
a card)`, the steps are even, the last card is whole, and the row stays inside
the table. A card too narrow to touch does not error — it just makes a capture
unreachable, and a misplay costs the deal.

## The engine is ours, and then it is frozen

`engine.js` holds the rules and the opponent as pure functions over a plain
state object. Nothing in it touches `document`, `window`, timers or
`Math.random` — that is what lets Node run the same file as the browser, which
is what makes the self-play harness and the golden fixture possible. Randomness
arrives as an injectable `rng`, `rollProfiles(rng)` included, and `rngSeed`
keeps Tressette's warm-up: mulberry32's first outputs correlate with a small
seed, and throwing eight draws away is what fixed it. **A change to the rng is
a change to the code that produced every measurement**, so every figure citing
a seed is re-run with it.

Discola's engine was a transcription of a 1997 original, so its rule was
*change a weight, not the formula*. Here the formula is ours until v1.0 — and
from v1.0 the same rule applies for a different reason: the golden fixture
freezes the plays, and a formula change invalidates it. There are **seven**
weights, and the settings sheet discloses seven; an eighth is not invented to
match Discola's twelve or Tressette's eleven. The test of whether a weight
belongs is iteration 2's ladder, not the count: a weight that moves under 1% of
plays is removed, not tuned around, and the denominator is the decisions the
weights actually make.

One exception to "score every legal play and make the highest" is deliberate
and belongs in the source with its reason: from `CODA_FROM` on — the sixth
round, where the deck is empty and the opponent's hand can be deduced rather
than guessed at — `compGioca` enumerates the position and plays it out exactly,
scoring the leaf with the real `scoreDeal`. Every opponent plays those last six
cards alike, which is also why those decisions are not in the denominator when
the roster is measured for difference: there is nothing there for a weight to
change.

Piero's weights are rolled once per session, as in Discola, where `SetProfiles`
ran from `FormCreate`. It is a house tradition now, not a Delphi accident.

## Conventions

- Player-facing text is Italian. Comments, commit messages and documents are
  English.
- No build step and no runtime dependencies. `playwright-core` is for the UI
  check only and is gitignored.
- The card art is the original 1997 bitmaps, copied byte for byte from
  Tressette, which copied them from Discola. Do not redraw it and do not
  repack it. `tools/pack_cards.py` is carried over in case a deck is ever
  repacked, from the BMPs in `diegoami/briscola-JS`.
- Anything learned outlives the session in one of three files and nowhere else:
  a decision in §0 of `PLAN.md`, a rule the builder must follow here, and at
  iteration 6 everything a stranger needs in `SPEC.md`.
