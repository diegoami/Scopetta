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
and `check.yml` has the job that runs it. Nine passes: the document, every
screen, the table at every viewport in every deck, the table again with the
spacing inflated and no slack, the capture choice and the toast, the states
only playing can reach — a card landing, a sweep, a lay and the beat between
rounds — turning the phone over, the rules in both languages and both ways in,
and one whole deal.

**Which card a tap lands on, and which words a player can read, are decided by
paint order, and nothing about paint order moves a box.** Four of iteration 3's
defects were only that, and every geometric assertion was green through all of
them. So the check hit-tests: the table row a pixel at a time with
`elementFromPoint`, and the say line while a card is raised. When a rule is
about what reaches the player rather than about where a box is, measure what
the page answers, not what it contains.

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

**Three more the owner found by playing, after six review rounds had not.** A
new hand *appeared* — three outlines became three cards between one frame and
the next, measured at 40ms intervals across a round boundary — which reads as a
flicker rather than as a deal, so a card that arrives in a hand is dealt in. The
say line was `--t-tiny`, the smallest type on the table, while being the only
text on it that says what the next tap will DO: it has a size of its own now and
the check holds it to the floor it holds body copy to, whatever its length,
because length is a proxy for "is this read" and here it points the wrong way.
And the deal ended with a total and no working — the five points are counted out
now, with the counts beside them, because "denari" with no number is a claim;
and each row shows what it is **worth**, because a column of counts with a
total underneath does not say how one becomes the other. The markers down a
column are the total, the check adds them up and compares, and the rule is
written once in words underneath. Carte briefly carried the four suits it is
made of, and that was a number too many: three of the four can never score and
the fourth is the denari row again, so half the working was there to be
discarded. **Working shown is only working if every line of it is used.**

**A card the player never sees is a card that was never played.** `gioca` moves
a capturing card from a hand straight to a pile, so a table that draws only
what `state.tavola` holds never draws it at all: the opponent's card appears
nowhere, and the player watches cards leave and has to work out what took them.
The owner found that by playing the preview, after five reviews had not. So the
card lands on the table first, among the cards it is about to gather, and the
capture runs a beat later — which is what a hand does at a real table. A card
that takes nothing is ringed for the same beat, because it arrives among as
many as twelve others and nothing else says which one is new.

**A state the engine refuses to sit in has to be played, not posed.** Two of
those rows cannot be set up by assigning to `state`: a toast over a table that
still has cards on it is not a scopa, and two empty hands are a position
`gioca` deals its way out of before it returns — it reports the beat in
`nuovoGiro` and the page draws it from the flag. Pose either one and the check
passes whether or not the page can reach it. Both are played now, with the
page's own `play`.

**And measure the broken page, not the healthy one.** `.tavola`'s bounded grid
column was taken out of the sheet on a measurement that said it changed
nothing — and it does change nothing, on a page whose row already fits. Its
whole job is on a page whose row does not: an auto column grows with its row,
`width: 100%` follows it, and the assertion that watches for a row spilling
past its own box can never fire. A line that only matters when something else
is wrong is exactly the line a mutation harness is for, and the evidence for
one is a pair of runs, not one.

**And a CHANGE of viewport is a state too, and the hardest kind to remember:**
every case in the grid loads the page at a size and measures it once, so a page
that never draws itself again is a page the whole grid agrees with. Two things
on this table are decided in script rather than in the sheet — whether the
middle row wraps, and which rung the say line can hold — and neither was read
again after the first paint. Measured, with no reload: rotating 980x385 to
portrait left one row of thirteen cards with a 22.6px strip, under the floor;
rotating 360x800 to landscape left two rows against a budget that paid for one,
82px of scrolling and your own seat 75px below the fold; and a say line raised
at 600x853 and resized to 320 kept its rung and stood 38px tall in a 23px box.
The page listens for `resize` now, and the check turns the phone over.

**And a viewport is a state.** The same defect a third time: iteration 3's
nineteen viewports held no landscape window narrower than 980px, and the
assertions that would have caught the clipped deck were all written and all
green. When a rule is about the widest thing on the screen, the grid needs the
narrowest screen the rule has to hold on.

**And the last play of a deal is a state, and so is the moment after the play
that ends a round.** Three defects shipped in those two, all found by the sixth
review and none by any assertion: `gioca` sets `over` on the 36th play, so a
result panel drawn from `over` alone goes up before the card has landed and the
three beats run behind an opaque panel, for one play in every deal; a last card
that takes nothing is swept up *with the leftovers*, to whoever captured last,
and was drawn going to whoever played it, which says two players took cards from
one play; and `gioca` deals the next round before it returns, so between the
play that empties both hands and the beat the state already holds three new
cards a side — drawn there, a hand appears, deals in, blanks and deals in again,
1.35s of flicker where the deal-in was meant to remove it. **When the engine
does something extra on a play, that play is a state of its own**, and the beats
around it need rendering separately from the ordinary ones.

**And a flag with two owners is a flag no assertion can watch.** The fix for
that flicker set `beat` in `play()` and left it being cleared inside a callback
in another function — and the break written for the beat stopped tripping the
assertion written for it, because whatever skipped the clearing now left the
flag *set*: the page hung with both hands drawn empty instead of failing at the
rule that watches the flag. Measured on the mutated page: `beat` true forever,
`plays` stuck at 6. Both ends of a flag belong in one place, and if a driver or
a fixture has to put a flag back by hand to keep working, that is the same
defect showing early.

**And a mark that is never taken off is a mark that means nothing.** The card a
hand is dealt is marked `data-dealt`, and nothing removed it when the card was
played — so a slot carried the first deal's mark into the second, and the check
counted a stale mark as a fresh one. The deal-in could be switched off for
rounds two to six, which is every round the beat pass actually measures, and the
whole check still passed. `faceOf` clears it with the card now.

**And a state the seed does not reach has to be posed.** A driven deal reaches
whichever ending its seed reaches: the deal the check drives ends in a capture,
so the two endings where the last card takes *nothing* — onto leftovers, and
onto a table a scopa emptied — are posed up to the play and then played. The
break written for each of them survived until the check rendered them.

**And a way into a screen is a state.** The rules screen is reachable from the
start sheet and from the table, and Back has to return to whichever opened it —
a Back that always lands on the start sheet abandons the deal of anyone who
opened the rules mid-hand. A screen the check only ever enters by one door is
half-checked, so both doors are in `SCREENS` and both are walked back.

**And an assertion about a page's language belongs on the element that carries
it.** "The rules are in both languages" asserted as *a `lang` attribute exists
somewhere* passes a page whose English paragraphs are tagged Italian — the break
written for it survived, because deleting one `lang="en"` left six English
paragraphs behind. Each language is a `section[lang]` now and each section is
measured on its own, which is also what a screen reader and a hyphenator read.

**And a new assertion is made to fail before it is made to pass.** Write it
against a deliberately broken page first and watch it go red, because an
assertion written against already-correct code encodes what the code happens to
do rather than what it should do — Discola's gap metric was written that way
once and passed the broken layout while failing every good one. The same rule
covers the engine from iteration 1: every rule test is broken on purpose after
it is written, and one that still passes is decoration.

**And the check's own environment is part of the check.** The page asks Google
Fonts for its type, and whether that request succeeds decides how wide every
string on the table is. An assertion calibrated against the fallback metrics
passed here — no network — and failed in CI, where the real font loaded and the
string was narrower. A check whose answer depends on the network is not a
check: `check_ui.mjs` blocks the font on every page, which is deterministic and
is also the worst case, since the page has to be correct while the font is
still on its way. And **`node tools/check_ui.mjs` passing locally is not the
same claim as CI being green** — read the job before saying a pull request is
green, because `break_ui.mjs` refuses to run at all against a page the check
fails, so a red check takes the mutation harness with it.

The `ui-check` skill explains what it covers and how to read a failure.

## The card size is a budget, and it has two terms

Discola's budget was height alone. Tressette added a width term for a fan of
ten cards. Both terms are kept here, and `--cw` is the smaller of the two — but
the width term comes from somewhere else, because a Scopa hand is three whole
cards and needs no fan:

```
height:  (100dvh − --chrome) / --rows / --ratio
width:   (100vw − 2 × --pad-inline − 4 × --gap − --seat-extra) / 5
```

The width term is the widest seat row, which is the opponent's: their pile,
three cards and the deck, five card widths and four gaps — **and, in landscape,
the two name plates at the ends of that row**, which is `--seat-extra`.
`--rows` is 3 in landscape and 4 in portrait, where the middle stacks and the
plates stack with it, so `--seat-extra` is 0 there.

Leaving the plates out is what iteration 3 shipped. It did not make a card too
big in any visible way: it made the row need more width than the screen had,
`.table` grew to its content, and `overflow: hidden auto` clipped the deck and
the player's own name plate off the right edge — 88px of it at 800x680. **A
clipped table does not scroll sideways**, so the assertion watching for
sideways scroll had nothing to say. Ask the elements where they are.

**A term that is SHORT by less than `--slack` costs nothing and shows nowhere.**
`--slack` is 8px and exists so the budget never lands on exactly zero; `--plates`
was 8px short at every portrait viewport for exactly that reason and nothing
could see it. The inflated pass runs with `--slack: 0` now, which is what makes
the arithmetic assertable rather than merely comfortable. Three terms of
`--chrome` were hand-set constants when iteration 3 was written, one found per
review round.

Every term of the width budget is a token the thing it pays for also uses:
`--plate-w` is the plate's width and half of `--seat-extra`, so the two cannot
drift. Whether the text fits inside `--plate-w` is not an opinion either — the
check asserts `scrollWidth` against `clientWidth` on every plate at every
viewport, because a flex row's items can leave the box sideways while the box
measures exactly right.

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

**The step is not the strip, and only the strip plays the card.** Which card a
tap lands on is decided by paint order, and nothing about paint order moves a
box. Iteration 3 shipped three of these: a marked card, a hovered card and the
raised card in your hand were each painted above their neighbours — by
`z-index`, by a `transform`, by a lift of 40% of a card — and each took a strip
of another card away from the thumb, leaving 22px of a 74px step beside a
marked card at 1024x768 — under the floor — on the crowded twelve-card table a
capture can actually be chosen on. The steps were even, the cards were whole, the assertions
were green. So nothing in the table row may change its paint order, the lift is
capped at the space that exists above the hand, and the check measures the
strip by hit-testing the row a pixel at a time rather than by computing it.

**The say line is a label, and a label is short.** Naming one card with its
suit runs to 43 characters and the four-card capture the check renders to 81; the
budget pays for one line of `--t-tiny`, and anything longer is not a longer
line but a line cut in half by `.say`. Three rungs, shortest that fits: the
whole thing, then without the clause naming the raised card, then "Prendi le N
carte segnate" with the brass marks carrying which.

**A rung has to meet two conditions and only one of them is a count.** The
39-character cap is about readability — past 40 the check holds a string to the
floor it holds body copy to, and `--t-tiny` is 12.5px on a phone. Whether a
rung *fits* is a width, and a count is a bad proxy for one: a line holds 34
characters at 320px, 39 at 360 and 43 at 430, and "Prendi l'asso e il fante con
il cavallo" is 39 characters and 335px. `renderSay` sets each rung and reads
the rendered height back.

**And a box sized by its content will grow the box that holds it.** The plaque
is `width: max-content`, the seat centres its items, so `.say` took its child's
max-content as its own width and the `max-width: 100%` under it resolved
against the box it had just grown — a 39-character line ran off both edges of a
320px screen. `.say` is bounded to its grid track, and the say line and the
plaque are in the check's off-screen list.

**And nothing may be drawn over it.** The raised card is lifted into the space
above the hand, and that space includes the say row — measured, it covered
120px of a 309px line at 1440x900, and the 120px was the suit the line had just
been taught to say. The line is painted above the card, on a plaque, because
shortening the lift would cost the affordance and the budget has nothing to
spare.

**A table of thirteen can never offer a capture to choose.** Thirteen is four
of one value plus one of each of the other nine, so every value is on the
table and every card in hand has a single capture. The crowded choice the
check poses is twelve.

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

- Player-facing text is Italian, except on the rules screen, which says
  everything twice — the owner asked for both languages, and the check measures
  each `section[lang]` on its own. Comments, commit messages and documents are
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
