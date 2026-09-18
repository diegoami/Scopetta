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

Exit code 0 means clean. It takes about fifteen minutes; let it finish rather
than interrupting it. It prints the Chromium it used, because that is part of
the answer — `check.yml` pins `playwright-core` so CI runs the same one.

**And then read the `ui` job on the pull request.** Locally the Google Fonts
request fails, in CI it succeeds, and the type metrics decide how wide every
string on the table is — so `All checks pass.` here is a claim about here. The
check blocks the font on every page for exactly that reason, which makes it
deterministic and makes it the worst case, but the habit still matters: an
iteration once reported green while the job was red on the same commit, and
`break_ui.mjs` refuses to run against a page the check fails, so a red check
takes the mutation harness with it.

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
middle of a deal**, at seven real device shapes: the start sheet; the rules,
opened from the start sheet and again from the table; the table just dealt; the
table with an empty middle; the table with thirteen cards; a capture waiting to
be chosen; a scopa announced; both hands empty for the beat between rounds; a
pile with three scope showing; and the deal over. Asserts exactly one
screen is visible, no sideways scroll, nothing past the screen edge, no table
card on a hand card, no name plate on the cards or wider than its own box, no
text below its size floor, no text clipped by a container that cannot scroll, no
tap target under 32px, and no script or console errors.

Rows arrive with their screens. A row pointing at a state that does not exist is
a check that silently passes. **Two of them are played rather than posed** — the
sweep and the beat between rounds — because neither is a state the engine will
sit in; see the pass below.

**Table pass** — the card table at all twenty-five viewports in all five decks,
**with the middle row holding 0, 4, 8 and 13 cards**. Asserts that no table card
lands on a card in either hand, that your whole seat is above the fold, that the
middle stays inside the table and draws one row in landscape and two in
portrait, that nothing runs off the screen, that no name plate is wider or
taller than its own box or lands on the cards, that **the table needs no
scrolling at all**, that the DOM and the engine agree on how many cards are on
the table, and the fan floors below. Then it repeats the tightest of them with
the spacing tokens inflated, which fails if anyone replaces the derived
`--chrome` with a hard-coded number — but not the short landscape windows,
where the inflation drives the card onto its clamp floor and tests the clamp
rather than the derivation. That pass also runs with `--slack: 0`, because a
budget term that is *short* by less than the slack costs nothing and shows
nowhere: `--plates` was 8px short at every portrait viewport and the slack is
8px.

The table scrolls rather than clips when the budget comes up short, which is the
designed fallback: reaching a card by scrolling beats a card hidden under
another one. Needing it at all means a term of `--chrome` is missing, and two
were — `--plates: 0px` in landscape, where a plate can be taller than a card;
`--extra-gap` as a hand-set `.5rem` where the middle's own row gap is `--step`;
and `--plates` again, paying for two of the four gaps a stacked seat costs.

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

**And the strip, which is not the step.** Every one of those assertions can pass
while a card is untappable, because which card a tap lands on is decided by
paint order and paint order moves no box. So the check walks each row a pixel at
a time with `elementFromPoint` and counts who answers: every card must be
reachable across its whole step, and never under the floor. Four defects in
iteration 3 were only this — a marked card, a hovered card and the raised card,
each painted over a neighbour, leaving 22px of a 74px step beside a marked one
at 1024x768; and the raised card again, over the line that names the capture.

**The capture choice, and the toast** — the interaction neither ancestor had.
Asserts that a card with more than one capture raises instead of playing, that
**exactly** the cards of the proposal are marked (not more, not fewer), that the
line above your hand says what the next tap will *do* rather than naming the
card, that it reads *differently* for the two proposals — two sevens down and a
seven in hand is the whole point of the line, and without the suit both
proposals read "Prendi il sette con il sette" — and that tapping a table card
switches the proposal to one containing it. Then that the toast floats: out of
the flow, never clipped, never off-screen.

It then poses the same choice on a **crowded** table with a pointer resting on a
card, and measures every strip there. Crowded is twelve cards, not thirteen: a
thirteen-card table is four of one value plus one of each of the other nine, so
every value is on it, every hand card has exactly one capture, and thirteen can
never be a choice at all.

**Turning the phone over** — a change of viewport, which is the one state the
grid cannot render: every case above loads the page at a size and measures it
once. Whether the middle row wraps is an orientation and which rung the say line
holds is a width, both read in script at render time, so a page that does not
listen for `resize` is a page the whole grid agrees with. It rotates four shapes
both ways with thirteen cards down, and raises a card at one width to read it at
another.

**The deal over, with the points counted out** — carte, denari, settebello,
primiera with its totals, scope, and the total, each row a pair of counts and
what they are worth. The deal pass reads every number back against `scoreDeal`
and the piles, **and adds the row markers up to check they come to the total**:
a breakdown that agrees with itself and not with the engine is worse than none,
and arithmetic shown on the page is a claim the page has to keep.

The five rows are the five points and nothing else. Carte was briefly broken
down by suit; three of the four suits can never score, and the fourth is the
denari row again. A number the reader has to discard is not working shown, it
is another number.

**The rules** — the one screen here that is read rather than glanced at, and
the one that has to come back to where it came from. Asserts that each of
`section[lang="it"]` and `section[lang="en"]` is the rules rather than a note
(at least five blocks and two hundred words, naming the scopa, the primiera and
the settebello), and that Back returns to the table when the table opened it,
with the hand unchanged — a Back that always lands on the start sheet abandons
the deal of anyone who opened the rules to check what a scopa is worth mid-hand.
The language lives on the `section`, not on each paragraph: half a page not
marked as its own language is half a page screen readers and hyphenation read
as the other one — and, less loftily, an assertion that looks for one `lang`
attribute anywhere passes a page whose English is tagged Italian.

**A card arriving** — the beat the owner found missing by playing the preview.
A capturing card never touches `state.tavola`, so a middle row that draws the
state draws it nowhere and the opponent's play cannot be seen at all. The check
renders all three beats of a capture — the card lands among the cards it is
about to take, they all leave together, the table is empty and the scopa is
announced — and the other way a card arrives, a lay, which is ringed for a beat
because it lands among as many as twelve others.

**The sweep, and the beat between rounds** — the two states that only playing
can reach, and the reason for it: a toast over a table that still has cards on
it is not a scopa, and two empty hands are a position `gioca` deals its way out
of before it returns. The sweep is measured twice, while it runs and after it:
the captured card still drawn and marked as leaving, going toward the player
who took it; then the empty table, the toast, the scopa mark and nothing left
carrying the class. It reports the round in `nuovoGiro`; the page draws the
beat from that flag. Posing either state by assigning to `state` renders a page
the game cannot reach, and passes whether or not the page can reach it.

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
| a card loses its strip | a marked card and a hovered card were each painted above the card to their right, which took `cw - step` off it — no box moved, and 7px of a 98px card was left to the thumb |
| a table card overlaps a hand card | the raised card was lifted 40% of a card into a gap that was not 40% of a card, and stood on two to four of the cards it was proposing to take |
| the plate spills past its own width, or lands on the cards | the seat row is plate, five cards, plate, and the budget paid for the cards only: the table grew to fit and clipped the deck off the right edge, with no sideways scroll to show for it |
| the middle draws N rows | the wrap rule was a line of JavaScript no assertion read |
| the beat / the sweep | states the engine will not sit in, so a posed version passes whether or not the page can reach the real one |
| N of M cards in the new hand were not drawn as dealt | three outlines became three cards between one frame and the next, which reads as a flicker rather than as a deal. The animation itself is not asserted — this check runs with motion off — only the mark the page puts on a card it has just dealt |
| the say line at 12.5px | it is the shortest text on the table and the only text that says what the next tap will *do*, so it is held to the floor body copy is held to whatever its length: length is a proxy for "is this read", and here it points the wrong way |
| the deal ended and the points were never counted out | a total with no working is a number the player has to take on trust |
| the card that was played was not laid on the table | `gioca` takes a capturing card from a hand to a pile, so the table never draws it and the opponent's play is invisible — the one defect in this iteration that a player found before the check did |
| the capture is sweeping the wrong way: N of M | counting "is anything going the right way" cannot see a capture that sends the cards one way and the card that took them the other |
| the plate spills past its own height | the mazziere tag became a row of its own when the plate became a grid, and a box derived for one line of type drew it behind the cards at every portrait viewport — with both plate assertions green, because both asked about width |
| the table needs N px of scrolling | `overflow: hidden auto` is the fallback for a budget that comes up short, so a missing term costs a scrollbar rather than an error |
| the say line is drawn over | the raised card rises into the space above the hand, and that space includes the line — 120px of a 309px line at 1440x900, over the suit the line had just been taught to say |
| the say line should name the capture | a fixture that names a rung and renders another: the position meant to test the longest name offered only one capture, so the card was played and the table rendered empty. It also catches a ladder that cuts the line by counting characters, which is a proxy for a width and a bad one |
| after turning, … | the wrap rule and the say line's rung are read in script at render time, and nothing re-read them: a rotation left thirteen cards in one row with a 22.6px strip, or in two rows with the seat 75px below the fold |
| the say line runs off the screen | the plaque is sized to its content, so it made `.say` its own width and the `max-width: 100%` beneath it resolved against the grown box: 39 characters ran from −8px to 328px on a 320px screen |
| N cards in your hand are still tappable during the sweep | `tapped` refuses while the table is sweeping, so a card that still looks live takes a tap and does nothing |
| N screens visible at once | counted by computed `display`, not by the `hidden` attribute: the attribute was always right and the rule acting on it was what lost, so an assertion reading the attribute survives the defect it is named for |
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

Add a screen to `SCREENS` with a function that puts the page in that state —
one that *plays* the page into it wherever playing can reach it. Add a device to
`VIEWPORTS`, and to `SCREEN_VIEWPORTS` if that shape can break a sheet rather
than only the table. **A viewport is a state too**: the grid held nineteen
shapes and not one small landscape window, and the assertions that would have
caught a clipped deck were all written and all green.

When adding an assertion, add a break to `tools/break_ui.mjs` with it, and an
`EXPECT` entry naming the assertion. The entry is a substring of the line the
check prints, so it has to name **one** assertion: `"steps"` stood for the step
floor once and matched "the steps are uneven" just as well. A break whose defect
takes two edits — two rules holding the same thing up, where removing either
alone changes nothing — passes arrays for `find` and `replace`.

And write the assertion against what the browser **did**, not what the page
meant. The `[hidden]` break survived an assertion that counted `.view` elements
by their `hidden` attribute, because the attribute was set correctly every time;
what failed was the rule that acts on it. An assertion written against
already-correct code tends to encode what the code happens to do rather than
what it should do — Discola's gap metric was written that way once and passed
the broken layout while failing every good one.
