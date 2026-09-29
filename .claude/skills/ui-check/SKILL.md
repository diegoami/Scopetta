---
name: ui-check
description: Run Scopetta's UI checks across every screen, state and viewport. Use after any change to public/index.html's markup, CSS, screen flow or typography — and always before committing or publishing a UI change. Also use when a layout or readability bug is reported, to reproduce it and to confirm the fix.
---

# UI check

Scopetta is one HTML file and it has to work from a 360px phone to a 1920px
desktop, in both orientations, with six decks whose cards have different
aspect ratios. Nearly every UI defect this check was written for was invisible
to code review and threw no error. It exists because reading the diff was
repeatedly not enough — in Discola, where most of the thresholds below were
calibrated, and in Tressette, which inherited the check and added the rest.

The check is this game's own now — its fixtures, its table row, `scopetta`
where it used to say `tressette` — and `check.yml` has the job that runs it.
`SPEC.md` §7 lists what it covers; this skill says how to run it, how to read a
failure, and which defect each threshold was written for.

**The suspension ended at iteration 3.** The check was dormant while the game
had no table; it is live now, and reading the diff was repeatedly not enough.
Every UI defect Discola shipped was invisible in the diff and threw no error:
cards overlapping the hand, the player's own hand pushed below the fold, the
table drifting apart until it stopped reading as one surface, body copy at
12.5px, and every screen rendering at once behind a click-eating overlay.
Tressette forked that table and inherited every one of them. This game forks it
again, so it inherits them a second time, plus the table row's own. Reading the
diff catches none of them; the check catches each one it has a row for.

`break_ui.mjs` is the other half of the check: it breaks the page on purpose,
one defect at a time, and checks that the assertion *written for that defect*
goes red — not merely that something did. The gate that runs it is in
`AGENTS.md` (*Verification*).

## Run it

```sh
node tools/check_ui.mjs
```

Exit code 0 means clean. It takes about twenty-five minutes — fourteen passes,
including device-language and saved-choice cases and a complete English screens
pass; the sheets pass iteration 4 added drives more of the page than any other.
Let it finish rather than interrupting it. It prints the Chromium it used,
because that is part of the answer — `check.yml` pins `playwright-core` so CI
runs the same one.

**And then read the `ui` job on the pull request.** Locally the browser, its
fonts and the fallback faces are this machine's; in CI they are the runner's,
and the type metrics decide how wide every string on the table is — so `All
checks pass.` here is a claim about here. The fonts pass makes the page need no
network and the fallback-font pass measures a spread of real faces, but the
habit still matters: an iteration once reported green while the job was red on
the same commit, and `break_ui.mjs` refuses to run against a page the check
fails, so a red check takes the mutation harness with it.

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

`AGENTS.md` and this skill: *a new assertion is made to fail before it is made
to pass.* This
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

**Fonts pass** — the three faces are served from `fonts/`, so the page needs no
network at all. Asserts that every character in `index.html` and `engine.js` is
inside the shipped latin subset (entities decoded, named and numeric), that all
six `@font-face` rules load with the network cut, and that no subresource comes
from the network. The first of the three is why the copy cannot outgrow the
subset without saying so; the other two are why a Google Fonts `<link>` cannot
come back.

**Screens passes (Italian and English)** — every screen, and **every state that
exists only in the middle of a deal**, in Italian at seven real device shapes
and English at three:
the start sheet; the rules,
opened from the start sheet and again from the table; the settings, and the
settings with the weights disclosed; the history, empty and with smazzate in
it; the confirm over a deal in progress; the table just dealt; the table with
show-points off; the table with the opponent's hand face up; the table with an
empty middle; the table with thirteen cards; a capture waiting to be chosen; a
scopa announced; both hands empty for the beat between rounds; a pile with
three scope showing; and the deal over three ways — a posed breakdown, a deal
the scope decided, and a draw. Asserts exactly one
screen is visible, no sideways scroll, nothing past the screen edge, no table
card on a hand card, no name plate or points box on the cards or wider than its
own box, no
text below its size floor, no text clipped by a container that cannot scroll, no
tap target under 32px, and no script or console errors.

Every pass pins its browser locale. The language pass proves that `it-*` picks
Italian, other device languages pick English, and an explicit saved choice wins
over either device. The English screens pass also checks translation-key parity
and audits visible text and accessibility labels for Italian left untranslated.

A `<details>` is opened on purpose for one of those rows. A closed one renders
nothing the audit can measure — the text floors, the off-screen rule and the
clipped-text rule all skip it by construction — so the weights disclosure was a
screen the check could walk past without looking at.

Rows arrive with their screens. A row pointing at a state that does not exist is
a check that silently passes. **Two of them are played rather than posed** — the
sweep and the beat between rounds — because neither is a state the engine will
sit in; see the pass below.

**Table pass** — the card table at all twenty-seven viewports in all six decks,
**with the middle row holding 0, 4, 8 and 13 cards**. Asserts that no table card
lands on a card in either hand, that your whole seat is above the fold, that the
middle stays inside the table and draws one row in landscape and two in
portrait, that nothing runs off the screen, that no name plate is wider or
taller than its own box or lands on the cards, that **the table needs no
scrolling at all** — or, where the card sits on its clamp floor (the page's
`--cw-floor`, #60), none once the floor is lifted, because there the floor
decides the card and the scroll it adds is the designed fallback (#5) — that the DOM and the engine agree on how many cards are on
the table, and the fan floors below. Its guards are railed: it fails if 1100x320
or 320x568 never reaches the floor (#59), if the floor reads differently
anywhere in the grid (#60), and if the inflated budget runs out in every case at
a shape — a budget that reads zero is otherwise skipped and counted in the
inflated pass, not blamed on a missing term, and fails as a screen too short in
the plain one (#58). Then it repeats the tightest of them with
the spacing tokens inflated, which fails if anyone replaces the derived
`--chrome` with a hard-coded number. Since #5 that includes the short
landscape windows down to 1100x330 (not 1100x320, where the inflated budget
leaves under a pixel of card), where the inflation drives the card onto its clamp floor:
the floor is lifted there as in the plain pass, and with no slack they are the
only place a small shortfall on short landscape shows. That pass also runs with `--slack: 0`, because a
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
what they are worth. The deal pass reads **all twelve numbers** back against
`scoreDeal` and the piles, **and adds the row markers up to check they come to
the total**: a breakdown that agrees with itself and not with the engine is
worse than none, and arithmetic shown on the page is a claim the page has to
keep.

All twelve since the sixth review, which found that this sentence was not true:
denari and primiera were read out of the DOM and never compared with anything.
A page showing the wrong player's denari count and the wrong player's primiera
total was green through all nine passes. The marker sum cannot stand in for the
counts — the markers come from `scoreDeal` too, so a wrong count beside a right
marker adds up perfectly — and primiera is the row whose number nobody can
check by looking at the table.

The five rows are the five points and nothing else. Carte was briefly broken
down by suit; three of the four suits can never score, and the fourth is the
denari row again. A number the reader has to discard is not working shown, it
is another number.

**The rules** — the one screen here that is read rather than glanced at, and
the one that has to come back to where it came from. Asserts that each of
`section[lang="it"]` and `section[lang="en"]` is the rules rather than a note
(at least five blocks and two hundred words, naming the scopa, the primiera and
the settebello), and that Back returns to the table when the table opened it,
with the deal exactly where it was left — a Back that always lands on the start
sheet abandons the deal of anyone who opened the rules to check what a scopa is
worth mid-hand, and a table that keeps playing behind the screen loses them the
exchange whether or not they get back to it.

That second half needs the deal **in motion**, and the first version of it
could not go red: it clicked in and straight back out, so no timer ever fired.
It plays a card first, waits longer than a whole capture, and asserts on
`state.plays` rather than on the hand — `gioca` takes the played card out of the
hand synchronously, so a hand is unchanged by a deal running on behind a screen
and an assertion on it says nothing at all.
The language lives on the `section`, not on each paragraph: half a page not
marked as its own language is half a page screen readers and hyphenation read
as the other one. Both language-tagged sections stay in the document, but only
the selected one is visible; the language check verifies that selection as well
as the English page's document `lang`.

**A card arriving** — the beat the owner found missing by playing the preview.
A capturing card never touches `state.tavola`, so a middle row that draws the
state draws it nowhere and the opponent's play cannot be seen at all. The check
renders all three beats of a capture — the card lands among the cards it is
about to take, they all leave together, the table is empty and the scopa is
announced — and the other way a card arrives, a lay, which is ringed for a beat
because it lands among as many as twelve others.

**The 36th play, and the window before a beat** — the two moments this pass did
not render, each of which had shipped a defect. `gioca` sets `over` on the last
play and sweeps the leftovers up with it, so it is the one play where what
covers the table and where the cards go are both decided differently: the
opaque result panel went up before the card had landed, and a last card that
takes nothing — swept up with the leftovers, to whoever captured last — was
drawn going to whoever played it. A driven deal reaches whichever ending its
seed reaches, so the two endings where the last card takes nothing are posed up
to the play and then played.

And `gioca` deals the next round before it returns, so between the play that
empties both hands and the beat the state already holds three new cards a side.
Drawn there, a hand appears, deals in, blanks for the beat and deals in again —
1.35s of it, measured. Nothing sampled that window, so nothing saw it.

**The sweep, and the beat between rounds** — the two states that only playing
can reach, and the reason for it: a toast over a table that still has cards on
it is not a scopa, and two empty hands are a position `gioca` deals its way out
of before it returns. The sweep is measured twice, while it runs and after it:
the captured card still drawn and marked as leaving, going toward the player
who took it; then the empty table, the toast, the scopa mark and nothing left
carrying the class. It reports the round in `nuovoGiro`; the page draws the
beat from that flag. Posing either state by assigning to `state` renders a page
the game cannot reach, and passes whether or not the page can reach it.

**The plates in a fallback font** — six phone and short-landscape shapes × five
real label faces (`system-ui`, Verdana, Tahoma, Arial and a monospace),
asserting the plate and points spill rules against each.

Blocking the webfont pins the font the page *asks for* and says nothing about
the one it gets, and the fallback is not the same on two machines:
`--font-label` ends in `system-ui`, which is Segoe UI on Windows and DejaVu or
Liberation Sans on a Linux runner. Iteration 4 shipped a plate that fitted
locally and spilled 3px in CI at every 360x800 case in all five decks, with the
local check green — the same shape as the defect that made the blocking
necessary, one level down. Anything sized to fit text belongs in this pass.

**The sheets, and the partita** — iteration 4's pass, and the one that measures
everything around the deal rather than the deal. The start sheet: a chip for
every name the engine's roster holds (asked of `rollProfiles`, not of a list
written in the check, so the row grows with iteration 5 instead of going
stale), the chosen one marked, a dossier that holds its height so that choosing
a name does not move the deck row under a thumb already on its way to it, and a
deck picked there being the deck the table deals with *and* the deck the
settings sheet says. The settings: seven weights disclosed with the values the
profile will actually play with, every control reaching the state, and the
state surviving a reload — with the controls agreeing with what was restored,
because a sheet that says one thing while the game does another is worse than
one that forgets.

Then the abandon paths, which are Tressette's three rules forked rather than
rediscovered: the reload icon **asks first** and then deals again **at the
table** (its discard went to the start sheet and dealt the new hand behind it —
a live deal nobody could see or play); "Continua a giocare" leaves the deal
exactly where it was; "Cambia avversario" asks too and lands on the start
sheet; and an abandoned smazzata is **not written down**, which is what the
confirm promises in so many words.

Then the result: the verdict read off the totals, the line saying what decided
the smazzata, the two ways on, and the entry in the history. The line is
asserted as a **property** — take the component it names out of `scoreDeal`'s
answer and the other player has to win — rather than against a table of
strings, which is the shape of assertion a table of phrases would pass by
accident. Two endings are posed for it, one the scope decided and one drawn,
because a driven deal ends wherever its seed ends.

And the row that could only be reached because the confirm is a **scrim and not
a screen**: `show` holds the table's clock, so a deal can never end behind a
*sheet*, but it can end behind the confirm. The pass plays the opponent's last
card with the confirm open and asserts that the confirm closes, the result goes
up over the table, and the smazzata is recorded once with the score `scoreDeal`
returned.

Last, the history's own defence — three entries of a shape this build did not
write are pushed into storage and `renderHistory` is called inside a `try`,
because the defect it names is a *throw*: one bad row took Tressette's sheet
down along with the button that clears it, and there was no way out from inside
the game. And the 1997 easter egg, at the table, where only `1`–`3` are card
keys so the `6` and the `4` in the word fall through to the buffer.

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

**And an assertion has to be in a position to see its own subject.** Iteration
4's first mutation run caught 126 of 141, and every one of the fifteen it
missed was this rather than a weak threshold: a box measured on a screen that
was not showing, a count asserted against a list where every number was 1, a
value read before anything had changed it, a rule held up by two lines so that
removing either changed nothing, and a pass that threw on a broken page and
took its own findings with it. Run `tools/break_ui.mjs` after adding an
assertion, not before shipping it — the survivors are the part worth reading.

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

**And a floor is a rule, not a missing viewport.** 1100x320 left the grid in
iteration 3 because the card sits on its 32px clamp floor there, so "no
scrolling" tested the clamp rather than the derivation. Dropping it left short
landscape with nothing asking whether the budget fits. It is back (#5).
Wherever the card is on its designed floor, the table pass lifts the floor and
asks the question of the budget alone, and the scroll the floor adds is the
stated fallback. Only the designed floor earns that: a card held up by any other
floor is still held to no scrolling, or the break that raises the floor would
survive. And lifting the floor gives the budget its slack back, which the strict
rule on the floored page did not have. A 7-9px defect on short landscape alone
passed until those windows joined the inflated pass, where the slack is zero.
**An exemption is paid for somewhere, and the review that found this one built
the defect to show where.**

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

**A flag with two owners is a flag no assertion can watch.** A fix set `beat`
in `play()` and left it being cleared inside a callback in another function —
and the break written for the beat stopped tripping the assertion written for
it, because whatever skipped the clearing now left the flag *set*: the page
hung with both hands drawn empty instead of failing at the rule that watches
the flag. Measured on the mutated page: `beat` true forever, `plays` stuck at 6.
Both ends of a flag belong in one place, and if a driver or a fixture has to
put a flag back by hand to keep working, that is the same defect showing early.

**And a mark that is never taken off is a mark that means nothing.** The card a
hand is dealt is marked `data-dealt`, and nothing removed it when the card was
played — so a slot carried the first deal's mark into the second, and the check
counted a stale mark as a fresh one. The deal-in could be switched off for
rounds two to six, which is every round the beat pass actually measures, and
the whole check still passed. `faceOf` clears it with the card now.

**And the first of anything is a state too.** The first hand of a session was
dealt in only because something had rendered the table before Gioca was pressed
— and the only thing that does is `document.fonts.ready`. On a cold load with
the font still on its way, the first hand a player ever sees *appears*:
measured, `{"drawn":6,"dealt":0}` against a settled-font control of
`{"drawn":6,"dealt":6}`. The check could not see it from either side, because
it blocks the webfont so `fonts.ready` resolves at once, and because no pass
looked at the first deal at all — only at a round boundary. **A slot now starts
with `data-empty="true"` rather than with nothing**, and the rule is asserted
on `buildHands` itself rather than on the outcome, because the outcome measures
the boot render and not the function.

**And an assertion has to be about what the thing is FOR.** "The page entered
the beat" had a firing set strictly inside the window assertion's and could
never go red on its own — and, worse, nothing anywhere said `BEAT` did
anything: the hands are already empty for `LANDS + SWEEP`, so setting it to
zero changed nothing any rule could see. What `BEAT` buys is *holding* the
empty hands after the table has settled, so that is what is measured, sampled
once `sweeping` and `laid` are clear rather than at the play.

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

**And a box that shares a row with another box is bounded by the same token
that pays for it.** In portrait the name plate took whatever width its content
wanted, and that was right for as long as it was alone on its row. Iteration 4
put the show-points box beside it, and the row became two boxes and a gap:
`Graziano / avversario / mazziere` at max-content is 195px, the pair is 323px of
a 288px seat at 320x568, the row wrapped, each seat cost a plate row nobody had
budgeted for, and the table handed back **72px of scrolling with your own seat
63px below the fold**. Both boxes are `--plate-w` in both orientations now.
There is a second half to it: a `width: auto` box **cannot fail a `scrollWidth`
test**, so "the plate's text fits the width the budget bought" had never been
asserted in portrait at all, in either game.

**And a number said in two places is a second thing that can be wrong about the
same deal.** Iteration 3 put `Fine: 5 a 3` in the say line because the result
had nowhere else to go. Iteration 4 gave it a panel and took the say line's copy
out rather than leaving a duplicate, and the reason is a defect rather than
tidiness: the panel is deliberately held back while the last play is still being
drawn — that was iteration 3's own bug and its fix — and the say line is not
under the panel until the panel goes up. **The same defect was still there, in
the other element**, reading the score out over the last card as it landed. A
duplicate does not merely drift; it keeps the bug the original was fixed for.

**And a line that names a cause has to be able to be wrong about it.** The
result says what decided the smazzata by scoring the deal again without each
component and seeing which removal changes who won — and it names one only when
**exactly one** does. At a margin of a single point every point the winner holds
is decisive, so naming one is picking a favourite among equals, and the honest
line there is the margin. The check asserts the property rather than the string:
take the component the line names out of `scoreDeal`'s answer, and the other
player has to win. A table of phrases passes that test only by accident.

**And an assertion about a page's language belongs on the element that carries
it.** "The rules are in both languages" asserted as *a `lang` attribute exists
somewhere* passes a page whose English paragraphs are tagged Italian — the break
written for it survived, because deleting one `lang="en"` left six English
paragraphs behind. Each language is a `section[lang]` now and each section is
measured on its own, which is also what a screen reader and a hyphenator read.

**And a break that survives is the check confessing.** Iteration 4's mutation
run caught 126 of 141, and every one of the fifteen it did not is the same
family: an assertion that was never in a position to see its own subject. They
are worth more than the breaks that passed, and the shapes repeat.

- **A box bounded twice cannot be failed by removing one bound.** The say line
  is held inside the seat by `width: 100%` *and*, since the portrait seat became
  a flex row, by `flex: 0 0 100%`. Measured with and without the first: 16..304
  at 320x568, identical to the pixel. Both gone, and iteration 3's defect is
  back at −22px to 342px on a 320px screen. `break_ui.mjs` takes arrays for
  exactly this, and a survivor is how you find out you need one.
- **A hidden screen measures zero.** Show-points was turned off on the settings
  sheet and the points boxes were measured *there*, where every box on the table
  has no height whatever the setting says. An assertion has to look at the
  screen its subject is on.
- **A count is discriminating only when the numbers differ.** The history's
  tally was asserted against one smazzata, so *smazzate*, *vinte*, *perse* and
  *pari* were 1, 1, 0, 0 and three of the four cells could be wired to the wrong
  list and still agree. It is asserted against a win, a loss and a draw now.
- **An assertion made before anything has changed asks whether X equals X.**
  The deck row's name was read while the deck was still the one the markup
  ships, so the rule that writes it could be deleted entirely.
- **And a pass that drives the page has to survive the page being broken.**
  Eight of the nine mismatches were one cause: a click that times out on a
  broken page threw out of the pass and took every finding it had already made
  with it, so the harness saw eight failures with nothing in them. `checkDeal`
  has carried that guard since iteration 3; every pass that drives needs it.

**And an assertion behind a condition needs a fixture that meets the
condition.** Three of this iteration's survivors were one shape, and it is the
one to look for first: the rule was written correctly, and the fixture could
not reach it. The points box measured on a screen that was not on. The tally
measured against a single smazzata, where every count is 1. The record against
each opponent guarded by `names.length > 1`, with every seeded row against the
same name — so the block never rendered and the guard skipped in silence, which
looks exactly like passing. A guard that is never entered is an assertion that
is never made, and nothing but the break can tell you which you have.

**And a reservation for text is a height, and a height is measured.** The start
sheet holds space for the dossier so that choosing an opponent does not move the
deck row under a thumb already on its way to it. Tressette reserves four lines;
Franco's dossier is four lines on a laptop, five at 360x800 and **six at
320x568**, so the number was already wrong on the narrowest screen the game
claims to work on, before the roster has even grown. It is measured now — the
tallest dossier the roster produces at this width, re-measured when the phone
turns and when the webfont lands — which is the same rule the say line's rung
follows, and the same rule `--chrome` follows.

**And a guard is railed, not just written.** Five of iteration 4's assertions
sat behind a condition with nothing watching whether it was ever entered, and
the worst of them no viewport grid could have reached: `NOTE_OK` skipped its
whole property check when the result's note named no component, so a
`notaFinale` that stopped naming them and always fell back to the margin would
have left "2 punti di scarto." on a 5–3 deal with every pass green. The others
were a box measured on a screen that was not on, a count asserted where every
number was 1, a record block guarded on a second opponent the fixture never
seeded, and a collapse check that skips when the round happens to end on a
scopa. **When an assertion is optional, say out loud what makes it optional** —
`else out.push('… so the rule below was never asked')` — because an assertion
that is never made looks exactly like one that passed.

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
string was narrower. A check whose answer depends on the network is not a check,
so the three faces are served from `fonts/` and a fonts pass asserts that every
character is inside the shipped subset, that every `@font-face` loads with the
network cut, and that no subresource comes from the network. And **`node
tools/check_ui.mjs` passing locally is not the
same claim as CI being green** — read the job before saying a pull request is
green, because `break_ui.mjs` refuses to run at all against a page the check
fails, so a red check takes the mutation harness with it.

The environment includes the machine the work is done on. With no argument the
check resolved its own page through a `file://` URL's `pathname` and
`path.resolve`, which on Windows is `C:\C:\Users\…`, so it could not open the
page it exists to measure. CI is Linux and never saw it, and neither did three
iterations. `fileURLToPath` and `pathToFileURL` are identical on Linux and
correct on both.

**And the font a plate falls back to is not the one the page ships.** Iteration 4
shipped a name plate that fitted here and spilled 3px in CI at every 360x800
case in all five decks, with the local check green — the same shape as the
defect that made blocking necessary, one level down. `--font-label` ends in
`system-ui`, which is Segoe UI on Windows and DejaVu or Liberation Sans on a
Linux runner, and the second is wider. **A check whose answer depends on which
fonts the machine happens to have is not a check**, so it asks the question
against a spread of real metrics instead: the pass *the plates in a fallback
font* renders the plates in five label faces at six shapes. Anything sized to
fit text needs that treatment, not just a measurement taken once on one machine.

**And a box is derived from the type it has to hold, not from the type next to
it.** `--plate-w` was `7.5 × --t-pick` — the size of the NAME — when what sets
the plate's minimum is `avversario` beneath it at `--t-tiny`, which §5 measured
as longer than any name in the roster. The two agree until the scales come
apart, and they come apart exactly where both hit their floors: at 320 and 360
`--t-pick` is 16px and `--t-tiny` is 12.5px, so the token bought 120px against
125px of content. Deriving from the wrong one of two tokens is a coincidence
that holds until it does not, which is the same failure as hard-coding, wearing
a derivation.

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
| the points box spills past its own width | it shares a row with the plate, and a box sized by its content grows that row: `Graziano / avversario / mazziere` at max-content is 195px, the pair 323px of a 288px seat at 320x568, and the row wrapped into a plate row nobody had budgeted for — 72px of scrolling with the seat 63px below the fold. It is also what put the plate under this rule in portrait at all, where `width: auto` could never fail it |
| the say line still says "…" with the smazzata over | the score was in two places, and the second one still had the defect the first one's fix removed: the panel is held back while the last play is drawn, and the say line is not under it until it goes up |
| the note says "…", and taking X out of the score leaves the same player winning | the line names what decided the deal, so it has to be checkable against the deal — a phrase chosen from a table passes a string comparison and fails this |
| an abandoned smazzata was recorded | the confirm promises in so many words that nothing is written down |
| abandoning from the reload icon left the table | Tressette's: discarding went to the start sheet and dealt the new hand behind it, a live deal nobody could see or play |
| the smazzata ended and the confirm was still asking whether to abandon it | the confirm is a scrim, so the clock runs on behind it; when the deal ends the question is moot and its promise has just stopped being true |
| a row this build did not write took the history sheet down | one entry of another shape threw inside `renderHistory` and took the log *and* the button that clears it, so there was no way out from inside the game |
| typing the word played N card(s) | the easter egg comes back to the table here because only `1`–`3` are card keys; widen them and the `6` and the `4` in the word play cards as it is typed |
| the dossier does not hold its height | the start sheet keeps space for it so that choosing a name does not move the deck row under a thumb already on its way to it. Emptied and put back, rather than by clicking each chip — with one name in the roster, clicking the only chip re-renders the same sentence and nothing can move. It caught a real one: four lines is Tressette's number, and Franco's dossier is six at 320x568 |
| the tally counts […], the history holds […] | asserted against a win, a loss and a draw, because against one smazzata every cell is 1 and three of the four can be wired to the wrong list and still agree |
| N points box(es) still drawn with show-points off | measured at the table, not from the settings sheet: every box on a hidden screen has no height whatever the setting says |
| #plateOpp spills Npx past its own width, in the fallback-font pass | `--plate-w` was `7.5 × --t-pick`, the size of the name, when what sets the plate's minimum is `avversario` beneath it at `--t-tiny`. The two agree until both hit their floors — 16px and 12.5px at 320 and 360 — and then the box is 120px against 125px of content, in a fallback wider than the one this machine picks |
| the sheets could not be driven to the end | not a rule about the page — it is the pass admitting a click timed out. Without it an exception took every finding the pass had already made with it, and the mutation harness saw eight failures with nothing in them |
| the deck picker is on N rows, not one | a sixth deck against a hard-coded `repeat(5, 1fr)` wraps onto a second row and pushes the settings sheet's controls down — no overflow, no clipped text, no small tap target, so every other rule passes a picker folded in half. `buildDecks` sets `--deck-cols` from the deck table; the CSS fallback beside it cannot fail, because it is set before the element has children. Sharing a top is the whole of "one row" |
| the history accepts a timestamp it cannot format | `Number.isFinite(m.t)` passes `1e100`, which is outside Date's range, and `Intl.DateTimeFormat.format` then throws `RangeError` mid-render — before the button that clears the bad row. The row seeds it beside a valid timestamp and asserts the drop, the draw and the clear button |

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
