---
name: ui-check
description: Run Scopetta's UI checks across every screen, state and viewport. Use after any change to public/index.html's markup, CSS, screen flow or typography — and always before committing or publishing a UI change. Also use when a layout or readability bug is reported, to reproduce it and to confirm the fix.
---

# UI check

Scopetta is one HTML file and it has to work from a 360px phone to a 1920px
desktop, in both orientations, with five decks whose cards have different
aspect ratios. Nearly every UI defect this check was written for was invisible
to code review and threw no error. It exists because reading the diff was
repeatedly not enough — in Discola, where most of the thresholds below were
calibrated, and in Tressette, which inherited the check and added the rest.

## Run it

```sh
node tools/check_ui.mjs
```

Exit code 0 means clean. It takes about four minutes; let it finish rather than
interrupting it.

It needs `playwright-core` and a Chromium binary:

```sh
npm i playwright-core && npx playwright-core install chromium
CHROME=/path/to/chrome node tools/check_ui.mjs      # if Chromium is elsewhere
```

To check a file that is not `public/index.html` — an older revision, say — pass
it as an argument. That is how you confirm an assertion really catches the bug
it was written for:

```sh
git show <commit>:public/index.html > .old.html
node tools/check_ui.mjs "$PWD/.old.html"; rm .old.html
```

## Prove an assertion bites: `tools/break_ui.mjs`

```sh
node tools/break_ui.mjs            # every break
node tools/break_ui.mjs toast      # only the ones whose name matches
```

`CLAUDE.md`: *a new assertion is made to fail before it is made to pass.* This
is that, mechanised, the way `tools/break.mjs` is for the engine. Each break is
one edit to `public/index.html`, applied to a copy, with the check pointed at
it; nothing in the repository changes.

**It checks that the assertion written for the defect is the one that goes red**
— not merely that something did. An entry in its `EXPECT` map names which, and a
break caught only by other assertions is `MISMATCH` and red. "The check went
red" and "the rule I wrote saw the defect it was written for" are different
claims, and only the second is worth anything.

It runs with `QUICK=1`, which trims the viewport grid. A quick run is for
proving an assertion bites, never for clearing one.

## What it covers

**Document pass** — one page load, four facts about the document rather than its
layout: a viewport meta setting `width=device-width`, standards mode, UTF-8, and
a `lang` on `<html>`. These cannot be layout assertions, because Playwright's
`viewport` option sets the layout viewport directly and the tag is only
consulted under mobile emulation — the page measures identically with or without
it.

**Screens pass** — every screen, and **every state that exists only in the
middle of a deal**, at five real device shapes: the start sheet; the table just
dealt; the table with an empty middle; the table with thirteen cards; a capture
waiting to be chosen; a scopa announced; both hands empty for the beat between
rounds; a pile with three scope showing; and the deal over. Asserts exactly one
screen is visible, no sideways scroll, no text below its size floor, no text
clipped by a container that cannot scroll, no tap target under 32px, and no
script or console errors.

Rows arrive with their screens. A row pointing at a state that does not exist is
a check that silently passes.

**Table pass** — the card table at all nineteen viewports in all five decks,
**with the middle row holding 0, 4, 8 and 13 cards**. Asserts that no table card
lands on either hand, that your whole seat is above the fold, that the middle
stays inside the table, that the DOM and the engine agree on how many cards are
on the table, and the fan floors below. Then it repeats the tightest five
viewports with the spacing tokens inflated, which fails if anyone replaces the
derived `--chrome` with a hard-coded number.

Four sizes, not "whatever a deal produced": §3.7's bound is thirteen and a real
deal reaches twelve, so the state that breaks the row has to be rendered on
purpose. The thirteen-card fixture is the shape the rules actually reach — four
of a kind plus one card of every other value — because a value already on the
table always captures, so no value is ever laid twice. A fixture of thirteen low
cards makes `prese` enumerate hundreds of capture sets for one re, which is a
position no deal can reach.

**The fan, on the table row** — this is where Scopa differs from both ancestors.
The hand is three whole cards; it is the *middle* that overlaps. The step is
`min(--cw + --gap, (row width − --cw) / (n − 1))`, derived in the sheet against
the row's own width, and the assertions are Tressette's moved across: the step
is never under `min(24px, .45 of a card)`, the steps are even to within a pixel,
the last card is whole, and the row stays inside its box. A step too narrow to
touch does not error — it just makes a capture unreachable, and a misplay costs
the deal.

**The capture choice, and the toast** — the interaction neither ancestor had.
Asserts that a card with more than one capture raises instead of playing, that
**exactly** the cards of the proposal are marked (not more, not fewer), that the
line above your hand says what the next tap will *do* rather than naming the
card, and that tapping a table card switches the proposal to one containing it.
Then that the toast floats: out of the flow, never clipped, never off-screen.

**Deal pass** — one whole deal against Franco at one viewport, played by
tapping. The passes above measure a table that has just been dealt, so this is
the only one that fails when the page and the engine come apart. It **reads the
table as well as driving it** — that distinction is the whole of Tressette's
issue #7, where a pass that played twenty cards never looked at the hand between
them. After every play it asserts that the middle shows what the engine holds,
that both pile badges and the deck badge match, that the scopa marks match, and
that every slot you hold shows a card and every slot you do not shows none. At
the end: thirty-six plays, an empty table after the leftovers go, forty cards in
the piles, and the score the page shows is what `scoreDeal` returned.

It plays **seed 16** with `state.mazziere` cleared first. Both parts were
searched for, not chosen: an ambiguous capture is not common, and a deal that
never offers one cannot exercise the two ways of choosing. Clearing the dealer
matters because `newDeal` *alternates* from whatever the state already holds, so
seeding the rng alone does not reproduce a cold start — the dealer differs, the
lead differs, and the whole deal differs.

## The thing this check cannot do for you

**An assertion only sees the states the check renders.** Tressette's iteration 3
shipped a table where a finished trick was never drawn, a declaration was cut in
half at every phone width, and the player's own name plate hung below the fold —
with every assertion green, because no pass rendered a finished trick, no pass
showed an announcement, and nothing measured below the cards. None of those was
a weak threshold; the page was simply never in the state that shows them.

So when the page gains a state, the check gains the row that puts it there. That
is the harder half of adding an assertion, and it is the half that gets skipped.

## Reading a failure

Each line names the screen or viewport, the deck, the table size and the
element. Fix the page, not the threshold. Every threshold is calibrated against
a defect that actually shipped, or against one this check caught before the page
was committed:

| assertion | the bug it was written for |
|---|---|
| one screen visible | `.view` declares `display`, which beats the UA `[hidden]{display:none}`; every screen rendered at once behind a click-eating scrim |
| text floors, 12.5px label / 14.5px body | opponent descriptions ran at 12.5px and deck labels at 11.5px |
| your seat above the fold | **iteration 3, before anything was committed**: stacking the seat in portrait gave the pile and the deck a whole card row each, so a seat cost three card heights against a budget that paid for one, and your own seat hung up to 203px below the fold at fourteen viewports |
| table cards vs the hands | a phone in landscape collapsed the middle row and the played cards landed on the hand |
| rows drift apart | cards hit their cap, and the grid handed the leftover height to the gaps until a third of the table was empty |
| inflated spacing | `--chrome` was hand-estimated three times and was wrong three times |
| head tags | no viewport meta, so a 393px phone laid the page out at 980px and scaled it down; Chrome's text autosizing then inflated body copy to 55px |
| past the screen edge | the table sets `overflow: hidden auto`, so a too-wide row is clipped rather than scrollable and "no sideways scroll" never fires — the opponent's third card was cut off a phone screen through nineteen viewports |
| the table row has collapsed | a step too narrow to single out makes a capture unreachable, and a misplay costs the deal |
| the table row spills past its box | the row's grid column sized to its content, so a row that should overlap grew the whole table instead — and the per-row assertion could never fire, which would have made it decoration |
| the say line takes no space | in Tressette the line was `hidden` until it had something to say, so raising a card added a row and moved every card 31px down, past the fold in landscape |
| cut off inside an ancestor | a declaration in a strip sized for one line lost half a line off the top and half off the bottom at every phone width; the horizontal rule could not see it, because the element that clips is not the element that holds the text |
| the toast is in the flow | anything that cannot be budgeted must float; a strip sized for one line clips the second |
| the table marks the wrong cards | a proposal nobody can read is a rule the table fails to teach |
| badges vs the engine | a badge that lags the state is the kind of defect nothing throws for |
| the middle shows N, the engine holds M | the page and the engine coming apart mid-deal, which only a played deal can see |

If you believe a threshold is genuinely wrong, change it — then run the check
against the commit that introduced the bug it names and confirm it still fails
there. A threshold that no longer catches its own bug is worse than none.

## Extending it

Add a screen to `SCREENS` with a function that puts the page in that state. Add
a device to `VIEWPORTS`, and to `SCREEN_VIEWPORTS` if that shape can break a
sheet rather than only the table.

When adding an assertion, add a break to `tools/break_ui.mjs` with it, and an
`EXPECT` entry naming the assertion. An assertion written against
already-correct code tends to encode what the code happens to do rather than
what it should do — Discola's gap metric was written that way once and passed
the broken layout while failing every good one.
