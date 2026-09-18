# Scopetta

A two-player Scopa game for the browser, the third of a series after
[Discola](https://github.com/diegoami/discola-web) and
[Tressette](https://github.com/diegoami/Tressette): one static page, no build
step, the 1997 card art, one opponent formula with a weight vector per name.

`PLAN.md` is the architecture and the plan, and it is the reference for
anything this file does not state. Section 7 says how the work is organised:
one iteration per session, a fresh-context review per pull request, CI on every
pull request. Section 0 lists the decisions that were the owner's to make, each
with a default. The first seven are confirmed; the eighth — what *scopa
d'assi* would mean, if it is ever wanted — was raised by iteration 1 and is
open, and blocks nothing. Tressette is the reference
for everything the plan does not state, and Discola for everything Tressette
does not; clone both beside this repo if they are not already there.

## After any UI change, run the UI check

```sh
node tools/check_ui.mjs
```

Not optional, and not only when something looks wrong. It runs in CI on every
pull request as well, and a red check does not merge.

**The suspension ended at iteration 3.** The check is this game's now — its
own fixtures, its own table row, `scopetta` where it used to say `tressette` —
and `check.yml` has the job that runs it. Six passes: the document, every
screen, the table at every viewport in every deck, the table again with the
spacing inflated, the capture choice and the toast, and one whole deal.

**`node tools/break_ui.mjs` is the other half.** It breaks the page on purpose,
one defect at a time, and checks that the assertion *written for that defect*
goes red — not merely that something did. Run it after adding an assertion, the
way `tools/break.mjs` is run after adding a rule test.

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

**And a new assertion is made to fail before it is made to pass.** Write it
against a deliberately broken page first and watch it go red, because an
assertion written against already-correct code encodes what the code happens to
do rather than what it should do — Discola's gap metric was written that way
once and passed the broken layout while failing every good one. The same rule
covers the engine from iteration 1: every rule test is broken on purpose after
it is written, and one that still passes is decoration.

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

`engine.js` holds the rules and the opponent as functions over a plain state
object — `newDeal`, `distribuisci` and `gioca` mutate it, so "pure" is the
plan's loose word for what is actually true: nothing in the file reaches
outside that object. Nothing in it touches `document`, `window`, timers or
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
weights and the settings sheet discloses seven — but not the seven the plan
drafted: iteration 2's ladder cut `SCOPA_BONUS`, which buys nothing measurable,
and added `TEMPO_BONUS`, which §4's tempo question turned out to want. The count is a coincidence; the membership is the measurement.

**A weight under §4's 1% bar is a question, not a verdict.** `SETTEBELLO_BONUS`
moves 0.45% of decisions and was removed on that rule, with a reason that was
false — `bestMine` is per suit, so the settebello's primiera gain collapses as
soon as any denaro is in the pile, and the engine declined the point in §3.4's
own first trap. Paired on the same deals it is worth half a point. The rule is
a proxy for *cannot change the outcome*, and it fails when a point lives in one
card. Measure the plays a weight moves, then ask whether they decide anything.

**And a term that guesses may only guess at what a human could count.** The
tempo term samples hands from `fuori`; a version that reads the opponent's real
hand scores far better and is cheating, which is most of where its gain came
from.

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
