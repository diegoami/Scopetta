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
//     marked`, `the say line has no box while a card is raised`;
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
//     with `a capture with a choice plays instead of raising`.

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
  "the plates are left out of the card budget": ".seat__cards runs off",
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
  "the breakdown totals something else": "the breakdown totals",
  "the played card is not drawn as the new one": "drawn as the one just played",
  "a laid card is not drawn as the new one": "just played after a lay",
  "the sweep never ends": "still draws",
  "the capture sweeps toward the wrong player": "sweeping the wrong way",
  "half the capture is drawn leaving": "marked as leaving",
  "the toast announces the wrong thing": "the toast says",
  "the empty middle is allowed to collapse": "empty middle collapsed",
  "the empty hand is allowed to collapse": "card-sized slot",
  "the page stops listening for the new round": "never entered the beat",
  "the beat draws the new hand instead of the empty one": "both hands are empty",

  // --- the page against the engine -----------------------------------------
  "the pile badge stops counting": "badges say",
  "the deck badge stops counting": "the deck badge says",
  "the scopa marks stop counting": "scopa marks",
  "the middle draws a card the engine does not hold": "cards, the engine holds",
  "the leftovers are left on the table": "still shows",
  "a played card keeps its face": "shows a card",
  "a slot you hold is drawn empty": "holds a card and shows none",
  "the final score is read out backwards": "scoreDeal returned",
};

// A break that cannot change what the page does, with how that was measured.
// Marking one equivalent is a claim, so it carries its evidence; and a mutant
// claimed equivalent that IS caught means the claim was wrong, which is red.
const EQUIVALENT = {
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
   "  --say: calc(var(--t-tiny) * 1.5 + 4px);", "  --say: 9px;"],
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
  ["the say line is sized by its content",
   "  width: 100%;\n  height: var(--say);\n  display: flex;",
   "  height: var(--say);\n  display: flex;"],
  ["the say line is cut by a character count alone",
   "    if (rung.length <= LABEL_CHARS\n        && el.selName.getBoundingClientRect().height <= oneLine) break;",
   "    if (rung.length <= LABEL_CHARS) break;"],
  ["the page never draws itself again when the screen changes",
   "window.addEventListener(\"resize\", () => {\n  if (redraw) return;\n  redraw = requestAnimationFrame(() => { redraw = 0; render(); });\n});",
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
  ["the page stops listening for the new round",
   "  if (r.nuovoGiro){", "  if (false && r.nuovoGiro){"],
  ["the beat draws the new hand instead of the empty one",
   "const mano = who => (beat || !state.hands[who]) ? [null, null, null] : state.hands[who];",
   "const mano = who => state.hands[who] || [null, null, null];"],

  ["a new hand appears between one frame and the next",
   "    dealt(node, was);\n  });\n\n  // --- the table",
   "  });\n\n  // --- the table"],
  ["the say line goes back to being the smallest type on the page",
   "  --t-say:   clamp(15px, 4.2vw, 34px);", "  --t-say:   clamp(12.5px, 3.2vw, 28px);"],
  ["the points are not counted out",
   "  el.result.hidden = !over;", "  el.result.hidden = true;"],
  ["the breakdown leaves a row out",
   "    [\"scope\",      r.scope[BASSO], r.scope[ALTO], null],", ""],
  ["the breakdown totals something else",
   "  out.push(cell(r.punti[BASSO], \"r-num r-total\", win === BASSO));",
   "  out.push(cell(r.punti[BASSO] + 1, \"r-num r-total\", win === BASSO));"],

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
  ["the capture is not drawn leaving the table",
   "  if (swept) sweeping = { cards: before, dir };",
   "  if (false) sweeping = { cards: before, dir };"],
  ["the sweep never ends",
   "    later(then, state.speed * 0.45);",
   "    /* nothing takes the table off hold */"],
  ["half the capture is drawn leaving",
   "  for (const i of (r.presa.length ? (presa || []) : [])) dir[i] = who;",
   "  for (const i of (r.presa.length ? (presa || []).slice(0, 1) : [])) dir[i] = who;"],
  ["the toast announces the wrong thing",
   "  if (r.scopa) toast(\"Scopa!\");", "  if (r.scopa) toast(\"Presa!\");"],
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
   "    const card = mano(BASSO)[slot];\n    faceOf(node, card);",
   "    const card = mano(BASSO)[slot] || {s:0,n:1};\n    faceOf(node, card);"],
  ["a slot you hold is drawn empty",
   "    const card = mano(BASSO)[slot];\n    faceOf(node, card);",
   "    const card = slot === 2 ? null : mano(BASSO)[slot];\n    faceOf(node, card);"],
  ["the final score is read out backwards",
   "    el.selName.textContent = `Fine: ${r.punti[BASSO]} a ${r.punti[ALTO]}`;",
   "    el.selName.textContent = `Fine: ${r.punti[ALTO]} a ${r.punti[BASSO]}`;"],
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
