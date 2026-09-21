// Break the page on purpose, one defect at a time, and check the UI check
// notices.
//
//   node tools/break_ui.mjs            every break
//   node tools/break_ui.mjs toast      only the breaks whose name matches
//
// CLAUDE.md: "a new assertion is made to fail before it is made to pass. Write
// it against a deliberately broken page first and watch it go red, because an
// assertion written against already-correct code encodes what the code happens
// to do rather than what it should do."
//
// tools/break.mjs does this for the engine. This is the same thing for the
// page, and for the same reason: doing it by hand produces a claim in a pull
// request that nobody can re-derive, and §7.5 says a measured number and a
// remembered one look the same on the page.
//
// Each break is one edit to public/index.html, applied to a copy in a temp
// directory, with the check pointed at that copy. It changes nothing in the
// repository. It runs with QUICK=1, which trims the viewport grid: a quick run
// is for proving an assertion bites, never for clearing one.
//
// A break must be caught by the assertion written for it, not merely by some
// assertion — EXPECT names which, and a break caught only by others is
// MISMATCH and red. That distinction is the whole point: "the check went red"
// and "the rule I wrote saw the defect it was written for" are different
// claims, and only the second is worth anything.
//
// WHAT IS NOT IN HERE, and why, because a list of breaks reads like a list of
// what is covered and this one has holes in it:
//
//   - the audit's `clips its text` has no subject on this page: it needs an
//     element whose own overflow-x clips its own text, and the table has none.
//     It is carried for the sheets iteration 4 brings;
//   - `the next round was not dealt` is the engine's business, and
//     tools/engine.test.mjs owns it;
//   - the rails, which say the PASS did what it claims rather than anything
//     about the page, and so do not fail by breaking it: `the deal did not
//     finish`, `N plays, want 36`, `N cards in the piles, want 40`, `no capture
//     was chosen by tapping / by accepting`, `the driver never reached the end
//     of a round`, `the deal could not be driven to the end`, `the posed
//     position offers only one capture`, `nothing on the crowded table is
//     marked`, `the say line has no box while a card is raised`, `Gioca did not
//     deal`, `#icon did not open #view`, `the confirm did not open over the
//     deal that was about to end`, and `"Ancora" asked whether to abandon a
//     smazzata that was already over` — the last of those is a rail because
//     "Ancora" does not go through `askAbandon` at all, and the rule that it
//     must not is the one `the confirm opens over a smazzata that is over`
//     breaks;
//   - the SOUND. `blip` and the scopa's second, brighter `chime` need an audio
//     device, and a headless Chromium has none; the whole of both is inside a
//     try/catch for exactly that reason, so a break in them cannot be told
//     from a machine with no sound card. What IS asserted is the setting that
//     turns them off reaching the state and surviving a reload;
//   - `prefers-reduced-motion`, which this check turns motion off for anyway,
//     by hand, in every pass;
//   - the deal-in ANIMATION, as opposed to the mark the page puts on a card it
//     has just dealt, which is asserted: this check runs with motion off on
//     purpose, so no pass can watch an animation run;
//   - and `document.fonts.ready` re-rendering the page, which has no assertion
//     at all: the check blocks the webfont on purpose so that its measurements
//     are deterministic and are the worst case, which means the state that
//     listener exists for — the font ARRIVING — is one the check never enters.
//     It is in the page because a player on a real phone sees it, not because
//     anything here watches it.
//
// And some assertions share a break, which is not a hole either. An EXPECT
// value names one RULE; a rule phrased in two passes is still one rule:
//
//   - `a sweep was played and nothing announced it` goes red with `the toast
//     never shows`;
//   - the audit's `N table card(s) overlap a hand card` with `the raised card
//     is lifted by 40% again`, whose EXPECT names the choice pass's phrasing,
//     `the raised card stands on N table card(s)` — the two are one rule and
//     the second is the one that fires at the shapes the quick grid renders;
//   - `after tapping a table card the marks are …` with `the proposal marks
//     every card on the table`;
//   - `table card N is Npx wide to a thumb` — the hit-tested floor, in both the
//     table pass and the choice pass — with `the table row loses its step
//     floor`, whose EXPECT names the computed one;
//   - `N scopa mark(s) drawn` in the sweep pass with `the scopa marks stop
//     counting`, whose EXPECT names the deal pass's phrasing;
//   - the choice pass's `the toast runs off the screen` with `the toast is
//     pushed off the right edge`, whose EXPECT names the audit's phrasing;
//   - `the say line says "X", which is none of the rungs it may say` and `the
//     say line is Npx in a Npx box` with `the say line says the whole capture
//     however long it is` and `the say line is sized by its content`, whose
//     EXPECTs name the two phrasings that fire first;
//   - `the position meant to say "X" played the card instead of raising it`
//     with `a capture with a choice plays instead of raising`;
//   - `N card(s) are already leaving before the card that takes them has landed`
//     with `nothing is drawn as the card that has just landed`, whose EXPECT
//     names the last play's phrasing, `N card(s) are already leaving on the
//     last play before it has landed` — one rule, "nothing leaves before the
//     card that takes it has landed", asserted at both of the plays that have
//     a landing beat.
//
// Iteration 4 adds three of the same kind, all of them one rule asserted at
// two doors:
//
//   - `Back from #viewSettings / #viewHistory did not return to the table` with
//     `the rules go back to the start sheet whatever they were opened from`,
//     whose EXPECT names the rules pass's phrasing. One `cameFrom`, four
//     screens;
//   - `"Cambia" did not land on the start sheet` with `changing opponent goes
//     back to the table`, whose EXPECT names the settings sheet's door. One
//     rule — leaving the table for the start sheet lands there — and two
//     buttons that do it;
//   - `the smazzata ended behind the confirm and the points were never counted
//     out` with `the points are not counted out`.
//
// The sixth review found three assertions in the sweep pass with no break at
// all and two of the breakdown's six rows never read back; those are breaks
// now, not entries in the list above. It also found two assertions that could
// not go red — one whose firing set was a strict subset of the membership check
// beside it, and one that clicked into the rules and straight back out, so no
// timer ever fired. The first is deleted and the second plays a card first.

import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

const PAGE = fileURLToPath(new URL("../public/index.html", import.meta.url));
const PUBLIC = dirname(PAGE);
const CHECK = fileURLToPath(new URL("./check_ui.mjs", import.meta.url));
const TEXT = readFileSync(PAGE, "utf8");

// The assertion each break must trip, as a substring of the line the check
// prints. Substrings, so they have to be chosen to name ONE assertion: "steps"
// used to stand for the step floor and matched "a table row's steps are uneven"
// just as well, which made the entry unable to tell the two apart.
const EXPECT = {
  // --- the document ---------------------------------------------------------
  "the viewport meta goes missing": "viewport meta",
  "the doctype goes missing": "quirks mode",
  "the charset is wrong": "charset is",
  "the lang attribute goes missing": "no lang",

  // --- the screens ----------------------------------------------------------
  "[hidden] stops beating the display rule": "screens visible at once",
  "the icon bar is made wider than the screen": "scrolls sideways",
  // Named again, but on a DIFFERENT element, and the reason matters. This was
  // loosened to the bare phrase on a diagnosis that the report's cap had hidden
  // `.seat__cards`; with nothing truncating any more it is still not reported,
  // so the cap was not the cause — growing --t-say moved which elements leave
  // the screen at all. What the missing `--seat-extra` term pays for is the two
  // name plates, and the player's own is what goes off the edge, so that is
  // what the entry names: one assertion, one element, tied to this defect
  // rather than to any overflow anywhere.
  "the plate is sized from the type it does not have to hold": "past its own width",
  "the plates are left out of the card budget": "#plateYou runs off",
  "the plates are squeezed instead of budgeted": "lands on the cards",
  "the plate is laid out as a flex row again": "past its own width",
  "the plate pays for one row again": "lands on the cards",
  "the plate's rows are under-measured": "past its own height",
  "a plate taller than a card costs nothing": "of scrolling",
  "the middle's own row gap is a hand-set constant again": "of scrolling",
  "the stacked seat's own gaps are not in the budget": "of scrolling",
  "the say line is sized by its content": "#selName runs off",
  "the say line is cut by a character count alone": "the say line wraps to",
  "the portrait card has a floor of its own": "below the fold",
  "the hand stays live while the table sweeps": "still tappable during the sweep",
  "the page never draws itself again when the screen changes": "after turning",
  "the small type drops below the floor": "want 12.5",
  "the say line is given a strip too short for it": "cut off by",
  "the say line is drawn under the raised card": "drawn over while a card is raised",
  "the say line gives up before it has to": "should name the capture",
  "the icon buttons shrink under the thumb": "tap target",

  // --- the budget -----------------------------------------------------------
  "--chrome is hard-coded instead of derived": "below the fold",
  "the say line collapses when it is empty": "tall — it must cost",
  "the rows of the table drift apart": "drift apart",

  // --- the middle row, §3.7 -------------------------------------------------
  "the table row loses its step floor": "px between cards, want",
  "the table row's steps go uneven": "steps are uneven",
  "the table row spills past its own box": "past its own box",
  "the table grows wider than the table": "outside the table",
  "the middle row lands on the hands": "land on a hand",
  // Wrapping in landscape costs a fourth card row against a budget that paid
  // for three. Before iteration 3's review this break was expected to go red on
  // "below the fold" — which it did, and which was the wrong answer written
  // down after the fact: the rule being broken is the wrap rule, and there was
  // no assertion for it. There is one now, and this is what it is for.
  "the table row wraps in landscape too": "row(s) in",
  "a marked card is raised above its neighbour": "of its strip",
  "a hovered card is raised above its neighbour": "of its strip",
  "a pointer takes the mark off a marked card": "not drawn as marked",

  // --- the raised card ------------------------------------------------------
  "the raised card is lifted by 40% again": "stands on",

  // --- the toast ------------------------------------------------------------
  "the toast joins the flow": "in the flow",
  "the toast is given a strip too short for it": "clips its own text",
  "the toast is pushed off the right edge": "#toast runs off",
  "the toast never shows": "did not show",

  // --- the capture choice ---------------------------------------------------
  "a capture with a choice plays instead of raising": "did not raise",
  "the proposal marks every card on the table": "the table marks",
  "the proposal marks nothing at all": "nothing on the table is marked",
  "the say line goes quiet while a card is raised": "is hidden while a card is raised",
  "the say line says the whole capture however long it is": "should name the capture",
  "the say line names the card instead of the capture": "does not say what the tap does",
  "the say line drops the suit that tells two sevens apart": "reads the same for both",
  "tapping a table card does not switch the proposal": "did not change the proposal",

  // --- the sweep and the beat ----------------------------------------------
  "the capture is not drawn leaving the table": "not drawn leaving the table",
  "the played card never lands on the table": "was not laid on the table",
  "a new hand appears between one frame and the next": "were not drawn as dealt",
  "the say line goes back to being the smallest type on the page": "want 14.5",
  "the points are not counted out": "never counted out",
  "the breakdown leaves a row out": "the breakdown lists",
  "the settebello is counted for the wrong player": "settebello, the piles hold",
  "the rules are Italian only": "never mention",
  "the rules go back to the start sheet whatever they were opened from": "went back to the start sheet",
  "the rows do not say what they are worth": "the points marked on the rows",
  "the rule the total comes from is not stated": "does not say what the total is made of",
  "the breakdown totals something else": "the breakdown totals",
  "the played card is not drawn as the new one": "drawn as the one just played",
  "a laid card is not drawn as the new one": "just played after a lay",
  "the sweep never ends": "still draws",
  "the capture sweeps toward the wrong player": "sweeping the wrong way",
  "half the capture is drawn leaving": "marked as leaving",
  "the toast announces the wrong thing": "the toast says",
  "the empty middle is allowed to collapse": "empty middle collapsed",
  "the empty hand is allowed to collapse": "card-sized slot",
  "the beat draws the new hand instead of the empty one": "both hands are empty",
  "nothing is drawn as the card that has just landed": "are already leaving on the last play",
  "the opponent's card is not marked as the one just played": "never drawn on the table",
  "a card that takes nothing is drawn leaving": "sweeping off the table",

  "the hand is only dealt in on the first deal": "were not drawn as dealt",
  "the first hand of a session is not dealt in": "start neither empty nor full",
  "the beat is entered and not held": "did not hold the beat",

  // --- what the fresh-context review of PR #8 found had no assertion --------
  "the last result is drawn at a label size": "want 14.5",
  "the last result is shown with nothing behind it": "with an empty history",
  "the last result says nothing about the smazzata": "says nothing about the smazzata behind it",
  "the last result names the wrong winner": "the start sheet reads",
  "show-points moves the table": "it stands in a column the budget",
  "the way on is not pinned": "below the fold inside a dialog",
  "the number keys stop playing cards": "did not raise a card",
  "space stops cycling the proposal": "Space did not cycle",
  "enter stops playing the raised card": "Enter did not play",
  "escape stops putting the card back": "Escape did not put the raised card back",
  "escape stops backing out of a sheet": "Escape did not back out",
  "clearing the history clears nothing": "smazzate in storage",
  "the record against each opponent counts wrong": "the record against",
  "the dossier is reserved once and never again": "after turning, the dossier",
  "a new deal does not clear the record flag": "played to the last card was lost",

  // --- what each side has taken, and the box it goes in --------------------
  "the plate takes whatever width it wants in portrait again": "of scrolling",
  "the points box is squeezed narrower than its content": "past its own width",
  "the points box outlives show-points": "still drawn with show-points off",

  // --- the start sheet ------------------------------------------------------
  "the opponents are a list written on the sheet": "the roster is",
  "the chosen opponent is not marked as chosen": "chips are pressed",
  "the dossier is left empty": "has no dossier",
  "the deck row loses a deck": "the deck row offers",
  "the deck row does not say which deck": "the deck row names",
  "the dossier stops holding its height": "does not hold its height",
  "the settings sheet is not told which deck was picked": "the settings sheet still says",
  "the start sheet has no row for its icon bar": "of nothing between the icon bar and the start sheet",

  // --- the settings sheet ---------------------------------------------------
  "the weights disclosure loses a weight": "the engine has",
  "the weights disclosure shows the wrong numbers": "plays with",
  "show-points does not reach the state": "show-points did not turn off",
  "the rhythm slider stores what it reads": "the rhythm slider set speed to",
  "the felt is stored and not applied": "the setting says",
  "the settings are never written down": "did not survive a reload",
  "the controls are not set from what was restored": "disagrees with the setting",

  // --- abandoning, and what it must not write down --------------------------
  "the card keys reach the table through a dialog": "played a card through the confirm",
  "the reload icon throws the deal away without asking": "without asking",
  "continuing to play throws the deal away anyway": "threw the deal away anyway",
  "abandoning goes to the start sheet instead of dealing": "left the table",
  "an abandoned smazzata is written down": "was recorded",
  "changing opponent does not ask": "changing opponent threw the deal away",
  "changing opponent goes back to the table": "did not land on the start sheet",

  // --- the result, and the partita around it --------------------------------
  "the confirm survives the smazzata it was asking about": "still asking whether to abandon",
  "the smazzata is never written down": "smazzate in the history after one deal",
  "the smazzata is written down once the table has finished showing it": "played to the last card was lost",
  "the score is written down backwards": "the history recorded",
  "the history is told the wrong opponent": "the deal was",
  "the confirm opens over a smazzata that is over": "already recorded",
  "the verdict is not read off the totals": "the result says",
  "nothing says what decided the smazzata": "nothing says what decided it",
  "the deciding point is picked rather than computed": "leaves the same player winning",
  "the note names no component at all": "names no component",
  "a draw is described as a win": "and the note says",
  "the result offers one way on": "the result offers",
  "the result panel is never taken down": "still over the table",
  "the say line keeps the score after the smazzata": "the score is the result panel",

  // --- the history of smazzate ---------------------------------------------
  "the history grows without a bound": "it is capped at 100",
  "a smazzata is added to the end of the history": "the one just recorded was",
  "the history sheet draws only some of it": "rows for",
  "the history row reads the score backwards": "the smazzata was",
  "the history row always reads as a win": "is marked V, want",
  "the tally counts something else": "the tally counts",
  "a row this build did not write is rendered anyway": "took the history sheet down",
  "the history formats a timestamp outside Date's range": "want the one with a real date",

  // --- the easter egg -------------------------------------------------------
  "the 1997 word does nothing": "did not turn the opponent",
  "the face-up hand is drawn face down anyway": "of the opponent",
  "the face-up hand says nothing about itself": "nothing says so",
  "the card keys eat the letters of the word": "typing the word played",

  // --- the last play of the deal, and the window before a beat --------------
  "the points are counted out over the last play": "before it has been drawn",
  "the last play sends the played card to whoever played it": "with the leftovers",
  "the last card of an empty table is drawn nowhere": "is drawn on a table of",
  "the next round is drawn while the last card is still landing": "already drawn",
  "the rules let the deal play on behind them": "played on behind the rules",

  // --- the page against the engine -----------------------------------------
  "the pile badge stops counting": "badges say",
  "the deck badge stops counting": "the deck badge says",
  "the scopa marks stop counting": "scopa marks",
  "the primiera counter reads the wrong pile": "counters say",
  "the counters stop at three points": "counters say",
  "the middle draws a card the engine does not hold": "cards, the engine holds",
  "the denari are counted for the wrong player": "denari, the piles hold",
  "the primiera is read from the wrong pile": "of primiera, the piles make",
  "carte counts something other than the pile": "cards, the piles hold",
  "the scope row stops counting": "scope, the engine counted",
  "the leftovers are left on the table": "still shows",
  "a played card keeps its face": "shows a card",
  "a slot you hold is drawn empty": "holds a card and shows none",
};

// A break that cannot change what the page does, with how that was measured.
// Marking one equivalent is a claim, so it carries its evidence; and a mutant
// claimed equivalent that IS caught means the claim was wrong, which is red.
const EQUIVALENT = {
  "the result is drawn wherever the player happens to be":
    "`show(\"table\")` in `finish` is Tressette's rule — the result closes " +
    "whatever sheet is in front of it — and in this game there is never one in " +
    "front. `show` HOLDS the table's clock on the way to every screen, so a " +
    "pending `finish` cannot run while a sheet is up; and the only other thing " +
    "that can cover the table when a deal ends is the confirm, which is a " +
    "scrim OVER the table rather than a screen instead of it. So the call " +
    "cannot differ in any state this game can reach, which is why the break " +
    "survived the whole check. The assertion written for it is deleted rather " +
    "than kept as cover; the call stays, because it is what keeps the rule " +
    "true if the clock-holding one is ever narrowed to fewer screens than the " +
    "four it covers today.",
  "the table row grows the table instead of overlapping":
    "On a correct page it changes nothing, measured with and without at " +
    "360x800, 500x425, 980x385, 768x1024 and 1440x900 with thirteen cards " +
    "down: same rows, same steps, same edges to the pixel. What it changes is " +
    "on a BROKEN page — it is what makes the spill assertion reachable, since " +
    "an auto column grows with its row and .tavola-row's `width: 100%` follows " +
    "it. Measured that way too: with the step formula replaced by a fixed gap, " +
    "bounded the check reports `a table row spills 74px past its own box`; " +
    "unbounded it reports the row running off the SCREEN and nothing about the " +
    "row\'s own box, which is the assertion this line exists to make reachable. " +
    "So no single break can catch it, and the pair of them is the evidence.",
};

const BREAKS = [
  // --- the document ---------------------------------------------------------
  ["the viewport meta goes missing",
   `<meta name="viewport" content="width=device-width, initial-scale=1">\n`, ""],
  ["the doctype goes missing", "<!DOCTYPE html>\n", ""],
  ["the charset is wrong", `<meta charset="utf-8">`, `<meta charset="iso-8859-1">`],
  ["the lang attribute goes missing", `<html lang="it">`, "<html>"],

  // --- every screen at once, and the page's own width -----------------------
  ["[hidden] stops beating the display rule",
   "[hidden]{ display: none !important; }", "[hidden]{ display: none; }"],
  ["the icon bar is made wider than the screen",
   ".topbar{\n  height: var(--topbar);", ".topbar{\n  min-width: 130vw;\n  height: var(--topbar);"],

  // --- §3.7's width term, which is where iteration 3's first defect lived ----
  // Without the plates the seat row needs more width than the screen has, the
  // table grows to fit it, and `overflow: hidden auto` carries the deck and
  // your own plate off the right edge with no sideways scroll to show for it.
  // The defect CI caught and this machine could not: 7.5 x --t-pick is 120px
  // where --t-pick is on its 16px floor, against 125px of `avversario` in a
  // fallback wider than the one Windows picks. The pass that catches it renders
  // the plates in five real label faces rather than in whichever one the
  // machine happens to have.
  ["the plate is sized from the type it does not have to hold",
   "  --plate-w: calc(var(--t-tiny) * 10.8);",
   "  --plate-w: calc(var(--t-pick) * 7.5);"],
  ["the plates are left out of the card budget",
   "  --seat-extra: calc(2 * var(--plate-w) + 2 * var(--step));",
   "  --seat-extra: 0px;"],
  // The other half of the same defect: bound the columns instead of paying for
  // the plates and the plate sits on the cards rather than off the screen.
  ["the plates are squeezed instead of budgeted",
   ["  --seat-extra: calc(2 * var(--plate-w) + 2 * var(--step));",
    "  grid-template-columns: 1fr auto 1fr;"],
   ["  --seat-extra: 0px;",
    "  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);"]],
  ["the plate pays for one row again",
   "  --plate-h: calc(max(var(--t-pick) * 1.45, 1.5rem)\n                  + 2 * var(--plate-row) + .2rem + .7rem);",
   "  --plate-h: calc(max(var(--t-pick) * 1.45, 1.5rem) + .7rem);"],
  ["the plate's rows are under-measured",
   "  --plate-row: calc(var(--t-tiny) * 1.4);    /* the role, and the mazziere tag */",
   "  --plate-row: calc(var(--t-tiny) * 0.6);    /* the role, and the mazziere tag */"],
  ["the stacked seat's own gaps are not in the budget",
   "    --plates: calc(2 * var(--plate-h) + 4 * var(--seat-gap));",
   "    --plates: calc(2 * var(--plate-h) + 2 * var(--seat-gap));"],
  ["the portrait card has a floor of its own",
   "    --cw: clamp(32px, min(var(--cw-height), var(--cw-width)), 168px);",
   "    --cw: clamp(36px, min(var(--cw-height), var(--cw-width)), 168px);"],
  ["a plate taller than a card costs nothing",
   "  --seat-overhang: calc(2 * var(--plate-h));",
   "  --seat-overhang: 0px;"],
  ["the middle's own row gap is a hand-set constant again",
   "    --extra-gap: var(--step);", "    --extra-gap: .5rem;"],
  ["the plate is laid out as a flex row again",
   "  display: grid;\n  grid-template-columns: auto minmax(0, 1fr);\n  align-items: center;\n  column-gap: .5rem;\n  row-gap: .1rem;\n  padding: .35rem .8rem;",
   "  display: flex;\n  align-items: center;\n  gap: .7rem;\n  padding: .35rem .8rem;"],

  // --- type, and what clips it ----------------------------------------------
  ["the small type drops below the floor", "  --t-tiny:  .8rem;", "  --t-tiny:  .62rem;"],
  ["the say line is given a strip too short for it",
   "  --say: calc(var(--t-say) * 1.5 + 4px);", "  --say: 9px;"],
  ["the icon buttons shrink under the thumb",
   "  width: 38px; height: 38px;", "  width: 24px; height: 24px;"],

  // --- the budget -----------------------------------------------------------
  ["--chrome is hard-coded instead of derived",
   "  --chrome: calc(var(--topbar) + 2*var(--pad-block) + 2*var(--step)\n                 + 2*var(--tavola-pad) + var(--extra-gap) + var(--plates)\n                 + var(--say) + var(--slack));",
   "  --chrome: 150px;"],
  ["the say line collapses when it is empty",
   "  height: var(--say);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  overflow: hidden;\n}",
   "  height: auto;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  overflow: hidden;\n}"],
  ["the rows of the table drift apart",
   ".middle{\n  display: grid;", ".middle{\n  margin-top: 110px;\n  display: grid;"],

  ["the table row grows the table instead of overlapping",
   "  grid-template-columns: minmax(0, 1fr);\n  gap: var(--step);\n  justify-items: center;",
   "  gap: var(--step);\n  justify-items: center;"],

  // --- §3.7 row 1: the middle row at 0, 4, 8 and 13 cards -------------------
  ["the table row loses its step floor",
   "    min(var(--cw) + var(--gap), (100% - var(--cw)) / (max(var(--n, 2), 2) - 1))\n    - var(--cw));",
   "    min(var(--cw) + var(--gap), (100% - var(--cw)) / (max(var(--n, 2), 2) - 1)) * .18\n    - var(--cw));"],
  ["the table row's steps go uneven",
   ".tavola-row > * + *{", ".tavola-row > *:nth-child(3){ margin-left: 7px; }\n.tavola-row > * + *{"],
  ["the table row spills past its own box",
   "  margin-left: calc(\n    min(var(--cw) + var(--gap), (100% - var(--cw)) / (max(var(--n, 2), 2) - 1))\n    - var(--cw));",
   "  margin-left: var(--gap);"],
  ["the table grows wider than the table",
   "  justify-items: center;\n  width: 100%;\n  padding: var(--tavola-pad);",
   "  justify-items: center;\n  width: 124%;\n  padding: var(--tavola-pad);"],
  ["the middle row lands on the hands",
   ".middle{\n  display: grid;", ".middle{\n  margin-block: -42px;\n  display: grid;"],
  ["the table row wraps in landscape too",
   "  const portrait = window.matchMedia(\"(orientation: portrait)\").matches;",
   "  const portrait = true;"],

  // --- who a tap lands on ---------------------------------------------------
  // Both of these were in the sheet when iteration 3 was first pushed. Neither
  // moves a box: they change which card is PAINTED on top, and the card under
  // it stops taking taps over the part that is covered.
  ["a marked card is raised above its neighbour",
   ".tavola-row > *{ z-index: auto; }",
   ".tavola-row > *{ z-index: 1; }\n.tavola-row > *[data-take=\"true\"]{ z-index: 2; }"],
  ["a pointer takes the mark off a marked card",
   ".tavola-row > button.card[data-take=\"true\"]:not(:disabled):hover,\n.tavola-row > button.card[data-take=\"true\"]:not(:disabled):focus-visible{\n  box-shadow: 0 2px 5px rgba(0,0,0,.45), inset 0 0 0 2px var(--brass),\n              inset 0 0 22px rgba(200,162,74,.55);\n}",
   ""],
  ["a hovered card is raised above its neighbour",
   ".tavola-row > button.card:not(:disabled):hover,\n.tavola-row > button.card:not(:disabled):focus-visible{\n  transform: none;\n  box-shadow: 0 2px 5px rgba(0,0,0,.45), inset 0 0 0 2px var(--ivory);\n}",
   ""],

  // --- the raised card ------------------------------------------------------
  ["the raised card is lifted by 40% again",
   "  transform:\n    translateY(calc(-1 * min(.4 * var(--ch),\n                             var(--say) + var(--step) + var(--tavola-pad)\n                             - .03 * var(--ch))))\n    scale(1.04);",
   "  transform: translateY(-40%) scale(1.04);"],

  // --- §3.7 row 3: the toast floats ----------------------------------------
  ["the toast joins the flow",
   ".table > .toast{\n  position: absolute;", ".table > .toast{\n  position: static;"],
  ["the toast is given a strip too short for it",
   "  max-width: calc(100% - 2 * var(--pad-inline));\n  margin: 0 auto;",
   "  max-width: 90px;\n  height: 1.2em;\n  overflow: hidden;\n  margin: 0 auto;"],
  ["the toast is pushed off the right edge",
   "  left: var(--pad-inline);\n  right: var(--pad-inline);",
   "  left: 92%;\n  right: auto;"],
  ["the toast never shows",
   "  el.toast.textContent = text;\n  el.toast.hidden = false;",
   "  el.toast.textContent = text;"],

  // --- §3.7 row 2: the capture choice ---------------------------------------
  ["a capture with a choice plays instead of raising",
   "  const opts = prese(state.tavola, state.hands[BASSO][slot]);\n  if (opts.length > 1){",
   "  const opts = prese(state.tavola, state.hands[BASSO][slot]);\n  if (opts.length > 99){"],
  ["the proposal marks every card on the table",
   "      b.dataset.take = String(!sweeping && take.has(idx));",
   "      b.dataset.take = \"true\";"],
  ["the proposal marks nothing at all",
   "      b.dataset.take = String(!sweeping && take.has(idx));",
   "      b.dataset.take = \"false\";"],
  ["the say line goes quiet while a card is raised",
   "  const presa = propostaCorrente();\n  el.selName.hidden = false;",
   "  const presa = propostaCorrente();\n  el.selName.hidden = true;"],
  ["the say line says the whole capture however long it is",
   "  for (const rung of rungs){\n    el.selName.textContent = rung;\n    if (rung.length <= LABEL_CHARS\n        && el.selName.getBoundingClientRect().height <= oneLine) break;\n  }",
   "  el.selName.textContent = rungs[0];"],
  // TWO edits since iteration 4, and the second one is the finding. The say
  // line is bounded twice over now: by `width: 100%` on `.say`, which is what
  // iteration 3 added, and by `flex: 0 0 100%` on it in portrait, which arrived
  // with the seat becoming a flex row so that the plate and the points box
  // could share a line. Either one alone holds the plaque inside the seat, so
  // removing either one alone changes nothing and the one-edit break SURVIVED
  // — measured: with and without `width: 100%` the line is 16..304 at 320x568,
  // identical to the pixel.
  //
  // With both gone the original defect is back exactly: at 320x568 the line
  // runs **-22px to 342px** on a 320px screen, off both edges, where iteration
  // 3 measured -8 to 328. Portrait only — in landscape `.say` is a grid item
  // spanning the seat and stretches whatever happens here.
  ["the say line is sized by its content",
   ["  width: 100%;\n  height: var(--say);\n  display: flex;",
    "  .say, .seat__cards{ flex: 0 0 100%; }"],
   ["  height: var(--say);\n  display: flex;",
    "  .seat__cards{ flex: 0 0 100%; }"]],
  ["the say line is cut by a character count alone",
   "    if (rung.length <= LABEL_CHARS\n        && el.selName.getBoundingClientRect().height <= oneLine) break;",
   "    if (rung.length <= LABEL_CHARS) break;"],
  ["the page never draws itself again when the screen changes",
   "window.addEventListener(\"resize\", () => {\n  if (redraw) return;\n  redraw = requestAnimationFrame(() => { redraw = 0; render(); reserveDossier(); });\n});",
   ""],
  ["the hand stays live while the table sweeps",
   "    node.disabled = !yourTurn || !card || !!sweeping;",
   "    node.disabled = !yourTurn || !card;"],
  ["the say line is drawn under the raised card",
   "  position: relative;\n  z-index: 4;\n", "  position: relative;\n"],
  ["the say line gives up before it has to",
   "const LABEL_CHARS = 39;", "const LABEL_CHARS = 0;"],
  ["the say line names the card instead of the capture",
   "    `Prendi ${lista} con ${art(breve(card))}`,",
   "    `Il ${breve(card)}`,"],
  ["the say line drops the suit that tells two sevens apart",
   "  const presi = presa.map(i => art(nomePresa(state.tavola[i])));",
   "  const presi = presa.map(i => art(breve(state.tavola[i])));"],
  ["tapping a table card does not switch the proposal",
   "  const found = opts.findIndex(set => set.includes(idx));\n  if (found < 0) return;\n  state.scelta = found;",
   "  const found = opts.findIndex(set => set.includes(idx));\n  if (found < 0) return;"],

  // --- the sweep, and the beat between rounds -------------------------------
  ["the empty middle is allowed to collapse",
   ["  /* A table row all deal, so an empty table does not collapse the middle and\n     re-centre everything above and below it. A scopa empties it every few\n     plays, which is exactly when the player is looking. */\n  min-height: var(--ch);",
    "  width: 100%;\n  min-height: var(--ch);\n}\n.tavola-row > * + *{"],
   ["",
    "  width: 100%;\n}\n.tavola-row > * + *{"]],
  ["the empty hand is allowed to collapse",
   ".card[data-empty=\"true\"]{\n  background-image: none;",
   ".card[data-empty=\"true\"]{\n  display: none;\n  background-image: none;"],
  ["the beat draws the new hand instead of the empty one",
   "const mano = who => (beat || !state.hands[who]) ? [null, null, null] : state.hands[who];",
   "const mano = who => state.hands[who] || [null, null, null];"],

  ["a new hand appears between one frame and the next",
   "    dealt(node, was);\n  });\n  el.cheatNote.hidden = !state.cheat;",
   "  });\n  el.cheatNote.hidden = !state.cheat;"],
  ["the say line goes back to being the smallest type on the page",
   "  --t-say:   clamp(15px, 4.2vw, 34px);", "  --t-say:   clamp(12.5px, 3.2vw, 28px);"],
  ["the points are not counted out",
   "  el.result.hidden = !over;", "  el.result.hidden = true;"],
  ["the rows do not say what they are worth",
   "    const pts = who => won === \"scope\" ? r.scope[who] : (won === who ? 1 : 0);",
   "    const pts = who => 0;"],
  ["the rule the total comes from is not stated",
   "        <p class=\"result__rule\">Un punto per le carte, i denari, il settebello e la\n          primiera, più un punto per ogni scopa.</p>\n",
   ""],
  ["the rules are Italian only",
   "      <section lang=\"en\">", "      <section>"],
  ["the rules go back to the start sheet whatever they were opened from",
   "  cameFrom = onScreen === \"table\" ? \"table\" : \"start\";",
   "  cameFrom = \"start\";"],
  ["the settebello is counted for the wrong player",
   "  const has = w => piles[w].some(isSettebello) ? 1 : 0;",
   "  const has = w => piles[1 - w].some(isSettebello) ? 1 : 0;"],
  ["the breakdown leaves a row out",
   "    [\"scope\",      r.scope[BASSO], r.scope[ALTO], \"scope\"],", ""],
  ["the breakdown totals something else",
   "  out.push(num(r.punti[BASSO], \"r-num r-total\", 0));",
   "  out.push(num(r.punti[BASSO] + 1, \"r-num r-total\", 0));"],

  // The defect the owner found by playing the preview: a capturing card went
  // from a hand to a pile and was drawn nowhere, so the opponent's play could
  // not be seen at all.
  ["the played card never lands on the table",
   "  const cards = before.concat([r.card]);",
   "  const cards = before.slice();"],
  ["the played card is not drawn as the new one",
   "      if (sweeping ? idx === sweeping.played : idx === laid) b.dataset.played = \"true\";",
   "      if (sweeping ? false : idx === laid) b.dataset.played = \"true\";"],
  ["a laid card is not drawn as the new one",
   "    laid = state.tavola.length - 1;\n    render();",
   "    render();"],
  // Beat two of a capture. Beat one already drew the played card among the
  // ones it is taking; what this break removes is the beat where they all go.
  ["the capture is not drawn leaving the table",
   "    sweeping = { cards, dir, played: landed };",
   "    sweeping = null;"],
  ["the sweep never ends",
   "    later(then, state.speed * SWEEP);",
   "    /* nothing takes the table off hold */"],
  ["half the capture is drawn leaving",
   "  for (const i of (r.presa.length ? (presa || []) : [])) dir[i] = who;",
   "  for (const i of (r.presa.length ? (presa || []).slice(0, 1) : [])) dir[i] = who;"],
  ["the toast announces the wrong thing",
   "  if (r.scopa){ toast(\"Scopa!\"); chime(); }", "  if (r.scopa){ toast(\"Presa!\"); chime(); }"],
  ["the capture sweeps toward the wrong player",
   "  for (const i of (r.presa.length ? (presa || []) : [])) dir[i] = who;",
   "  for (const i of (r.presa.length ? (presa || []) : [])) dir[i] = 1 - who;"],

  // --- the page against the engine ------------------------------------------
  ["the pile badge stops counting",
   "  badge.textContent = String(n);",
   "  if (n < 8) badge.textContent = String(n);"],
  ["the deck badge stops counting",
   "  el.countMazzo.textContent = String(left);",
   "  el.countMazzo.textContent = String(left + 1);"],
  // The four counters the owner plays off. Primiera above all: it is the one
  // number on this table nobody can check by looking at the cards.
  ["the primiera counter reads the wrong pile",
   "  const prim = state.prese ? primieraTotale(pile) : null;",
   "  const prim = state.prese ? primieraTotale(state.prese[1 - who]) : null;"],
  ["the counters stop at three points",
   "    [\"primiera\", prim === null || prim === undefined ? \"—\" : String(prim),\n      prim !== null && prim !== undefined],\n",
   ""],
  ["the scopa marks stop counting",
   "  const s = state.scope ? state.scope[who] : 0;",
   "  const s = 0;"],
  ["the middle draws a card the engine does not hold",
   "  const cards = sweeping ? sweeping.cards : (state.tavola || []);",
   "  const cards = (sweeping ? sweeping.cards : (state.tavola || [])).concat([{s:0,n:1}]);"],
  ["the leftovers are left on the table",
   "function renderTavola(take){\n  const cards = sweeping ? sweeping.cards : (state.tavola || []);",
   "function renderTavola(take){\n  const cards = state.over ? [{s:0,n:1}] : (sweeping ? sweeping.cards : (state.tavola || []));"],
  ["a played card keeps its face",
   "    const card = mano(BASSO)[slot];\n    const was = node.dataset.empty;",
   "    const card = mano(BASSO)[slot] || {s:0,n:1};\n    const was = node.dataset.empty;"],
  ["a slot you hold is drawn empty",
   "    const card = mano(BASSO)[slot];\n    const was = node.dataset.empty;",
   "    const card = slot === 2 ? null : mano(BASSO)[slot];\n    const was = node.dataset.empty;"],
  // "the final score is read out backwards" was here, against the say line's
  // `Fine: N a N`. That line is gone — the result panel is the one place the
  // score is said now, and a second copy of it was a second thing that could be
  // wrong about the same deal. What replaces it is three breaks rather than
  // one: the say line keeping the score at all, the verdict over the panel, and
  // the score written down backwards in the history.

  // --- the three beats, the breaks the sixth review found missing -----------
  ["nothing is drawn as the card that has just landed",
   "  sweeping = { cards, dir: {}, played: landed };",
   "  sweeping = { cards, dir, played: landed };"],
  ["the opponent's card is not marked as the one just played",
   "      if (sweeping ? idx === sweeping.played : idx === laid) b.dataset.played = \"true\";",
   "      if (sweeping ? idx === sweeping.played : idx === laid) b.dataset.played = String(state.deveGiocare === 1);"],
  ["a card that takes nothing is drawn leaving",
   "    laid = state.tavola.length - 1;",
   "    laid = state.tavola.length - 1;\n    sweeping = { cards: state.tavola.slice(), dir: {0: BASSO}, played: laid };"],

  // --- the last play of the deal -------------------------------------------
  ["the points are counted out over the last play",
   "  const over = !!(state.over && state.dealt && !settling());",
   "  const over = !!(state.over && state.dealt);"],
  ["the last play sends the played card to whoever played it",
   "  if (cardGoesTo !== null) dir[landed] = cardGoesTo;",
   "  dir[landed] = who;"],
  ["the last card of an empty table is drawn nowhere",
   "  const swept = Object.keys(dir).length > 0 || cardGoesTo !== null;",
   "  const swept = Object.keys(dir).length > 0;"],

  // The sixth review's mutation, which the check passed: the deal-in disabled
  // for rounds 2 to 6, which is every round the beat pass actually measures.
  // `data-dealt` was never taken off a slot, so a mark from the first deal was
  // still there in the second and the assertion could not tell it from a fresh
  // one. Removing the mark with the card is what makes this break red; taking
  // that line out again on its own changes nothing a correct page does, which
  // is why it has no break of its own.
  ["the hand is only dealt in on the first deal",
   "  if (was !== \"true\" || node.dataset.empty !== \"false\") return;",
   "  if (was !== \"true\" || node.dataset.empty !== \"false\" || state.giro > 0) return;"],

  // The owner's own defect, on the first hand of a session. A slot with no
  // data-empty is neither empty nor full, and `dealt` refuses both — so the
  // first hand was dealt in only because something had rendered the table
  // before Gioca, and the only thing that does is document.fonts.ready. The
  // assertion is on buildHands rather than on the outcome, because the outcome
  // measures the boot render.
  ["the first hand of a session is not dealt in",
   "    d.dataset.empty = \"true\";", ""],
  // BEAT does something, and until this pass nothing said so: the hands are
  // already empty for LANDS + SWEEP, so a beat that is entered and released in
  // the same tick was invisible.
  ["the beat is entered and not held",
   "    if (beat) later(endBeat, state.speed * BEAT);",
   "    if (beat) endBeat();"],

  // --- the window between a round's last play and the beat -----------------
  ["the next round is drawn while the last card is still landing",
   "  if (r.nuovoGiro) beat = true;", ""],

  // --- reading the rules ----------------------------------------------------
  ["the rules let the deal play on behind them",
   "  if (name === \"table\") releaseClock(); else holdClock();", ""],

  // --- what each side has taken, and the box the budget pays for ------------
  // The defect this iteration shipped into its own first measurement: with the
  // points box beside it, a plate that takes whatever width its content wants
  // needs 195px, the pair needs 323px of a 288px seat at 320x568, the row wraps,
  // and each seat costs a plate row nobody budgeted for.
  ["the plate takes whatever width it wants in portrait again",
   "  .seat--you .plate, .seat--you .points{ margin-top: var(--seat-gap); }",
   "  .plate{ width: auto; }\n  .seat--you .plate, .seat--you .points{ margin-top: var(--seat-gap); }"],
  ["the points box is squeezed narrower than its content",
   "  width: var(--plate-w);\n  height: var(--plate-h);\n  display: grid;\n  align-content: center;",
   "  width: calc(var(--plate-w) * .45);\n  height: var(--plate-h);\n  display: grid;\n  align-content: center;"],
  ["the points box outlives show-points",
   "  box.hidden = !state.showPoints || !state.dealt;",
   "  box.hidden = !state.dealt;"],

  // --- the start sheet ------------------------------------------------------
  ["the opponents are a list written on the sheet",
   "  el.opponents.replaceChildren(...Object.keys(PROFILES).map(name => {",
   "  el.opponents.replaceChildren(...[\"Franco\", \"Piero\"].map(name => {"],
  ["the chosen opponent is not marked as chosen",
   "  for (const b of el.opponents.children)\n    b.setAttribute(\"aria-pressed\", String(b.dataset.name === name));",
   ""],
  // With `state.opponent` above it, because `reserveDossier` writes the same
  // line when it measures each name in turn and a find has to match once.
  ["the dossier is left empty",
   "  state.opponent = name;\n  el.dossier.textContent = DOSSIER[name] || \"\";",
   "  state.opponent = name;"],
  ["the deck row loses a deck",
   "  el.decks.replaceChildren(...Object.keys(SHEET).map(name => {",
   "  el.decks.replaceChildren(...Object.keys(SHEET).slice(0, 4).map(name => {"],
  ["the deck row does not say which deck",
   "  if (el.deckName) el.deckName.textContent = name;", ""],
  ["the settings sheet is not told which deck was picked",
   "  if (el.deckSel) el.deckSel.value = name;", ""],
  // The bar the start sheet gained needs a grid row of its own. With two rows
  // and three children the bar takes the 1fr row and leaves a band of bare rail
  // under it — the felt starts a third of the way down the screen, and nothing
  // errors, because an empty grid row is not an overflow and is not text.
  ["the start sheet has no row for its icon bar",
   "#viewStart{ grid-template-rows: auto minmax(0,1fr) auto; }",
   "#viewStart{ grid-template-rows: minmax(0,1fr) auto; }"],
  // Four lines held open, so that choosing a name does not move the deck row
  // under a thumb already on its way to it.
  // The reservation is a measured height now rather than a count of lines, so
  // the break is the measurement not being written back. It used to be
  // `min-height: calc(--t-body * 1.5 * 4)` set to 0 — and that number was
  // itself the defect the repaired assertion found on the good page.
  ["the dossier stops holding its height",
   "  el.dossier.style.minHeight = `${Math.ceil(tallest)}px`;", ""],

  // --- the settings sheet ---------------------------------------------------
  ["the weights disclosure loses a weight",
   "  el.weightsTable.tBodies[0].replaceChildren(...WEIGHT_KEYS.map(k => {",
   "  el.weightsTable.tBodies[0].replaceChildren(...WEIGHT_KEYS.slice(1).map(k => {"],
  ["the weights disclosure shows the wrong numbers",
   "    value.textContent = String(P[k]);",
   "    value.textContent = String(P[k] + 1);"],
  ["show-points does not reach the state",
   "  state.showPoints = el.pointsSel.checked; render(); save();",
   "  render(); save();"],
  ["the rhythm slider stores what it reads",
   "  state.speed = 2200 - Number(el.speedSel.value);",
   "  state.speed = Number(el.speedSel.value);"],
  ["the felt is stored and not applied",
   "  root.style.setProperty(\"--felt\", hex);", ""],
  ["the settings are never written down",
   "    localStorage.setItem(KEY, JSON.stringify({",
   "    if (0) localStorage.setItem(KEY, JSON.stringify({"],
  ["the controls are not set from what was restored",
   "  el.pointsSel.checked = state.showPoints;", ""],

  // --- abandoning, and what it must not write down --------------------------
  // Tressette's: Enter is what you press to answer a dialog whose safe button
  // already has focus, and it played the raised card on the way through.
  ["the card keys reach the table through a dialog",
   "  const dialog = !el.confirmScrim.hidden || !el.result.hidden;",
   "  const dialog = false;"],
  ["the reload icon throws the deal away without asking",
   "el.again.addEventListener(\"click\", () => askAbandon(() => newDealHere()));",
   "el.again.addEventListener(\"click\", () => newDealHere());"],
  ["continuing to play throws the deal away anyway",
   "el.confirmNo.addEventListener(\"click\", closeConfirm);",
   "el.confirmNo.addEventListener(\"click\", () => { discard(); closeConfirm(); });"],
  // Tressette's own defect: discarding went to the start sheet and dealt the
  // new hand behind it, a live deal nobody could see or play.
  ["abandoning goes to the start sheet instead of dealing",
   "  const after = pendingAbandon;\n  discard();\n  if (after) after();",
   "  const after = pendingAbandon;\n  abandon();\n  if (after) after();"],
  ["an abandoned smazzata is written down",
   "  state.dealt = false;\n  state.selected = null;\n  state.scelta = 0;",
   "  recordDeal(0, 0);\n  state.dealt = false;\n  state.selected = null;\n  state.scelta = 0;"],
  ["changing opponent does not ask",
   "el.changeOpponent.addEventListener(\"click\", () => askAbandon(() => show(\"start\")));",
   "el.changeOpponent.addEventListener(\"click\", () => show(\"start\"));"],
  ["changing opponent goes back to the table",
   "el.changeOpponent.addEventListener(\"click\", () => askAbandon(() => show(\"start\")));",
   "el.changeOpponent.addEventListener(\"click\", () => askAbandon(() => show(\"table\")));"],

  // --- the result, and the partita around it --------------------------------
  ["the confirm survives the smazzata it was asking about",
   "  closeConfirm();\n  // And the result belongs over the table it came from.", "  //"],
  ["the result is drawn wherever the player happens to be",
   "  show(\"table\");\n  render();\n}\n\nfunction newDealHere(){", "  render();\n}\n\nfunction newDealHere(){"],
  // Recording where the table finishes SHOWING the deal end rather than where
  // it ends. `gioca` sets `over` on the 36th play and three beats of drawing
  // follow it — during which the reload icon does not ask, because there is
  // nothing left to lose — so a write behind that timer is a write the same
  // click cancels, and a smazzata played to the last card is lost.
  ["the smazzata is written down once the table has finished showing it",
   ["  if (state.over && !recorded){\n    recorded = true;\n    const fine = scoreDeal(state);\n    recordDeal(fine.punti[BASSO], fine.punti[ALTO]);\n  }\n",
    "function finish(){\n  // The question"],
   ["",
    "function finish(){\n  if (state.over && !recorded){\n    recorded = true;\n    const fine = scoreDeal(state);\n    recordDeal(fine.punti[BASSO], fine.punti[ALTO]);\n  }\n  // The question"]],
  ["the smazzata is never written down",
   "    recordDeal(fine.punti[BASSO], fine.punti[ALTO]);", ""],
  ["the score is written down backwards",
   "    recordDeal(fine.punti[BASSO], fine.punti[ALTO]);",
   "    recordDeal(fine.punti[ALTO], fine.punti[BASSO]);"],
  ["the history is told the wrong opponent",
   "  list.unshift({ t: Date.now(), o: state.opponent, d: state.deck, y: you, a: them });",
   "  list.unshift({ t: Date.now(), o: \"Valerio\", d: state.deck, y: you, a: them });"],
  ["the confirm opens over a smazzata that is over",
   "  if (!state.dealt || state.over){ after(); return; }",
   "  if (!state.dealt){ after(); return; }"],
  ["the verdict is not read off the totals",
   "  el.resultTitle.textContent =\n    win === BASSO ? \"Hai vinto\" : win === ALTO ? \"Hai perso\" : \"Pareggio\";",
   "  el.resultTitle.textContent = \"Hai vinto\";"],
  ["nothing says what decided the smazzata",
   "  el.resultNote.textContent = notaFinale(r);", ""],
  // The whole of what this line is: not a phrase chosen from a table, but the
  // one component that, taken out of the score, changes who won.
  ["the deciding point is picked rather than computed",
   "  const decise = [...PUNTI_SEMPLICI, \"scope\"].filter(k => senza(k) !== finale);",
   "  const decise = [\"primiera\"];"],
  // The other direction, and the one that walked straight through the guard:
  // stop naming components at all and every note falls back to the margin.
  // "2 punti di scarto." on a 5-3 deal is non-empty, is not a draw, and names
  // nothing — so the property rule was skipped and the whole check stayed
  // green. The break above cannot catch it; it makes the note name something.
  ["the note names no component at all",
   "  const decise = [...PUNTI_SEMPLICI, \"scope\"].filter(k => senza(k) !== finale);\n  if (decise.length === 1) return DECISE[decise[0]];",
   "  const decise = [];"],
  ["a draw is described as a win",
   "  if (finale === 0){", "  if (false){"],
  // Two edits, and not for the usual reason. Taking the button out of the
  // markup alone leaves `el.resultChange.addEventListener` reading a null at
  // module scope, which throws before `boot()` runs: the hands are never built,
  // every pass fails with the same TypeError, and the mutant stops being a
  // statement about the result panel at all. A break has to break ONE thing.
  ["the result offers one way on",
   ["        <button class=\"btn\" id=\"resultChange\" type=\"button\">Cambia avversario o mazzo</button>\n",
    "el.resultChange.addEventListener(\"click\", abandon);\n"],
   ["", ""]],
  ["the result panel is never taken down",
   "  el.result.hidden = !over;", "  if (over) el.result.hidden = false;"],
  // Iteration 3's say line kept the score, and the panel it duplicates is held
  // back while the last play is still being drawn — so this line read the score
  // out over the last card as it landed.
  ["the say line keeps the score after the smazzata",
   "  if (state.selected === null){\n    el.selName.hidden = true;\n    el.selName.textContent = \"\";\n    return;\n  }",
   "  if (state.over && state.dealt){\n    const r = scoreDeal(state);\n    el.selName.hidden = false;\n    el.selName.textContent = `Fine: ${r.punti[BASSO]} a ${r.punti[ALTO]}`;\n    return;\n  }\n  if (state.selected === null){\n    el.selName.hidden = true;\n    el.selName.textContent = \"\";\n    return;\n  }"],

  // --- the history of smazzate ---------------------------------------------
  ["the history grows without a bound",
   "    localStorage.setItem(HKEY, JSON.stringify(list.slice(0, HCAP)));",
   "    localStorage.setItem(HKEY, JSON.stringify(list));"],
  ["a smazzata is added to the end of the history",
   "  list.unshift({ t: Date.now(), o: state.opponent, d: state.deck, y: you, a: them });",
   "  list.push({ t: Date.now(), o: state.opponent, d: state.deck, y: you, a: them });"],
  ["the history sheet draws only some of it",
   "  for (const m of list){\n    const vinta = m.y > m.a, pari = m.y === m.a;",
   "  for (const m of list.slice(1)){\n    const vinta = m.y > m.a, pari = m.y === m.a;"],
  ["the history row reads the score backwards",
   "    score.textContent = `${m.y}–${m.a}`;",
   "    score.textContent = `${m.a}–${m.y}`;"],
  ["the history row always reads as a win",
   "    res.textContent = pari ? \"P\" : vinta ? \"V\" : \"S\";",
   "    res.textContent = \"V\";"],
  ["the tally counts something else",
   "  for (const [n, label] of [[list.length, \"smazzate\"], [vinte, \"vinte\"], [perse, \"perse\"],",
   "  for (const [n, label] of [[vinte, \"smazzate\"], [vinte, \"vinte\"], [perse, \"perse\"],"],
  // One entry of another shape took Tressette's history sheet down along with
  // the button that clears it, so there was no way out from inside the game.
  ["a row this build did not write is rendered anyway",
   "    return Array.isArray(list) ? list.filter(usable) : [];",
   "    return Array.isArray(list) ? list : [];"],
  // The other half of the same filter, and the shape it cannot see: `1e100` is
  // finite, passes the first test, and is outside Date's range — so
  // `WHEN.format(new Date(m.t))` throws mid-render, before the button that
  // clears the bad row. "Inside Date's range" is the second test.
  ["the history formats a timestamp outside Date's range",
   "    && Number.isFinite(m.t) && Number.isFinite(new Date(m.t).getTime())",
   "    && Number.isFinite(m.t)"],

  // --- the 1997 easter egg --------------------------------------------------
  ["the 1997 word does nothing",
   "  if (buffer === CHEAT){ state.cheat = !state.cheat; render(); }", ""],
  ["the face-up hand is drawn face down anyway",
   "    else if (state.cheat) faceOf(node, card);", "    else if (false) faceOf(node, card);"],
  ["the face-up hand says nothing about itself",
   "  el.cheatNote.hidden = !state.cheat;", ""],
  // Tressette had to take this off the table because a hand of ten gave every
  // digit to a card and four of the word's characters are digits. Here only
  // 1-3 are card keys; widen them and the word plays cards as it is typed.
  ["the card keys eat the letters of the word",
   "    if (e.key >= \"1\" && e.key <= \"3\"){ tapped(Number(e.key) - 1); return; }",
   "    if (e.key >= \"1\" && e.key <= \"6\"){ tapped((Number(e.key) - 1) % 3); return; }"],

  // --- what the fresh-context review of PR #8 found had no assertion --------
  // Each of these is behaviour this iteration added with nothing watching it.
  // The review found them by reading; these are what make the finding stick.
  //
  // Note what is NOT here: the `.hero .last-result` specificity fix itself. A
  // rule that loses to `.hero p` draws the line LARGER, in body copy, which no
  // threshold can call a defect — the check is not a design opinion. What is
  // assertable is the size the rule asks for, and that it clears the floor for
  // something somebody reads, which is this break.
  ["the last result is drawn at a label size",
   "  font-size: var(--t-say);\n  color: var(--brass);\n}",
   "  font-size: var(--t-label);\n  color: var(--brass);\n}"],
  ["the last result is shown with nothing behind it",
   "  if (!last){ el.lastResult.hidden = true; return; }",
   "  if (!last){ el.lastResult.hidden = false; return; }"],
  // The other direction, which the row rendering the state did not assert: the
  // line has to be shown, and to say what happened. `audit` skips anything
  // invisible, so a regression that left it hidden rendered an empty start
  // sheet and reported `pass`.
  ["the last result says nothing about the smazzata",
   "  el.lastResult.textContent =\n    `Ultima smazzata: hai ${verbo} ${last.y}–${last.a} contro ${last.o}`;\n  el.lastResult.hidden = false;",
   "  el.lastResult.hidden = true;"],
  ["the last result names the wrong winner",
   "  const verbo = last.y > last.a ? \"vinto\" : last.y < last.a ? \"perso\" : \"pareggiato\";",
   "  const verbo = last.y > last.a ? \"perso\" : last.y < last.a ? \"vinto\" : \"pareggiato\";"],

  // The argument for putting the counters opposite the plate rather than on it
  // is that --seat-extra had already bought the column. Put them anywhere the
  // budget does not pay for and the table moves when a setting is toggled.
  ["show-points moves the table",
   "  .say, .seat__cards{ flex: 0 0 100%; }",
   "  .say, .seat__cards, .points{ flex: 0 0 100%; }"],

  // The end-of-deal panel's two ways on, unpinned — which is how iteration 4
  // shipped it, with `Ancora` 10px below the fold at 980x385.
  //
  // Three edits, because it takes three to get the defect back, and finding
  // that out cost a SURVIVED: removing the explicit `grid-template-rows` alone
  // changes nothing, and neither does adding `overflow: auto` back. The panel
  // has a definite height from `inset: 0`, so two auto rows STRETCH to fill it,
  // the body row gets a bounded height, and `.result__body` scrolls and pins
  // the actions whatever the rows say. The wrapper is the fix; the rows only
  // say so out loud. So the break removes the wrapper, which is what this
  // iteration actually shipped — measured on the rebuilt page: `Cambia` 28px
  // below the fold at 500x425, `Ancora` 10px and `Cambia` 60px at 980x385, the
  // same numbers issue #6 reports.
  ["the way on is not pinned",
   ["  grid-template-rows: minmax(0, 1fr) auto;\n  justify-items: center;",
    "      <!-- The counting scrolls; the two ways on below it do not. -->\n      <div class=\"result__body\">\n        <h2",
    "        <p class=\"result__note\" id=\"resultNote\"></p>\n      </div>\n"],
   ["  align-content: center;\n  overflow: auto;\n  justify-items: center;",
    "      <h2",
    "      <p class=\"result__note\" id=\"resultNote\"></p>\n"]],

  // The keys, whose suppression under a dialog was asserted and whose working
  // was not. Four promises the rules screen makes to the player.
  ["the number keys stop playing cards",
   "    if (e.key >= \"1\" && e.key <= \"3\"){ tapped(Number(e.key) - 1); return; }",
   "    if (false){ tapped(Number(e.key) - 1); return; }"],
  ["space stops cycling the proposal",
   "        if (opts.length > 1){ state.scelta = (state.scelta + 1) % opts.length; render(); }",
   "        if (opts.length > 99){ state.scelta = (state.scelta + 1) % opts.length; render(); }"],
  ["enter stops playing the raised card",
   "        play(BASSO, state.selected, propostaCorrente());", ""],
  ["escape stops putting the card back",
   "      if (e.key === \"Escape\"){ state.selected = null; state.scelta = 0; render(); return; }", ""],
  ["escape stops backing out of a sheet",
   "  if (e.key === \"Escape\" && onScreen !== \"table\" && onScreen !== \"start\"){ back(); return; }", ""],

  // The history sheet's own two, which were rendered and never read back.
  ["clearing the history clears nothing",
   "  try{ localStorage.removeItem(HKEY); } catch (e){}", "  try{ } catch (e){}"],
  ["the record against each opponent counts wrong",
   "    if (m.y > m.a) riga.v++;", "    riga.v++;"],

  // The reservation is a measured height, so it is a width question, so it is
  // a rotation question — and it was measured at one size and never again.
  ["the dossier is reserved once and never again",
   "  redraw = requestAnimationFrame(() => { redraw = 0; render(); reserveDossier(); });",
   "  redraw = requestAnimationFrame(() => { redraw = 0; render(); });"],

  // `recorded` is set in `play` and cleared in `newDealHere`, which is a flag
  // with two owners — CLAUDE.md's rule, paid for by `beat` at iteration 3. The
  // argument that it is safe here is only worth what this break says it is.
  ["a new deal does not clear the record flag",
   "  beat = false;\n  recorded = false;", "  beat = false;"],

  // --- the numbers under the breakdown that had no break -------------------
  ["the denari are counted for the wrong player",
   "  const den = w => piles[w].filter(c => c.s === DENARI).length;",
   "  const den = w => piles[1 - w].filter(c => c.s === DENARI).length;"],
  ["the primiera is read from the wrong pile",
   "  const prim = w => primieraTotale(piles[w]) ?? \"\u2014\";",
   "  const prim = w => primieraTotale(piles[1 - w]) ?? \"\u2014\";"],
  ["carte counts something other than the pile",
   "    [\"carte\",      piles[BASSO].length, piles[ALTO].length, r.carte],",
   "    [\"carte\",      piles[BASSO].length + 1, piles[ALTO].length, r.carte],"],
  ["the scope row stops counting",
   "    [\"scope\",      r.scope[BASSO], r.scope[ALTO], \"scope\"],",
   "    [\"scope\",      0, 0, \"scope\"],"],
];

const filter = process.argv[2];
const chosen = filter ? BREAKS.filter(b => b[0].includes(filter)) : BREAKS;
if (!chosen.length){ console.error(`no break matches ${JSON.stringify(filter)}`); process.exit(2); }

const dir = mkdtempSync(join(tmpdir(), "scopetta-ui-"));
const env = { ...process.env, QUICK: "1" };

const run = file => {
  try {
    execFileSync(process.execPath, [CHECK, file],
      { stdio: "pipe", timeout: 600000, maxBuffer: 64 * 1024 * 1024, env });
    return null;                                  // clean
  } catch (e) {
    return String(e.stdout || "") + String(e.stderr || "");
  }
};

// The page has to pass before any of this means anything.
{
  const base = join(dir, "base");
  cpSync(PUBLIC, base, { recursive: true });
  if (run(join(base, "index.html")) !== null){
    console.error("the check does not pass on the unbroken page — fix that first");
    rmSync(dir, { recursive: true, force: true });
    process.exit(2);
  }
}

let caught = 0; const survived = [], mismatched = [], invalid = [], equivalent = [];

for (const [name, find, replace] of chosen){
  // A break is one edit, except where one edit cannot express the defect: two
  // rules can hold the same thing up, and removing either alone changes
  // nothing. Then `find` and `replace` are equal-length arrays and the edits
  // are applied in order. Each still has to match exactly once.
  const finds = Array.isArray(find) ? find : [find];
  const reps  = Array.isArray(replace) ? replace : [replace];
  const bad = finds.map(f => TEXT.split(f).length - 1).filter(h => h !== 1).length;
  if (bad || finds.length !== reps.length){
    invalid.push([name, `${bad} of ${finds.length} edits did not match exactly once`]);
    console.log(`INVALID  ${name} — ${bad} edit(s) did not match exactly once`);
    continue;
  }
  const work = join(dir, name.replace(/[^a-z0-9]+/gi, "-"));
  cpSync(PUBLIC, work, { recursive: true });
  writeFileSync(join(work, "index.html"),
    finds.reduce((text, f, i) => text.replace(f, reps[i]), TEXT));

  const out = run(join(work, "index.html"));
  const why = EQUIVALENT[name];
  if (why){
    if (out === null){ equivalent.push([name, why]); console.log(`equivalent ${name}`); }
    else { mismatched.push([name, "claimed equivalent, but the check caught it", ""]);
           console.log(`NOT EQUIV ${name} — the equivalence claim is wrong`); }
    continue;
  }
  if (out === null){ survived.push(name); console.log(`SURVIVED ${name}`); continue; }

  const want = EXPECT[name];
  const lines = out.split("\n").filter(l => /^\s{8}/.test(l)).map(l => l.trim());
  if (!want){ mismatched.push([name, "no expected assertion declared", lines[0] || ""]);
              console.log(`UNDECLARED ${name}`); continue; }
  const hit = lines.find(l => l.includes(want));
  if (!hit){
    mismatched.push([name, want, lines.slice(0, 2).join(" | ")]);
    console.log(`MISMATCH ${name}\n         wanted: ${want}\n         saw:    ${lines.slice(0, 2).join(" | ")}`);
    continue;
  }
  caught++;
  console.log(`caught   ${name}  →  ${hit.slice(0, 74)}`);
}

rmSync(dir, { recursive: true, force: true });

const real = chosen.length - invalid.length - equivalent.length;
console.log(`\n${chosen.length} breaks: ${caught} of ${real} caught by the assertion written for them, ` +
            `${mismatched.length} caught by another, ${survived.length} survived, ` +
            `${equivalent.length} equivalent, ${invalid.length} invalid`);
for (const [n, why] of equivalent) console.log(`  equivalent: ${n}\n              ${why}`);
for (const s of survived) console.log(`  SURVIVED — a hole in the check: ${s}`);
for (const [n, want, saw] of mismatched)
  console.log(`  MISMATCH — ${n}\n             wanted: ${want}\n             saw:    ${saw}`);
for (const [n, why] of invalid) console.log(`  invalid: ${n} (${why})`);
process.exit(survived.length || mismatched.length || invalid.length ? 1 : 0);
