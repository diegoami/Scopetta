---
name: ui-check
description: Run Scopetta's UI checks across every screen, dialog and viewport. Use after any change to public/index.html's markup, CSS, screen flow or typography — and always before committing or publishing a UI change. Also use when a layout or readability bug is reported, to reproduce it and to confirm the fix. Dormant until iteration 3 builds the table; see "Dormant until iteration 3" below before running it.
---

# UI check

Scopetta is one HTML file — five screens and two dialogs — and it has to work
from a 360px phone to a 1920px desktop, in both orientations, with five decks
whose cards have different aspect ratios. Nearly every UI defect this
check was written for was invisible to code review and threw no error. It
exists because reading the diff was repeatedly not enough — in Discola, where
most of the thresholds below were calibrated, and in Tressette, which inherited
the check and added the rest.

## Dormant until iteration 3

**Read this before running anything.** `tools/check_ui.mjs` was copied from
Tressette in iteration 0, byte for byte, before there was anything here to
check, and it is still Tressette's inside: the fixtures deal ten cards, the
assertions look for tricks and declarations and a fan in the hand, and the
history key is `tressette.history`. None of that is Scopa. This document came
with it, and only this section has been rewritten — so everything described
below is what the copied file does, not what this game asserts.

So: while `public/index.html` holds nothing but a title and the font links,
nobody runs the check and nobody tries to make it pass. Iteration 3 builds the
table and rewrites the check with it — the fixtures, the storage key, and the
six new rows and assertions PLAN.md §3.7 lists, each written against a
deliberately broken page first — and gives `check.yml` the job that runs it.
From that commit the rule at the top of `CLAUDE.md` applies without exception:
after any UI change, run it, and a red check does not merge.

What carries over unchanged is the part below that is about the table rather
than about Tressette's game: the document pass, the text floors, the tap
targets, the fold, the row drift, the inflated spacing, the dialog-over-sheet
paths. The fan carries over too, but to the table row rather than to the hand
— a Scopa hand is three whole cards, and it is the middle of the table that
holds up to thirteen. PLAN.md §3.7 is the specification for all of it.

## Run it

```sh
node tools/check_ui.mjs
```

Exit code 0 means clean. It takes a few minutes; let it finish rather than
interrupting it.

It needs `playwright-core` and a Chromium binary:

```sh
npm i playwright-core && npx playwright-core install chromium
CHROME=/path/to/chrome node tools/check_ui.mjs      # if Chromium is elsewhere
```

To check a file that is not `public/index.html` — an older revision, say — pass it as
an argument. That is how you confirm an assertion really catches the bug it
was written for:

```sh
git show <commit>:public/index.html > .old.html
node tools/check_ui.mjs "$PWD/.old.html"; rm .old.html
```

## What it covers

**Document pass** — one page load, four facts about the document rather than
its layout: a viewport meta setting `width=device-width`, standards mode, UTF-8,
and a `lang` on `<html>`. These cannot be layout assertions, because Playwright's
`viewport` option sets the layout viewport directly and the tag is only consulted
under mobile emulation — the page measures identically with or without it.

**Screens pass** — every screen the page has, and every state worth looking at,
at five real device shapes: the start sheet, empty and after a hand; the table,
the table with a card raised, the table with the longest declaration the game
can say and the table with the opponent's hand face up; settings with the
weights disclosure open; history empty, at its hundred-hand cap, and holding
entries some other build wrote; about; the abandon confirm; and the result
dialog three ways — with both players declaring, reached from a sheet, and
reached over the confirm.

Two mechanics, both of them a bug once. A row's `open` has to *put the page in
the state*: its `check` runs after the audit, so a disclosure opened there is
never audited. And the audit skips what a closed `<details>` is hiding, because
Chromium still hands out live geometry for it and the rules were measuring text
nobody could see. A row pointing at a screen
that does not exist is a check that silently passes, so rows arrive with their
screens. Asserts exactly one screen is visible, no sideways
scroll, no text below its size floor, no text clipped by a container that
cannot scroll, no tap target under 32px, and no script or console errors.

**Table pass** — the card table at all nineteen viewports in all five decks.
Asserts the trick never overlaps either hand, your hand is never below the
fold, nothing overflows the table, no element runs past the screen edge, and
the rows never drift apart. Then it
repeats the tightest viewports with the spacing tokens inflated, which fails if
anyone replaces the derived `--chrome` with a hard-coded number.

**Deal pass** — one whole deal against the opponent at one viewport in one deck,
played by tapping: the strip of a legal card to raise it, the raised card to
play it, twenty times over. The two passes above measure a table that has just
been dealt, so this is the only one that fails when the page and the engine come
apart — or when anything throws in the middle of a deal. It reads the table as well as driving it — that
distinction is the whole of Tressette's issue #7, where a pass that played twenty
cards never looked at the hand between them — and asserts the things that only exist
mid-deal or at the end of one: **both cards of a trick are on the table at
once** before it is swept; **every card you still hold can be tapped where it
looks free**, which stops being true the moment the hand has holes in it; a
number key cannot raise a card the follow-suit rule forbids; the result dialog's two numbers are what `scoreDeal` returned; the deal
is written to the history under the same score and opponent; and a second deal
abandoned through the confirm asks first, lands on the start sheet, and is *not*
written down.

**The fan** — the assertions Tressette needed and Briscola did not, because a
hand of ten cards overlaps. This game's hand is three whole cards and never
fans, so iteration 3 splits this section three ways rather than moving it, per
PLAN.md §3.7. **Four assertions move to the table row**, where up to thirteen
cards overlap here: the strip floor, the steps being even, the last card whole,
and the row staying inside the table. **The raised card and the say line stay
in the hand** and carry over unchanged — §3.7 lists both among the assertions
that do. **The dimming assertion has no subject in this game and is dropped,
not moved**: dimming means "the rule forbids this card", and no card in a Scopa
hand is ever forbidden. Capture is compulsory only in the sense that a card
which *can* take must take; §2.3 leaves the player free to play a different
card that takes nothing. There is no follow-suit rule to forbid anything.
The step of the fan matches the page's own
`--strip`, which catches margins that have drifted from the token at any
`--overlap`; and the strip is either 24px wide or at least `.45` of a card,
which is the share the design gives its tightest orientation. Both terms are
needed: a card on its 32px clamp floor shows a good 22px strip and must pass,
while a desktop fan cut from `.7` to `.42` must fail — a `min(24px, .4 of a
card)` floor passed that break at every viewport, because its absolute term is
inert below a 60px card. The steps are even to within a pixel, the fan stays
inside the table on both edges — on the right that is also "the last card is
whole", one subtraction and so one message — and a raised card is entirely
inside the table and above the fold. Three more came out of the defect the
raised-card assertion found: the line above your hand that names the raised card
is never zero-height, never clips what it holds, and counts as content rather
than as a gap when the rows are measured for drift. And dimming means one thing
— the rule forbids this card — so the number of dimmed cards has to equal the
number of illegal ones, which is zero while the opponent is thinking. All of it
in every deck, at every viewport, with the spacing tokens inflated.

Two mechanical notes, both of them bugs once. The measuring passes run with
`transition` and `animation` off, because a measurement taken on the tick that
*starts* the raise reads the unraised box — the raised-card assertions were
blind to the geometry they exist to catch. And the fold is measured from
`.seat--you`, not from `.hand--you`: in portrait your name plate is below your
hand, and it hung 15px off the bottom of the screen at 770x1475 while this pass
printed `pass`. Cards are already excluded from the 32px tap-target rule, and were
before this game existed: `tools/check_ui.mjs:381-389` excludes them because a
card's size is the table's budget, asserted by the table pass rather than by a
thumb-sized floor. The fan gives that exclusion a second reason rather than its
first — a strip is narrower than 32px by design, which is why Tressette raises a
card with one tap and plays it with a second. **That is not this game's rhythm**:
§0 decision 6 is one tap plays the card, and a card is raised only when the rule
leaves a choice of capture to make.

## The thing this check cannot do for you

**An assertion only sees the states the check renders.** *Tressette's* iteration
3 — not this repo's, which has not happened — shipped a table where a finished
trick was never drawn, a declaration was cut in half at every phone width, and
the player's own name plate hung below the fold, with every assertion green,
because no pass rendered a finished trick, no pass showed an announcement, and
nothing measured below the cards. None of those was a weak threshold; the page
was simply never in the state that shows them.

So when the page gains a state, the check gains the row that puts it there. That
is the harder half of adding an assertion, and it is the half that gets skipped.
The states this game has that exist only mid-deal, and so only if a pass puts
the page in them, are listed in `CLAUDE.md` and in PLAN.md §4 iteration 3: a
table of thirteen cards, a choice of captures, a scopa, a hand empty for a beat
between rounds, the 36th play and the leftovers, a pile with three scope showing.

## Reading a failure

Each line names the screen, the viewport and the element. Fix the page, not the
threshold. Every threshold is calibrated against a defect that actually
shipped — most of them in Discola, which is the same table and the same budget,
and the rest in Tressette, which forked that table and found more:

| assertion | the bug it was written for |
|---|---|
| one screen visible | `.view` and `.scrim` declare `display`, which beats the UA `[hidden]{display:none}`; every screen rendered at once behind a click-eating scrim |
| text floors, 12.5px label / 14.5px body | opponent descriptions ran at 12.5px and deck labels at 11.5px |
| your hand above the fold | a portrait tablet pushed the player's own hand off screen |
| trick vs hands | a phone in landscape collapsed the middle row and the played cards landed on top of the hand |
| rows drift apart | cards hit their cap, and the grid handed the leftover height to the gaps until a third of the table was empty |
| inflated spacing | `--chrome` was hand-estimated three times and was wrong three times |
| head tags | no viewport meta, so a 393px phone laid the page out at 980px and scaled it down; Chrome's text autosizing then inflated body copy to 55px, and three rounds of mobile sizing work chased the symptom |
| past the screen edge | the table sets `overflow: hidden auto`, so a too-wide row is clipped rather than scrollable and "no sideways scroll" never fires — the opponent's third card was cut off a phone screen through nineteen viewports |
| the fan has collapsed | written against `--overlap: .08`, which leaves 5px of each card showing; a strip too narrow to single out makes a card unreachable, and a misplay costs the deal |
| the fan runs past the table | written against a `--cw` with the width term dropped, which sizes ten cards by height alone and runs the hand up to 227px past the edge |
| a raised card below the fold | the line naming the raised card was `hidden` until it had something to say, so raising a card added a row and moved every card 31px down, past the fold in landscape |
| the name strip takes no space | the same defect, named where it starts rather than where it shows |
| both cards of a trick | `gioca` resolves a trick and clears it in the same call, so a table that renders straight from the engine blanked both cards the instant the second one landed and swept two empty boxes |
| cut off inside an ancestor | a declaration in a strip sized for one line lost half a line off the top and half off the bottom at every phone width; the horizontal rule could not see it, because the element that clips is not the element that holds the text |
| your seat below the fold | `--plates` was a hand-set 76px against two name plates that cost 120px at 770x1475, and the fold was measured from the hand, not from the plate below it |
| a key raised an illegal card | the pointer cannot reach one — it is a disabled button — so the keyboard path raised a forbidden card and threw on the second press |
| dimmed but not illegal | every card dims while the opponent thinks, saying "wait" in the mark that means "illegal", with ten translucent cards showing through one another |
| the trick still shows the trick before it | a play that lands before the sweep has run cancels it — `later` owns one timer and you are on turn the moment you win a trick — so the table went on painting the previous trick, sixteen plays in twenty |
| the abandoned deal left its sweep behind | the sweep's classes animate `both` and their removal was a queued callback, so a deal thrown away mid-sweep painted every later trick transparent |
| the new-hand button landed on start | discarding a deal went to the start sheet and then dealt a new one behind it, live, with the opponent leading into a table nobody could see |
| a card was played through the abandon dialog | the card keys only checked the screen, and a dialog is a scrim over the table — `Enter` answered the dialog *and* played the raised card |
| the result opened over a sheet | the result dialog ignored what was on screen, so it landed over the history, which still said no hand had ever been played |
| the history has no way to clear itself | one entry written by another build threw mid-render and took the log and the wipe button with it |
| a card cannot be tapped where it looks free | the hand keeps its holes, each slot overlaps the one before it, and an empty slot is a button that swallows the tap meant for the card underneath — worse the thinner the hand gets |
| a raised card does not lift far enough | at 18% of a card the lift was shorter than the strip the card came out of, so the second tap read as a repeat of the first |

If you believe a threshold is genuinely wrong, change it — then run the check
against the commit that introduced the bug it names and confirm it still fails
there. A threshold that no longer catches its own bug is worse than none.

## Extending it

Add a screen to `SCREENS` with a function that navigates to it. Add a device to
`VIEWPORTS`, and to `SCREEN_VIEWPORTS` if that shape can break a sheet rather
than only the table.

When adding an assertion, first make it fail on the broken version. An
assertion written against already-correct code tends to encode what the code
happens to do rather than what it should do — the gap metric in Discola was
written that way once and passed the broken layout while failing every good one.
