> Guidance for Claude Code. The OpenCode review process is in AGENTS.md. Shared principles: PRINCIPLES.md.

# Scopetta

A two-player Scopa game for the browser, the third of a series after
[Discola](https://github.com/diegoami/discola-web) and
[Tressette](https://github.com/diegoami/Tressette): one static page, no build
step, the 1997 card art, one opponent formula with a weight vector per name.

`PLAN.md` is the architecture and the plan, and it is the reference for
anything this file does not state. Section 7 says how the work is organised:
one iteration per session, a fresh-context review per pull request, and the
verification gates whose schedule is in [`AGENTS.md`](AGENTS.md). Section 0
lists the decisions that were the owner's to make, each
with a default. The first seven are confirmed; the eighth — what *scopa
d'assi* would mean, if it is ever wanted — was raised by iteration 1 and is
open, and blocks nothing. Tressette is the reference
for everything the plan does not state, and Discola for everything Tressette
does not; clone both beside this repo if they are not already there.

## How this file relates to the others

The tool-agnostic working principles are in
[`PRINCIPLES.md`](PRINCIPLES.md): reproduce a finding or a claim before acting on
it, say what a passing check would have caught, treat one measurement as a coin
toss, flag out-of-scope defects, show diffs, the paths to inspect and ignore,
keeping command output short, and the session handoff. Read them there; this file
keeps the project's own rules.

## How changes are reviewed

The shared principles, the **ownership map** and the test for a **non-trivial**
change are in [`PRINCIPLES.md`](PRINCIPLES.md); the **verification gates** — the
commands and how many times the full suite runs before a push — are in
[`AGENTS.md`](AGENTS.md). Read the principles; run the gates.

**Under Claude Code, Claude runs each change end to end, and the independent
review comes at milestones.** That is the owner's decision, recorded on #44 and
#47. The cross-model review and its two stages are OpenCode's, in `AGENTS.md`,
and apply only there.

**Each change.** A trivial change may be committed straight to `main`, per
`PRINCIPLES.md`.
A **non-trivial** change takes **no design stage** and needs nothing from the
owner: Claude opens a pull request, runs the gates in `AGENTS.md`, and spawns a
**fresh-context reviewer subagent**. The subagent is given the pull request, any
issue it links and these documents, and none of the builder's conversation. The
same model family is fine; the fresh context is the point. The reviewer
reproduces what it reports and does not edit the change. It posts its verdict on
the pull request with `gh pr comment`, ending in `AGREE` or `BLOCK`, and signs it
`— <model name> (<model id>), fresh-context subagent, reviewer`. The builder fixes
the change in the same pull request, and **a re-review may continue the same
subagent**. A pull request that fixes an issue closes it with a `Closes` line,
written and checked as `AGENTS.md` § *Two stages* says. Claude merges on an
`AGREE` **given on the revision being merged** and green CI. Any push after the `AGREE` needs a fresh verdict, unless it
changes only commit messages, whitespace or a typo that alters no behaviour, no
assertion and no process text. A finding the builder disagrees with goes to the
owner, not around the reviewer. A finding outside the change is routed as
`PRINCIPLES.md` says. The **owner may also review**, as an independent option,
but an owner is **not automatically a fresh context** — and is not one if they
directed or wrote the change.

**Each milestone.** When a milestone is reached, Claude opens a **GitHub issue
requesting an independent review of the repository** by a model of **another
family** — Codex, GPT-5.6 Luna, or any other that is not Claude. **The issue is
the request**: it is labelled `independent-review`, it holds the prompt, and the
owner runs it from there when they have the chance. Claude does not hand the
prompt over in chat and does not wait for it. A milestone is:
- an iteration or a release shipped;
- a change to this process;
- a run of merged pull requests worth an outside look;
- or whenever the owner asks.

**The issue records the review.** Its title is `Milestone review: <milestone>`,
and its body holds the prompt itself and the commit range. The range starts at
the **reviewed end** recorded in the last closed `independent-review` issue that
has one, exclusive, or covers all of history if there is none. An issue the owner
closes without running records no reviewed end, so its commits fall to the next
review. It ends at the SHA of
`main` when the issue is opened, recorded as a SHA. That issue is how the next
milestone finds its range.

**A milestone review never blocks anything.** The owner runs it when
they can, however long that takes, or not at all. An open `independent-review`
issue is not a to-do for Claude and not a condition on any change: every change
still merges on its own subagent review. Claude only checks it for a posted
summary, at the start of a session and before extending it. If a new milestone arrives while an
earlier review's issue is still open, Claude does not open a second issue. It
updates the open one in place: the title and the milestones it names, the range
end moved to the current `main` SHA, and the prompt. If the owner has already
started the old prompt, nothing is lost, because the **reviewed end** is what
the next range starts from, not the planned end.

The prompt names the milestone, the range, what to read and what to question. It
asks the reviewer to:
- reproduce every finding before stating it;
- edit nothing;
- file each finding as a GitHub issue (`defect` when it is one), after checking
  the open issues first, and linking the milestone-review issue;
- post a summary on the milestone-review issue, even if it found nothing, listing
  the issues it filed and stating the range end it reviewed, as a SHA;
- sign both with `— <display name> (<model id>), milestone reviewer`.

When the summary is posted, Claude records the SHA it states as the issue's
**reviewed end**, closes the issue and works the filed issues like any other. If
that SHA is earlier than the issue's planned end, the rest of the range is
simply the next review's. This is where a blind spot Claude
shares with its own subagent gets caught, so the prompt asks for what to doubt,
not for a checklist to confirm. Everything in `PRINCIPLES.md` applies either way.

## The UI check, and why it exists

The gate — the command, when it runs, and the CI schedule — is in
[`AGENTS.md`](AGENTS.md); this section is the rationale behind it, and it exists
because reading the diff was repeatedly not enough.

**The suspension ended at iteration 3.** The check is this game's now — its
own fixtures, its own table row, `scopetta` where it used to say `tressette` —
and `check.yml` has the job that runs it. `SPEC.md` §7 lists what it covers and
[`AGENTS.md`](AGENTS.md) states the gates; this file does not repeat either, so
the pass list has one home.

**Which card a tap lands on, and which words a player can read, are decided by
paint order, and nothing about paint order moves a box.** Four of iteration 3's
defects were only that, and every geometric assertion was green through all of
them. So the check hit-tests: the table row a pixel at a time with
`elementFromPoint`, and the say line while a card is raised. When a rule is
about what reaches the player rather than about where a box is, measure what
the page answers, not what it contains.

**`break_ui.mjs` is the other half** of the check, and the gate that runs it —
when, and against what — is in [`AGENTS.md`](AGENTS.md). It breaks the page on
purpose, one defect at a time, and checks that the assertion *written for that
defect* goes red — not merely that something did.

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

**And the first of anything is a state too.** The first hand of a session was
dealt in only because something had rendered the table before Gioca was pressed
— and the only thing that does is `document.fonts.ready`. On a cold load with
the font still on its way, the first hand a player ever sees *appears*:
measured, `{"drawn":6,"dealt":0}` against a settled-font control of
`{"drawn":6,"dealt":6}`. The check could not see it from either side, because
it blocks the webfont so `fonts.ready` resolves at once, and because no pass
looked at the first deal at all — only at a round boundary. **A slot now starts
with `data-empty="true"` rather than with nothing**, and the rule is asserted on
`buildHands` itself rather than on the outcome, because the outcome measures the
boot render and not the function.

**And an assertion has to be about what the thing is FOR.** "The page entered
the beat" had a firing set strictly inside the window assertion's and could
never go red on its own — and, worse, nothing anywhere said `BEAT` did
anything: the hands are already empty for `LANDS + SWEEP`, so setting it to
zero changed nothing any rule could see. What `BEAT` buys is *holding* the empty
hands after the table has settled, so that is what is measured, sampled once
`sweeping` and `laid` are clear rather than at the play.

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

The `ui-check` skill explains what it covers and how to read a failure.

## The unit tests, and why they exist

The gate — the command and when it runs — is in [`AGENTS.md`](AGENTS.md); this is
what they are for. They are deterministic — the shuffle and Piero's roll both
arrive as a seeded rng — and they cover what the UI check cannot see: the capture
rules, the scoring of every point, the trap positions, the search that refuses a
position it cannot deduce, and the golden fixture's frozen deals. They live in
`tools/engine.test.mjs` and `tools/opponent.test.mjs`.

The golden fixture freezes the plays: a formula change moves them by accident and
the test says so, and a weight change moves them deliberately and the fixture is
re-recorded in the same commit — `node tools/selfplay.mjs --golden >
tools/golden.json`, which is what `tools/golden.json` is.

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
  English, and `REGOLE.md` is the exception that proves it: it is the rules
  screen's long form, for a player, so it is in the language the game is played
  in. Those two documents **cite the screen's wording rather than restating
  it** — a rule written twice in two places drifts, and the screen is the copy
  a player actually reads.
- No build step and no runtime dependencies. `playwright-core` is for the UI
  check only and is gitignored.
- The card art is the original 1997 bitmaps, copied byte for byte from
  Tressette, which copied them from Discola. Do not redraw it and do not
  repack it. `tools/pack_cards.py` is carried over in case a deck is ever
  repacked, from the BMPs in `diegoami/briscola-JS`.
- Anything learned outlives the session in one of three files and nowhere else:
  a decision in §0 of `PLAN.md`, a rule the builder must follow here, and at
  iteration 6 everything a stranger needs in `SPEC.md`.
