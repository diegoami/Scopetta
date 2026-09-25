#!/usr/bin/env node
/**
 * UI check for Scopetta. Run it after any UI change.
 *
 *   node tools/check_ui.mjs [path-to-index.html]   # defaults to public/index.html
 *
 * Needs playwright-core and a Chromium binary:
 *   npm i playwright-core && npx playwright-core install chromium
 *   CHROME=/path/to/chrome node tools/check_ui.mjs   # or name one yourself
 *
 * Forked from Tressette's at dec1c74. The document pass and the audit are its
 * and Discola's, unchanged where the defect they name is the same; the table
 * and deal passes are rewritten, because Scopa's middle row is a table of up
 * to thirteen cards rather than a trick of two, and its hand is three whole
 * cards rather than a fan of ten.
 *
 * 0. DOCUMENT — the four document facts that cannot be expressed as a layout
 *    assertion: the viewport meta, the doctype, the charset and <html lang>.
 *
 * 0b. FONTS — the three faces are served from fonts/, so the page needs no
 *    network at all: every character in the page and the engine is inside the
 *    shipped latin subset, every @font-face loads with the network cut, and no
 *    subresource comes from the network.
 *
 * 1. SCREENS — every screen and every state worth looking at, at a handful of
 *    real device shapes. Catches what is wrong anywhere: more than one screen
 *    visible at once, text too small to read, clipped labels, tap targets under
 *    the thumb, sideways scroll, script errors.
 *
 * 2. TABLE — the card table only, at every viewport and in all five decks, and
 *    then the tightest of them again with the spacing tokens inflated. The card
 *    size is a budget and when it is wrong nothing throws: the cards quietly
 *    overlap, or your seat slides below the fold, or the rows drift apart.
 *    **It renders the table at 0, 4, 8 and 13 cards**, because the number of
 *    cards in the middle is this game's own way to fail and a freshly dealt
 *    table only ever shows four. It also asks the page which card a tap would
 *    land on, a pixel at a time, because paint order decides that and paint
 *    order moves no box.
 *
 * 2b. CHOICE — a capture waiting to be chosen, on a four-card table and on a
 *    crowded one with a pointer resting on a card; and the toast.
 *
 * 2c. STATES — the sweep and the beat between rounds, PLAYED rather than posed.
 *    Neither is a state the engine will sit in, so a posed one passes whether
 *    or not the page can reach the real one.
 *
 * 2d. ROTATION — turning the phone over, which is the one state a grid of
 *    viewports cannot render: every case in it loads the page at a size and
 *    measures it once.
 *
 * 2e. RULES — the one screen here that is READ, and the one that has to come
 *    back to whichever door opened it.
 *
 * 2f. SHEETS — the partita around the deal, which is iteration 4: the start
 *    sheet, the settings and what they persist, the history of smazzate, the
 *    confirm and every path through it, the result's verdict and the line
 *    saying what decided the smazzata, and the 1997 easter egg.
 *
 * 3. DEAL — one whole deal against Graziano, played by tapping, choosing a
 *    capture by both paths, reading the table after every play.
 *
 * Every threshold below is calibrated against a real defect, not taste. If you
 * relax one, check it still fails the commit that introduced the bug it names.
 */
import { chromium } from 'playwright-core';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

// `fileURLToPath` and `pathToFileURL` rather than `.pathname` and a `file://`
// prefix, which is what was here: on Windows a file URL's pathname is
// `/C:/Users/...`, `path.resolve` turns that into `C:\C:\Users\...`, and the
// check cannot open its own page with no argument. CI is Linux and never saw
// it. Both directions are the same on Linux and correct on both.
const FILE = path.resolve(process.argv[2] ?? fileURLToPath(new URL('../public/index.html', import.meta.url)));
const URL_ = pathToFileURL(FILE).href;

// Three ways to find a Chromium, in order: the one CHROME names, the one this
// development container ships, and the one `playwright-core install chromium`
// put in its own cache — which is the only one CI has.
const PINNED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CHROME = process.env.CHROME || (existsSync(PINNED) ? PINNED : null);

/* ---- viewports ------------------------------------------------------------ */

const VIEWPORTS = [
  // The narrowest screen the game claims to work on, and the one the say line
  // runs off first: a 39-character line is 335px wide, which is wider than the
  // whole of this.
  ['narrow phone',      320,  568],
  ['Android small',     360,  800],
  ['iPhone 15',         393,  852],
  ['Pixel',             412,  915],
  ['iPhone Pro Max',    430,  932],
  ['narrow and tall',   360, 1200],
  ['big phone',         600, 1200],
  ['tall phone A',      700, 1400],
  ['tall phone B',      770, 1475],
  ['tall phone C',      800, 1600],
  ['tablet portrait',   600,  853],
  ['iPad',              768, 1024],
  ['iPad Air',          820, 1180],
  ['iPad Pro',         1024, 1366],
  ['tablet landscape', 1180,  820],
  ['phone landscape',   980,  385],
  ['phone desktop-mode',1045, 2265],
  ['laptop',           1440,  900],
  ['laptop short',     1366,  700],
  ['desktop',          1920, 1080],
  // The Tauri wrapper's window (desktop/src-tauri/tauri.conf.json). The app
  // embeds public/ unchanged, so this row is the desktop build's layout check;
  // tools/smoke_desktop.mjs asserts the window really opens at this size.
  ['desktop window',   1280,  800],
  // Small landscape WINDOWS, which the grid had none of until iteration 3's
  // review: every landscape shape above is at least 980 wide, and the seat row
  // is the widest thing on the table. A browser window dragged down to 800x680
  // is an ordinary thing to do, and it clipped the deck and your own name plate
  // off the right edge with the check green.
  ['small window',      800,  680],
  ['VGA window',        640,  480],
  ['tiny window',       500,  425],
  // Shorter than they are wide by a lot, which is where the plate's type — in
  // rem — grows past the card's height and the seat row stops costing a card.
  ['short window',      980,  340],
  ['shorter window',   1100,  330],
  // Back in the grid since issue #5. The card is on its 32px clamp floor here
  // in four decks of six, and at 1100x330 in two: the budget wants less than
  // the floor allows, the floor wins, and the table scrolls by what it added
  // (6px here in Trevisane). The floor also binds by a fraction of a pixel at
  // 320x568 in two decks, at 500x425 in every deck (by the width term), and in
  // the inflated pass at 980x385 in Bresciane. "No scrolling" at a shape like this
  // tested the clamp rather than the derivation, which is why it was dropped,
  // and why dropping it left short landscape with nothing testing the budget
  // below 980x340. Wherever the designed floor binds, the table pass now lifts
  // it and asks the budget alone whether it fits; the scroll the floor itself
  // adds is the stated fallback.
  ['shortest window',  1100,  320],
];

const SCREEN_VIEWPORTS = ['narrow phone', 'Android small', 'iPhone Pro Max',
                          'tablet portrait', 'phone landscape', 'tiny window', 'laptop'];

// The inflated pass runs these, and it is a list of what is IN rather than a
// list of what is out. The short landscape windows (640x480, 980x340, 1100x330)
// were left out until issue #5 because inflation drives the card onto its clamp
// floor there, which tested the clamp rather than the derivation. Since #5 the
// table pass lifts the designed floor wherever it binds, so they are in: with
// --slack at 0 they see a budget that is short by less than the slack on the
// shortest windows, where a 7-9px defect confined to them otherwise survived.
//
// Still out, and why:
// - 1100x320. Inflated with the floor lifted, its budget wants a card 0.8-1px
//   wide, about 1.7px from going negative. A correctly budgeted change (plate
//   rows at 1.5 x --t-tiny) pushed it past zero, and the pass then blamed a
//   missing --chrome term that was not missing: #5's problem again, one floor
//   lower. 1100x330 catches the same defects with about 12px of card to spare.
// - The narrowest phone (320x568), whose budget sits within half a pixel of
//   the floor, and in two decks just under it (31.6px in Trevisane). It is not
//   the tightest portrait shape.
const TIGHT = ['phone landscape', 'laptop short', 'iPad', 'tablet portrait',
               'Android small', 'small window', 'tiny window',
               'VGA window', 'short window', 'shorter window'];

// Where an interaction is measured. The screen shapes, plus the narrow portrait
// one where the middle row has to overlap hardest — a card's reachable strip is
// a geometry question and it is at its worst where the cards are most crowded.
const CHOICE_VIEWPORTS = [...SCREEN_VIEWPORTS, 'narrow and tall', 'iPad'];

const DECKS = ['Trevisane', 'Romagnole', 'Napoletane', 'Piacentine', 'Francesi', 'Bresciane'];

// tools/break_ui.mjs breaks the page on purpose and needs to run the check
// dozens of times. QUICK trims the grid to the shapes that actually catch
// things — the tightest viewport, the widest, one portrait and one deck — so a
// break takes seconds instead of minutes. Nothing else sets it, and CI does
// not: a quick run is for proving an assertion bites, never for clearing one.
const QUICK = !!process.env.QUICK;

// How many cards the middle row is asked to hold. Not "whatever a deal
// produced": §3.7's bound is thirteen and a random deal reaches twelve, so the
// state that breaks the row has to be rendered on purpose.
const TABLE_SIZES = [0, 4, 8, 13];

// Raising a card is a transition, and a measurement taken on the tick that
// starts it reads the unraised box. Motion off for the measuring passes, so a
// measurement is of where the page settles rather than of where it starts.
const STILL = '*, *::before, *::after{ transition: none !important; animation: none !important; }';

/* ---- putting the page into a state ---------------------------------------- */

// Thirteen cards, the way the rules actually reach thirteen: the four dealt
// cards are four of a kind, and then one card of every other value is laid.
// **Not thirteen low cards.** A synthetic table of assi, due and tre makes
// `prese` enumerate hundreds of capture sets for a single re, which is a state
// no deal can reach — a value already on the table always captures, so no value
// is ever laid twice. A fixture that ignores that measures a page nobody can
// get to, slowly.
const TAVOLA_13 = `[
  {s:0,n:9},{s:1,n:9},{s:2,n:9},{s:3,n:9},
  {s:0,n:10},{s:1,n:8},{s:2,n:7},{s:3,n:6},
  {s:0,n:5},{s:1,n:4},{s:2,n:3},{s:3,n:2},{s:0,n:1}
]`;

// A dealt table, then `n` cards on it. Deterministic: the page's own newDeal
// runs first so every other part of the state is real, and only `tavola` is
// posed.
const setTavola = n => `(() => {
  const all = ${TAVOLA_13};
  state.tavola = all.slice(0, ${n});
  // The longest name in §0's roster, on every case of the pass that measures
  // plates. Only Franco existed until iteration 5; the roster is four now, and
  // Graziano is the longest name in it, so the plate is asserted against the
  // longest rather than against whichever name the page happens to start on.
  state.opponent = "Graziano";
  state.selected = null; state.scelta = 0;
  render();
})()`;

// A capture with a real choice in it: two sevens on the table and a seven in
// hand, so `prese` offers exactly two and the page must let the player pick.
const poseChoice = `(() => {
  state.tavola = [{s:1,n:7},{s:0,n:7},{s:2,n:4},{s:3,n:3}];
  state.hands[0] = [{s:2,n:7}, {s:3,n:10}, {s:1,n:2}];
  state.deveGiocare = 0; state.over = false;
  state.selected = null; state.scelta = 0;
  render();
  tapped(0);
})()`;

// The same choice on a crowded table, which is where marking a card can take
// the tap that belongs to the card beside it. Twelve, not thirteen: a
// thirteen-card table holds four of one value and one of each of the other
// nine, so every value is on it and every hand card has a single capture —
// **a table of thirteen can never offer a choice**. Twelve is the crowded
// table that can: three nines dealt down, the fourth in hand.
const poseChoiceCrowded = `(() => {
  state.tavola = [
    {s:0,n:9},{s:1,n:9},{s:2,n:9},
    {s:0,n:10},{s:1,n:8},{s:2,n:7},{s:3,n:6},
    {s:0,n:5},{s:1,n:4},{s:2,n:3},{s:3,n:2},{s:0,n:1}
  ];
  state.hands[0] = [{s:3,n:9}, {s:3,n:10}, {s:1,n:2}];
  state.deveGiocare = 0; state.over = false;
  state.selected = null; state.scelta = 0;
  render();
  tapped(0);
})()`;

// The say line's middle rung: a card named with its suit, which is 43
// characters with the clause naming the raised card and 28 without it, so the
// clause goes and the name stays. Two quattro on the table and the third in
// hand — a real choice, so `tapped` raises rather than plays, which the first
// version of this fixture did not check and did not get.
const LONG_SAY = 'Prendi il quattro di bastoni';
const poseLongSay = `(() => {
  state.tavola = [{s:3,n:4},{s:1,n:4},{s:0,n:3},{s:2,n:1}];
  state.hands[0] = [{s:2,n:4}, {s:3,n:10}, {s:1,n:9}];
  state.deveGiocare = 0; state.over = false;
  state.selected = null; state.scelta = 0;
  render();
  tapped(0);
})()`;

// The widest line the ladder is allowed to keep: 39 characters, and 335px of
// them — wider than a 360px phone's seat and wider than the whole of a 320px
// one. A count is a proxy for a width and a bad one, so the fixture that keeps
// the ladder honest is the one where the two disagree. A cavallo takes the asso
// and the fante, or the quattro and the cinque, so it raises.
const WIDEST_SAY = "Prendi l'asso e il fante con il cavallo";
const CUT_SAY = "Prendi l'asso e il fante";
const poseWidestSay = `(() => {
  state.tavola = [{s:0,n:1},{s:1,n:8},{s:2,n:4},{s:3,n:5}];
  state.hands[0] = [{s:2,n:9}, {s:3,n:10}, {s:1,n:2}];
  state.deveGiocare = 0; state.over = false;
  state.selected = null; state.scelta = 0;
  render();
  tapped(0);
})()`;

// And the rung below that: a capture that cannot be named in the space the
// budget pays for however it is phrased, so the line says how many and the
// brass marks say which.
//
// **A position the rules reach**, which the first version of this was not: four
// due dealt to the table, a tre laid on them — a tre takes nothing from four
// due, so it may be laid — and a cavallo played. That gives four capture sets
// of four cards each, so the card raises rather than plays, and the full name
// runs past the count whichever set is proposed. The earlier fixture put two
// assi and two tre down together, which no deal can produce: only the four
// dealt cards escape PRESA_OBBLIGATORIA, and every other card on that table
// could have captured, so none of them could have been laid.
const UNNAMEABLE_SAY = 'Prendi le 4 carte segnate';
const poseUnnameable = `(() => {
  state.tavola = [{s:0,n:2},{s:1,n:2},{s:2,n:2},{s:3,n:2},{s:0,n:3}];
  state.hands[0] = [{s:1,n:9}, {s:3,n:10}, {s:2,n:8}];
  state.deveGiocare = 0; state.over = false;
  state.selected = null; state.scelta = 0;
  render();
  tapped(0);
})()`;

// A card that takes nothing, which is the other way a card arrives: gioca puts
// it on the table among as many as twelve others, and nothing says which one is
// new unless the page draws it so.
const playLay = `(() => {
  state.tavola = [{s:0,n:10}];
  state.hands[0] = [{s:1,n:3}, {s:3,n:10}, {s:2,n:8}];
  state.deveGiocare = 0; state.over = false; state.speed = 600;
  state.selected = null; state.scelta = 0;
  render();
  tapped(0);
})()`;

// A sweep made by the opponent, which goes the other way. §3.7 calls the
// direction a deliberate departure and nothing was reading it.
const playSweepOpp = `(() => {
  state.tavola = [{s:2,n:4}];
  state.hands[1] = [{s:0,n:4}, {s:3,n:10}, {s:1,n:2}];
  state.deveGiocare = 1; state.over = false; state.speed = 600;
  state.selected = null; state.scelta = 0;
  render();
  computerPlay();
})()`;

// Play real cards until the round ends, which is the only way to reach the beat
// where both hands are empty: gioca() deals the next round itself and reports
// it, so the state never sits in that beat and the page draws it from the flag.
// Posing it by emptying state.hands would render a page the game cannot reach
// and would pass whether or not the page ever draws the real one.
//
// speed is set high so the beat does not tick past before it is measured, and
// each play() reschedules the one timer, so the loop steps the deal by hand.
const playToBeat = `(() => {
  epoch++; state.mazziere = null;
  newDeal(state, rngSeed(11));
  state.speed = 30;
  render();
  for (let i = 0; i < 40 && !state.over; i++){
    const who = state.deveGiocare;
    if (who === null) break;
    const slot = state.hands[who].findIndex(c => c);
    if (slot < 0) break;
    // The last card of the round is played at a speed that leaves the sweep
    // and the beat long enough to measure. Everything before it runs fast.
    const left = state.hands[0].filter(Boolean).length
               + state.hands[1].filter(Boolean).length;
    if (left === 1) state.speed = 1200;
    const opts = prese(state.tavola, state.hands[who][slot]);
    play(who, slot, opts[0] || []);
    if (left === 1) return true;
  }
  return false;
})()`;

// The 36th play, stopped while it is still landing. Nothing ever rendered it,
// and two defects shipped in it: `gioca` sets `over` on this play, so the
// opaque result panel — drawn from `over` alone — went up before the card had
// landed and the three beats ran behind it; and a last card that takes nothing
// is swept up WITH the leftovers, to whoever captured last, while the page drew
// it going to whoever played it. One play in every deal, and every assertion
// green through both.
//
// `beat` is cleared each time round because the driver cancels its own pending
// timers: a round boundary inside the loop sets it and nothing would ever put
// it back, and every hand would then be drawn empty.
const playToLast = `(() => {
  epoch++; state.mazziere = null;
  newDeal(state, rngSeed(11));
  state.speed = 30;
  render();
  for (let i = 0; i < 40 && !state.over; i++){
    beat = false;
    const who = state.deveGiocare;
    if (who === null) break;
    const slot = state.hands[who].findIndex(c => c);
    if (slot < 0) break;
    const last = state.plays === 35;
    if (last) state.speed = 1200;
    const opts = prese(state.tavola, state.hands[who][slot]);
    play(who, slot, opts[0] || []);
    if (last) return { who, ultimaPresa: state.ultimaPresa, took: opts[0] ? opts[0].length : 0 };
  }
  return null;
})()`;

// The 36th play WHEN IT TAKES NOTHING, which is the case the seeded deal above
// does not happen to reach and the case where the last play is unlike every
// other one: `gioca` pushes the card onto the table and then sweeps the table
// into `resto`, which goes to whoever captured last. So the card the player
// just played goes to the OTHER player, and drawing it toward the one who
// played it says two players took cards from one play.
//
// The position is posed and the play is real — the state before a 36th play is
// one the engine sits in, unlike the beats themselves. `ultimaPresa` is the
// opponent and the hand card takes nothing: a re against a 2 and a 3 can make
// no sum and match no value.
const playLastLeftovers = `(() => {
  state.tavola = [{s:2,n:2},{s:0,n:3}];
  state.hands[0] = [{s:1,n:10}, null, null];
  state.hands[1] = [null, null, null];
  state.deveGiocare = 0; state.over = false; state.speed = 1200;
  state.plays = 35; state.ultimaPresa = 1;
  // The rest of a position 35 plays in: the dealer plays last, so it is the
  // opponent; and 35 cards are in the piles, not none. Nothing asserts either
  // today — but a pose that only holds together where the assertions look is
  // not a position the engine can sit in, which is what CLAUDE.md asks of one.
  state.mazziere = 1;
  // The piles are the rest of the deck, built by EXCLUDING what is on the
  // table and in the hand rather than by slicing 35 off the front — which put
  // two cards in a pile and on the table at once, and made 35 where a position
  // with two down and one held calls for 37. Empty piles read as a
  // placeholder; a wrong 35 reads as a position and invites belief.
  const out = state.tavola.concat(state.hands[0].filter(Boolean))
    .map(c => c.s * 11 + c.n);
  const rest = state.cards.filter(c => !out.includes(c.s * 11 + c.n));
  state.prese = [rest.slice(0, 18), rest.slice(18)];
  state.selected = null; state.scelta = 0;
  render();
  const n = state.tavola.length + 1;
  tapped(0);
  return { cards: n, to: state.ultimaPresa };
})()`;

// And the same play onto an EMPTY table, which a scopa on the 35th leaves. Then
// the played card is the only thing swept up, so a page reading "is anything
// leaving?" off the table's own cards sees nothing, sends the card down the lay
// path, and indexes a table it is no longer on: the last card of the deal is
// drawn nowhere at all.
const playLastOnEmpty = `(() => {
  state.tavola = [];
  state.hands[0] = [{s:1,n:10}, null, null];
  state.hands[1] = [null, null, null];
  state.deveGiocare = 0; state.over = false; state.speed = 1200;
  state.plays = 35; state.ultimaPresa = 1;
  state.mazziere = 1;
  // The piles are the rest of the deck, built by EXCLUDING what is on the
  // table and in the hand rather than by slicing 35 off the front — which put
  // two cards in a pile and on the table at once, and made 35 where a position
  // with two down and one held calls for 37. Empty piles read as a
  // placeholder; a wrong 35 reads as a position and invites belief.
  const out = state.tavola.concat(state.hands[0].filter(Boolean))
    .map(c => c.s * 11 + c.n);
  const rest = state.cards.filter(c => !out.includes(c.s * 11 + c.n));
  state.prese = [rest.slice(0, 18), rest.slice(18)];
  state.selected = null; state.scelta = 0;
  render();
  const n = state.tavola.length + 1;
  tapped(0);
  return { cards: n, to: state.ultimaPresa };
})()`;

// Two endings posed so that the line saying what decided the smazzata has
// something it can be wrong about. A driven deal ends wherever its seed ends,
// and what this line does is pick between five components — so the two cases
// worth rendering are one where exactly one of them decided it and one where
// nobody won at all.
//
// The scope, and only the scope: you take the settebello and nothing else and
// make four scope, they take everything else, which is carte, denari and — you
// hold one suit, so you cannot score it at all — primiera. 5 to 3. Take any
// one point out and the same player still wins; take the scope out and it is
// 1 to 3.
const poseScopeDecide = `(() => {
  const sette = state.cards.find(c => c.s === DENARI && c.n === 7);
  state.prese = [[sette], state.cards.filter(c => c !== sette)];
  state.scope = [4, 0];
  state.tavola = []; state.hands = [[null,null,null],[null,null,null]];
  state.over = true; state.dealt = true; state.plays = 36; state.deveGiocare = null;
  render();
})()`;

// And a drawn smazzata, which Scopa has and Tressette's eleven points cannot:
// twenty cards and five denari each, so carte and denari go to NOBODY, the
// settebello to you and the primiera to them. 1 all. The thing worth saying
// about it is the two points nobody took, which is a fact about this game that
// a margin cannot express.
const poseDraw = `(() => {
  const P = (s, ns) => ns.map(n => ({ s, n }));
  state.prese = [
    [...P(0,[7,1,2,3,4]), ...P(1,[8,9,10,1,2]), ...P(2,[8,9,10,1,2]), ...P(3,[8,9,10,1,2])],
    [...P(0,[5,6,8,9,10]), ...P(1,[3,4,5,6,7]), ...P(2,[3,4,5,6,7]), ...P(3,[3,4,5,6,7])]
  ];
  state.scope = [0, 0];
  state.tavola = []; state.hands = [[null,null,null],[null,null,null]];
  state.over = true; state.dealt = true; state.plays = 36; state.deveGiocare = null;
  render();
})()`;

// What the line that says what decided the smazzata has to be true of, read off
// the page and checked against scoreDeal. Not a table of expected strings and
// not a second copy of notaFinale: it asserts the PROPERTY the line claims —
// that the component it names is one the deal turns on — which is what a
// phrase chosen from a table rather than computed from the deal cannot keep.
// `mustName` is the rail, and it is here because the `if (said)` beneath it was
// a guard with nothing watching whether it was ever entered. A note that names
// no component skips the whole property assertion, and the only other rule on
// this line asks whether anything was said at all — so a `notaFinale` that
// stopped naming components and always fell back to the margin would leave
// "2 punti di scarto." on a 5-3 deal and every pass green. §3.6's "a phrase
// that can be wrong about the deal it describes is worse than no phrase" would
// have quietly become "a phrase that says nothing is fine".
//
// `poseScopeDecide` is built so that exactly one component decides it — its own
// comment says take the scope out and it is 1 to 3 — so that is the pose that
// passes true, and the branch stops being optional there.
const NOTE_OK = (mustName = false) => `(() => {
  const mustName = ${mustName};
  const r = scoreDeal(state);
  const note = document.getElementById('resultNote').textContent;
  const out = [];
  if (!note.trim()) return ['the smazzata ended and nothing says what decided it'];
  const drawn = r.punti[0] === r.punti[1];
  if (drawn !== /pareggio/i.test(note))
    out.push(\`the smazzata was \${drawn ? 'drawn' : 'won'} and the note says "\${note}"\`);
  const NAMED = { 'le carte': 'carte', 'i denari': 'denari', 'il settebello': 'settebello',
                  'la primiera': 'primiera', 'le scope': 'scope' };
  const said = Object.keys(NAMED).find(k => note.toLowerCase().includes(k));
  if (mustName && !said)
    out.push(\`the note says "\${note}" and names no component, on a smazzata \`
      + \`exactly one of them decides — so the rule below was never asked\`);
  if (said){
    const key = NAMED[said];
    const p = [0, 0];
    for (const k of ['carte','denari','settebello','primiera'])
      if (k !== key && r[k] !== null) p[r[k]]++;
    if (key !== 'scope'){ p[0] += r.scope[0]; p[1] += r.scope[1]; }
    const sgn = a => Math.sign(a[0] - a[1]);
    if (sgn(p) === sgn(r.punti))
      out.push(\`the note says "\${note}", and taking \${key} out of the score \`
        + \`leaves the same player winning\`);
  }
  // And the verdict over it agrees with the totals it is sitting on.
  const title = document.getElementById('resultTitle').textContent;
  const want = r.punti[0] > r.punti[1] ? 'Hai vinto'
             : r.punti[0] < r.punti[1] ? 'Hai perso' : 'Pareggio';
  if (title !== want)
    out.push(\`the result says "\${title}" on \${r.punti[0]}–\${r.punti[1]}, want "\${want}"\`);
  return out;
})()`;

// A real sweep: one card on the table and the card that takes it in hand, then
// the page's own tap. The toast, the empty table and the scopa mark are what
// gioca() and render() do with it — none of it is posed.
const playSweep = `(() => {
  state.tavola = [{s:2,n:2},{s:0,n:2}];
  state.hands[0] = [{s:0,n:4}, {s:3,n:10}, {s:1,n:2}];
  state.deveGiocare = 0; state.over = false; state.speed = 600;
  state.selected = null; state.scelta = 0;
  render();
  tapped(0);
})()`;

// A capture is three beats and each is measured: the card lands among the cards
// it is about to take (speed x LANDS), they all leave together (x SWEEP), and
// the table is empty with the scopa announced. At the speed the fixtures set,
// 600, that is 0 → 600 → 900, so each wait below lands in the middle of its
// beat with about 150ms of margin either side. The toast outlives all of it —
// it hides 1600ms after it is raised, and does not scale with speed — so the
// settled state is still announcing the scopa when it is measured.
//
// These follow the page's pace and are re-derived when it changes; they were
// 200/450/1150 against a speed of 1000 and a shorter landing beat.
const LANDS_MS = 250;
// The same derivation one speed up: playToLast has a whole deal to drive before
// the measurement starts, so it plays the 36th card at 1200 and the beats fall
// at 0 → 1200 → 1800. These are cumulative waits from the play.
const LAST_LANDS_MS = 600, LAST_FLYING_MS = 900, LAST_SETTLED_MS = 900;
const SWEEPING_MS = 450;
const SWEEP_MS = 1050;

/* ---- opening a page -------------------------------------------------------- */

// Every page in this check is opened here.
//
// The fonts used to be a <link> to Google, and this function blocked that
// request so the check would be deterministic whether or not the machine had a
// network: iteration 3 shipped an assertion calibrated against the fallback
// metrics, which passed here and failed in CI, where the real font loaded and
// the string was narrower. A check whose answer depends on the network is not a
// check.
//
// The fonts are served from fonts/ now, so there is nothing to block: every
// request the page makes is a file:// one and the metrics are the ones that
// ship. The page still has to be correct while the fonts are on their way,
// which is the worst case and the state every player sees first.
async function openPage(browser, viewport) {
  const page = await browser.newPage({ viewport });
  return page;
}

/* ---- what counts as a defect ---------------------------------------------- */

const audit = () => {
  const out = [];
  const name = el => el.id ? '#' + el.id
    : (typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\s+/)[0]
        : el.tagName.toLowerCase());

  const shown = el => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0';
  };

  // Exactly one screen. An author `display` rule beats the UA stylesheet's
  // [hidden]{display:none}, which once left every screen stacked on top of one
  // another with an invisible scrim swallowing every click.
  //
  // By what the browser DRAWS, not by the attribute. Reading `v.hidden` asks
  // the page what it meant rather than what it did — which is the whole of the
  // defect, since the attribute was always set correctly and the rule that acts
  // on it was the thing that lost. The break that takes the `!important` off
  // `[hidden]` survived this assertion for exactly that reason.
  const open = [...document.querySelectorAll('.view')]
    .filter(v => getComputedStyle(v).display !== 'none');
  if (open.length !== 1) out.push(`${open.length} screens visible at once`);

  if (document.documentElement.scrollWidth > window.innerWidth + 1)
    out.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${window.innerWidth})`);

  // Sideways scroll is not enough on its own. The table sets `overflow: hidden
  // auto`, so anything too wide is clipped rather than scrollable and the
  // document width never betrays it — Discola cut the opponent's third card off
  // a phone screen through nineteen viewports while that assertion passed. Ask
  // the elements directly. The table row is in this list because it is the one
  // this game added.
  // The result panel is in it too: it has `overflow: auto`, so a grid wider
  // than the screen would scroll INSIDE the panel and never touch the
  // document's own width — the same way a clipped table cannot scroll sideways.
  // `.points` is in this list for the same reason `.plate` is, and it is the
  // box iteration 4 added: it stands in the column opposite the plate, which
  // --seat-extra has been paying for since iteration 3, and a box that outgrows
  // that column runs off the edge of a table that clips rather than scrolls.
  const past = [...document.querySelectorAll('.hand, .tavola, .tavola-row, .seat__cards, '
    + '.plate, .points, .toast, .say, .sel-name, .result, .result__grid, .r-num, '
    + '.result__actions, .dialog, .chips, .decks, .log, .tally, .weights')]
    .filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
    });
  // Every one of them. Capped at three, the element a break was written for
  // could fall off the end while the rule it belongs to had fired — which is
  // what forced one EXPECT to be loosened from an element to a phrase. The
  // list is bounded by the selector above in any case.
  for (const el of past) {
    const r = el.getBoundingClientRect();
    out.push(`${name(el)} runs off the screen (${Math.round(r.left)}…${Math.round(r.right)} `
      + `vs 0…${window.innerWidth})`);
  }

  // The deck picker is one row, whatever the deck table holds. A sixth deck
  // against a hard-coded repeat(5, 1fr) wraps onto a second row and pushes the
  // controls under it down — no overflow, no clipped text, no small tap target,
  // so every other rule here passes a picker that has quietly folded in half.
  // Sharing a top is the whole of "one row", and it is what says the column
  // count JS sets and the deck table it comes from are still in step. Not the
  // CSS fallback beside it: buildDecks sets --deck-cols before the element has
  // any children, so a fallback that disagreed would never be painted, never
  // mind measured.
  const opts = [...document.querySelectorAll('.deck-opt')];
  if (opts.length) {
    const tops = new Set(opts.map(b => Math.round(b.getBoundingClientRect().top)));
    if (tops.size !== 1)
      out.push(`the deck picker is on ${tops.size} rows, not one `
        + `(${opts.length} decks at tops ${[...tops].join(', ')})`);
  }
  // And each swatch inside its own tile. The tiles of a row stretch to the
  // tallest deck, the Bresciane, and a card stretched with them takes its width
  // from that height through its aspect-ratio — so the four shortest decks came
  // out wider than their tiles and lay across the next one, 115px in a 98px
  // tile for the Romagnole. The row still fit and nothing overflowed the page:
  // only the card against the tile that holds it says so.
  for (const opt of opts) {
    const card = opt.querySelector('.card');
    if (!card || !shown(card)) continue;
    const t = opt.getBoundingClientRect(), c = card.getBoundingClientRect();
    if (c.left < t.left - 1 || c.right > t.right + 1 || c.top < t.top - 1 || c.bottom > t.bottom + 1)
      out.push(`the ${opt.dataset.deck} swatch spills out of its tile (card `
        + `${Math.round(c.width)}x${Math.round(c.height)} in a ${Math.round(t.width)}x${Math.round(t.height)} tile)`);
  }

  // Nothing on the table may sit on a hand card. Against the HAND'S OWN BOX
  // this passes while the raised card stands on two to four of the cards it is
  // proposing to take: a transform does not move the box it is applied to out
  // of its parent, so the hand measures where it always was and the card is
  // somewhere else entirely. Card against card, or it sees nothing.
  const hit = (a, b) => a.left < b.right - 1 && a.right > b.left + 1
                     && a.top < b.bottom - 1 && a.bottom > b.top + 1;
  const handCards = [...document.querySelectorAll('.hand .card')].map(c => c.getBoundingClientRect());
  const onHand = [...document.querySelectorAll('.tavola .card')]
    .filter(c => handCards.some(h => hit(c.getBoundingClientRect(), h)));
  if (onHand.length)
    out.push(`${onHand.length} table card(s) overlap a hand card`);

  // A name plate that outgrows the width the budget pays for lands on the cards
  // beside it. Two ways that happens and they need different eyes: the plate's
  // box can be squeezed narrower than its content, which only scrollWidth
  // shows, or the box itself can be wider than its column.
  // The points box is measured with the plates, not beside them: it is the same
  // size, in the same row, bounded by the same token, and it is the box that
  // put the plate under this rule in portrait at all — a `width: auto` plate
  // could never fail a scrollWidth test, and when the points box arrived beside
  // it the row needed 323px of a 288px seat.
  for (const plate of document.querySelectorAll('.plate, .points')) {
    if (plate.scrollWidth > plate.clientWidth + 1)
      out.push(`${name(plate)} spills ${plate.scrollWidth - plate.clientWidth}px past its own width`);
    // And past its own height, which is the same question turned ninety
    // degrees and the one the first version of this rule did not ask: the
    // plate has a derived height, the mazziere tag is a row of its own, and a
    // box of 35px measuring 51px of content drew the tag behind the cards at
    // every portrait viewport with both assertions green.
    if (plate.scrollHeight > plate.clientHeight + 1)
      out.push(`${name(plate)} spills ${plate.scrollHeight - plate.clientHeight}px past its own height`);
  }
  // The plate's CHILDREN against the cards, not the plate's box: overflowing
  // content leaves the box and the box stays where it was.
  for (const kid of document.querySelectorAll('.plate, .plate *, .points, .points *')) {
    const a = kid.getBoundingClientRect();
    if (!a.width || !a.height) continue;
    for (const row of document.querySelectorAll('.seat__cards'))
      if (hit(a, row.getBoundingClientRect())) { out.push(`${name(kid)} lands on the cards`); break; }
  }

  for (const el of document.querySelectorAll('body *')) {
    if (!shown(el)) continue;
    if (el.closest('details:not([open])') && !el.closest('summary')) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();

    const text = [...el.childNodes]
      .filter(n => n.nodeType === 3)
      .map(n => n.textContent.trim()).join(' ').trim();

    if (text) {
      const size = parseFloat(cs.fontSize);
      // Two tiers: a short uppercase label can run smaller than a sentence
      // somebody has to read. Body copy sat at 12.5px until it was measured.
      //
      // The say line is held to the second tier whatever its length, and that
      // is the third thing the owner found by playing: it is short because the
      // budget pays for one line, but it is the only text on the table that
      // says what the next tap will DO, and it is read rather than glanced at.
      // Length is a proxy for that and here it points the wrong way.
      const reads = el.classList.contains('sel-name');
      const floor = (reads || text.length > 40) ? 14.5 : 12.5;
      if (size < floor - 0.05)
        out.push(`${name(el)} text ${size.toFixed(1)}px, want ${floor} — "${text.slice(0, 32)}"`);

      if (cs.overflowX === 'hidden' && cs.overflowY !== 'auto' && cs.overflowY !== 'scroll'
          && el.scrollWidth > el.clientWidth + 1)
        out.push(`${name(el)} clips its text (${el.scrollWidth} > ${el.clientWidth})`);

      // Cut off from above or below by an ancestor that cannot scroll. The rule
      // above cannot see it, because the element that clips is not the element
      // that holds the text: in Tressette a declaration inside a strip sized for
      // one line lost half a line off the top and half off the bottom at every
      // phone width, and every assertion passed.
      for (let up = el; up && up !== document.body; up = up.parentElement) {
        const ucs = getComputedStyle(up);
        if (ucs.overflowY !== 'hidden' || ucs.overflowX === 'auto' || ucs.overflowX === 'scroll') continue;
        const ur = up.getBoundingClientRect();
        const cut = up === el
          ? Math.max(0, el.scrollHeight - el.clientHeight)
          : Math.max(0, ur.top - r.top) + Math.max(0, r.bottom - ur.bottom);
        if (cut > 1)
          out.push(`${name(el)} is cut off by ${Math.round(cut)}px inside ${name(up)}, `
            + `which cannot scroll — "${text.slice(0, 32)}"`);
        break;
      }
    }

    // A way ON has to be on screen. The audit's below-the-fold rule measures
    // YOUR SEAT, and a dialog is `position: absolute; inset: 0` over the table
    // rather than part of it — so when the end-of-deal panel grew a computed
    // note and a second button, `Ancora` sat 10px below the fold at 980x385 and
    // 38px at 1100x330, reachable only by scrolling a panel that gives no sign
    // it scrolls, and nothing in eleven passes said a word.
    //
    // Scoped to dialogs because that is where a control is the ONLY way on: the
    // sheets scroll as sheets, visibly, with the rest of the page around them.
    if (el.tagName === 'BUTTON' && el.closest('[role="dialog"]')) {
      const below = Math.round(r.bottom - window.innerHeight);
      if (below > 1)
        out.push(`${name(el)} is ${below}px below the fold inside a dialog — `
          + `it is the way on and it is off the screen`);
      // A sideways version of this was here and is deleted. A `.btn` in
      // `.result__actions` is a grid item in a single-column track whose
      // min-content is its longest word — `avversario`, about 70px — against a
      // track never narrower than about 237px, so the button cannot leave the
      // viewport sideways unless its actions box or the dialog does, and both
      // are already in the off-screen list above. A strict subset of an
      // existing assertion's firing set is the definition of cover, and this
      // file has deleted two others for it.
    }

    // Thumb-sized targets. Cards are excluded because a card's size is the
    // table's budget and is asserted by the second pass.
    const inlineLink = el.tagName === 'A' && cs.display.startsWith('inline');
    if ((el.tagName === 'BUTTON' || el.tagName === 'A') && !el.classList.contains('card') && !inlineLink) {
      const small = Math.min(r.width, r.height);
      if (small < 32)
        out.push(`${name(el)} tap target ${Math.round(r.width)}x${Math.round(r.height)}, want 32`);
    }
  }
  return out;
};

// The fonts are served from fonts/ now, so every request the page makes is a
// file:// one and a network error means the page reached for the internet,
// which is a defect rather than noise. Nothing is filtered.
const noisy = () => false;

/* ---- getting to each screen ----------------------------------------------- */

// A row that cannot reach its screen is a check that silently passes, so rows
// arrive with their screens. The mid-deal states are here because §4 iteration
// 3 is explicit: an assertion only sees the states the check renders, and every
// one of these exists only in the middle of a deal.
const SCREENS = [
  { name: 'start', open: async p => {} },
  // The start sheet with a smazzata behind it, which is what a returning player
  // sees and what no pass ever rendered: `#lastResult` is `hidden` until
  // `loadHistory` returns something, the start row opens on empty storage, and
  // the row that seeds storage walks to the history sheet instead. So the line
  // was new behaviour with no assertion — and it was drawing at 17px ivory-dim
  // rather than the brass label its own rule asks for, because `.hero p` beats
  // `.last-result` on specificity.
  { name: 'start, with a smazzata behind it', open: async p => {
      await p.evaluate(`localStorage.setItem("scopetta.history", JSON.stringify([
        { t: Date.parse("2026-02-11"), o: "Graziano", d: "Romagnole", y: 5, a: 3 }
      ]))`);
      await p.reload();
    } },
  // Both ways in, because a screen reachable from one place and not the other
  // is half a screen. The rules are the only page here that is READ, so the
  // audit's body-copy floor is the one that matters on them.
  { name: 'the rules, from the start sheet', open: async p => {
      await p.click('#aboutStart');
    } },
  { name: 'the rules, from the table', open: async p => {
      await p.click('#play');
      await p.click('#about');
    } },
  // The three sheets iteration 4 brings. Each is entered the way a player
  // enters it, from the table, because `show` holds the table's clock on the
  // way out and a sheet posed by setting `hidden` would never exercise that.
  { name: 'settings', open: async p => {
      await p.click('#play');
      await p.click('#btnSettings');
    } },
  // Open, because the weights table and the paragraph above it are the
  // disclosure §3.6 asks for and a closed <details> renders nothing the audit
  // can measure — the text floors, the off-screen rule and the clipped-text
  // rule all skip it by construction.
  { name: 'settings, the weights disclosed', open: async p => {
      await p.click('#play');
      await p.click('#btnSettings');
      await p.evaluate(`document.querySelector('#viewSettings details').open = true`);
    } },
  { name: 'history, empty', open: async p => {
      await p.click('#play');
      await p.click('#btnHistory');
    } },
  // And with something in it. Two entries rather than one, because the tally,
  // the per-opponent block and the log are three different shapes and a single
  // row exercises the narrowest of them: the widest row is a loss, and the
  // per-opponent block only appears when there is more than one name.
  { name: 'history, with smazzate in it', open: async p => {
      await p.evaluate(`localStorage.setItem("scopetta.history", JSON.stringify([
        { t: Date.parse("2026-02-11"), o: "Graziano", d: "Romagnole", y: 2, a: 5 },
        { t: Date.parse("2026-02-10"), o: "Franco", d: "Trevisane", y: 4, a: 4 },
        { t: Date.parse("2026-02-09"), o: "Franco", d: "Trevisane", y: 6, a: 1 }
      ]))`);
      await p.reload();
      await p.click('#play');
      await p.click('#btnHistory');
    } },
  // A row written by something else is dropped, but one with a timestamp
  // OUTSIDE Date's range — 1e100 is finite — passed the old `usable` and threw
  // in `renderHistory`, before the button that clears the bad data: the exact
  // unrecoverable failure the filter exists to prevent. The page error is
  // caught by this pass, which would make any throw visible; the check below
  // names the drop and the draw, so the assertion is about this defect rather
  // than about "something threw".
  { name: 'history, a timestamp that is not a date', open: async p => {
      await p.evaluate(`localStorage.setItem("scopetta.history", JSON.stringify([
        { t: 1e100, o: "Franco", d: "Trevisane", y: 5, a: 3 },
        { t: Date.parse("2026-02-11"), o: "Graziano", d: "Romagnole", y: 2, a: 5 }
      ]))`);
      await p.reload();
      await p.click('#play');
      await p.click('#btnHistory');
    },
    check: () => {
      const rows = [...document.querySelectorAll('#historyBody .log li')];
      const out = [];
      if (rows.length !== 1) out.push(`the history drew ${rows.length} rows, want the one with a real date`);
      else if (!rows[0].textContent.includes('Graziano'))
        out.push(`the history drew "${rows[0].textContent.trim()}", want the row with a real date`);
      if (!document.querySelector('#historyBody button'))
        out.push('the history lost the button that clears it');
      return out;
    } },
  // The one question this game asks, over the table it is asking about.
  { name: 'the confirm, over a deal in progress', open: async p => {
      await p.click('#play');
      await p.click('#again');
    } },
  { name: 'table, just dealt', open: async p => { await p.click('#play'); } },
  // Show-points off, which is the other half of a setting: the boxes go and
  // nothing else moves, because they stand in a column the budget was already
  // paying for.
  { name: 'table, show-points off', open: async p => {
      await p.click('#play');
      await p.click('#btnSettings');
      await p.click('#pointsSel');
      await p.click('[data-back]');
    } },
  // The 1997 easter egg, at the table where Discola had it. Nothing but a
  // played deal renders a face-up opponent hand, and Tressette's note under the
  // table sat below the type floor for as long as no pass looked at it.
  { name: 'table, the opponent\'s hand face up', open: async p => {
      await p.click('#play');
      await p.evaluate(`(() => { state.cheat = true; render(); })()`);
    } },
  { name: 'table, empty middle', open: async p => {
      await p.click('#play');
      await p.evaluate(setTavola(0));
    } },
  { name: 'table, thirteen cards', open: async p => {
      await p.click('#play');
      await p.evaluate(setTavola(13));
    } },
  { name: 'table, a capture to choose', open: async p => {
      await p.click('#play');
      await p.evaluate(poseChoice);
    } },
  { name: 'table, a capture named with its suit', open: async p => {
      await p.click('#play');
      await p.evaluate(poseLongSay);
    } },
  { name: 'table, the widest line the say line keeps', open: async p => {
      await p.click('#play');
      await p.evaluate(poseWidestSay);
    } },
  { name: 'table, a capture too long to name', open: async p => {
      await p.click('#play');
      await p.evaluate(poseUnnameable);
    } },
  // A sweep, played rather than posed: the toast is announcing something that
  // happened, over the empty table it left behind. Posing the toast alone
  // renders half the state, and the empty middle it sits over is the half that
  // moves the cards.
  { name: 'table, a scopa announced', open: async p => {
      await p.click('#play');
      await p.evaluate(playSweep);
      await p.waitForTimeout(SWEEP_MS);
    } },
  // Likewise the beat between rounds, which is reached by finishing a round.
  { name: 'table, hands empty between rounds', open: async p => {
      await p.click('#play');
      await p.evaluate(playToBeat);
      // Not fatal if it never arrives: a page that stops listening for the new
      // round is a defect for checkStates to report, not a crash that takes the
      // rest of the check's output with it.
      await p.waitForFunction('beat === true', null, { timeout: 8000 }).catch(() => {});
    } },
  { name: 'table, a pile with three scope', open: async p => {
      await p.click('#play');
      await p.evaluate(`(() => {
        state.scope = [3, 2];
        state.prese[0] = state.cards.slice(0, 17);
        state.prese[1] = state.cards.slice(17, 30);
        render();
      })()`);
    } },
  { name: 'table, the deal over, with the points counted out', open: async p => {
      await p.click('#play');
      await p.evaluate(`(() => {
        state.prese[0] = state.cards.slice(0, 21);
        state.prese[1] = state.cards.slice(21, 40);
        state.tavola = []; state.hands[0] = [null,null,null]; state.hands[1] = [null,null,null];
        state.over = true; state.plays = 36; state.deveGiocare = null;
        render();
      })()`);
    } },
  // The two endings whose NOTE is the thing being looked at: one the scope
  // decided, and a draw, whose line is the longest this panel ever draws — and
  // the one that has to fit a 320px screen under a grid of six rows.
  { name: 'table, a deal the scope decided', open: async p => {
      await p.click('#play');
      await p.evaluate(poseScopeDecide);
    } },
  { name: 'table, a drawn deal', open: async p => {
      await p.click('#play');
      await p.evaluate(poseDraw);
    } },
];

/* ---- pass 0: the document itself ------------------------------------------- */

async function checkDocument(browser) {
  console.log('\ndocument');
  const page = await openPage(browser, { width: 393, height: 852 });
  await page.goto(URL_);
  const bad = await page.evaluate(() => {
    const out = [];
    const vp = document.querySelector('meta[name="viewport"]');
    if (!vp) out.push('no viewport meta — a phone will lay the page out at ~980px and scale it down');
    else if (!/width\s*=\s*device-width/.test(vp.content))
      out.push(`viewport meta does not set width=device-width: "${vp.content}"`);
    if (document.compatMode !== 'CSS1Compat')
      out.push('quirks mode — no doctype, so box sizing and table layout differ from every browser default');
    if (document.characterSet !== 'UTF-8')
      out.push(`charset is ${document.characterSet}, not UTF-8 — accented Italian will render as mojibake over file://`);
    if (!document.documentElement.lang)
      out.push('no lang on <html> — screen readers and hyphenation have no language to work from');
    return out;
  });
  await page.close();
  console.log(`  ${bad.length ? 'FAIL' : 'pass'}  head tags`);
  bad.forEach(b => console.log(`        ${b}`));
  return bad.length ? 1 : 0;
}

/* ---- pass 0b: the fonts ---------------------------------------------------- */

// The three faces used to be a <link> to fonts.googleapis.com. Nothing failed
// when they did not load: the browser fell back to a generic serif and the
// wordmark set some 12% narrower than every threshold below is calibrated
// against. This check never saw it, because this check has always had the
// network up — and an offline build is where that fallback would have shipped.
// These three assertions are why it cannot come back, and the first of them is
// why the copy cannot outgrow the subset without saying so.

// The latin subset the woff2 files were cut to. A character outside it has no
// glyph in what we ship and falls back on its own, mid-word.
const LATIN = (cp) =>
  cp <= 0xFF || cp === 0x131 || (cp >= 0x152 && cp <= 0x153) || (cp >= 0x2BB && cp <= 0x2BC) ||
  cp === 0x2C6 || cp === 0x2DA || cp === 0x2DC || cp === 0x304 || cp === 0x308 || cp === 0x329 ||
  (cp >= 0x2000 && cp <= 0x206F) || cp === 0x20AC || cp === 0x2122 || cp === 0x2191 ||
  cp === 0x2193 || cp === 0x2212 || cp === 0x2215 || cp === 0xFEFF || cp === 0xFFFD;

// Only the ones the page uses; an unknown entity is left alone and will read as
// ASCII, which is harmless here because ASCII is inside the subset anyway.
const ENTITIES = {
  rsquo: 0x2019, lsquo: 0x2018, ldquo: 0x201C, rdquo: 0x201D, laquo: 0xAB, raquo: 0xBB,
  middot: 0xB7, nbsp: 0xA0, mdash: 0x2014, ndash: 0x2013, hellip: 0x2026,
};

async function checkFonts(browser) {
  console.log('\nfonts');
  let failed = 0;

  // Both files that ship, and every kind of entity. engine.js holds the
  // opponents' names and the em dashes of its own comments, so "every
  // character in the page" that reads only index.html is a claim about half
  // the source; and a numeric reference is a character the page sets just as
  // much as a named one is.
  const source = [FILE, path.join(path.dirname(FILE), 'engine.js')]
    .filter(f => existsSync(f))
    .map(f => readFileSync(f, 'utf8'))
    .join('\n')
    .replace(/&#x([0-9a-f]+);/gi, (m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (m, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (m, name) => (ENTITIES[name] ? String.fromCodePoint(ENTITIES[name]) : m));
  const outside = new Map();
  for (const ch of source) {
    const cp = ch.codePointAt(0);
    if (cp > 0x7F && !LATIN(cp)) outside.set(ch, 'U+' + cp.toString(16).toUpperCase().padStart(4, '0'));
  }
  console.log(`  ${outside.size ? 'FAIL' : 'pass'}  every character is in the latin subset`);
  if (outside.size) {
    failed++;
    for (const [ch, cp] of outside)
      console.log(`        ${cp} ${ch} — no glyph in fonts/; widen the subset or do not use it`);
  }

  // Everything but the page itself is cut off, which is what an offline build
  // sees.
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  const external = [];
  await page.route('**', (route) => {
    const url = route.request().url();
    if (url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    external.push(url);
    return route.abort();
  });
  await page.goto(URL_);
  // Ask for each face explicitly. A browser only fetches a face when something
  // on the current screen uses it, so reading .status after load tells you
  // which weights the start screen happens to draw with — not whether the
  // files are there. load() is the question we actually mean.
  const faces = await page.evaluate(async () => {
    const declared = [...document.fonts];
    return Promise.all(declared.map(async (f) => {
      try { await f.load(); } catch { /* status below carries the verdict */ }
      return { family: f.family, weight: f.weight, status: f.status };
    }));
  });
  await page.close();

  const unloaded = faces.filter((f) => f.status !== 'loaded');
  const ok = faces.length > 0 && unloaded.length === 0;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  all ${faces.length} @font-face rules load with the network down`);
  if (!ok) {
    failed++;
    if (!faces.length) console.log('        no @font-face rules at all — the page is on system fonts');
    unloaded.forEach((f) => console.log(`        ${f.family} ${f.weight}: ${f.status}`));
  }

  console.log(`  ${external.length ? 'FAIL' : 'pass'}  no subresource comes from the network`);
  if (external.length) {
    failed++;
    [...new Set(external)].forEach((u) => console.log(`        ${u}`));
  }
  return failed;
}

/* ---- pass 1: every screen -------------------------------------------------- */

async function checkScreens(browser) {
  console.log('\nscreens');
  let failed = 0;
  // Two shapes in the quick grid, and the second is deliberately not a phone:
  // the phone-shaped media query re-declares every type token, so a break that
  // drops the base --t-tiny below the floor cannot show up on a phone at all.
  for (const vname of (QUICK ? ['narrow phone', 'tiny window'] : SCREEN_VIEWPORTS)) {
    const [, w, h] = VIEWPORTS.find(v => v[0] === vname);
    for (const screen of SCREENS) {
      const page = await openPage(browser, { width: w, height: h });
      const errs = [];
      page.on('pageerror', e => errs.push(String(e)));
      page.on('console', m => { if (m.type() === 'error' && !noisy(m)) errs.push(m.text()); });
      await page.goto(URL_);
      await page.addStyleTag({ content: STILL });
      await screen.open(page);
      await page.waitForTimeout(60);
      const bad = [...await page.evaluate(audit),
        ...(screen.check ? await page.evaluate(screen.check) : [])];
      const all = [...bad, ...errs];
      if (all.length) {
        failed++;
        console.log(`  FAIL  ${screen.name} @ ${vname}`);
        all.forEach(b => console.log(`        ${b}`));
      }
      await page.close();
    }
  }
  console.log(`  ${failed ? failed + ' case(s) failed' : 'pass'}  `
    + `${SCREENS.length} screens x ${QUICK ? 2 : SCREEN_VIEWPORTS.length} viewports`);
  return failed;
}

/* ---- pass 2: the card table ----------------------------------------------- */

// Runs in the page, with the table already holding `n` cards.
const measure = () => {
  const r = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
  const table = r('.table');
  const oppSeat = r('.seat--opp'), youSeat = r('.seat--you');
  const middle = r('.middle'), tavola = r('.tavola');
  // NOT `.hand--you .card`: the first slot is the one a raised card lives in,
  // and a raised card is scale(1.04) — 4% of a card wide enough to make every
  // reachable-strip measurement below miss by three pixels.
  const card = r('.hand--you .card:not([aria-pressed="true"])');
  const say = r('.say');

  // A strip of zero height is the defect this line exists for: while the say
  // line was `hidden` until it had something to say, raising a card pushed every
  // card below it down 31px — off the bottom of the screen in landscape.
  const sayShown = say && say.height > 0;

  // The three row boxes, sorted so the numbers mean the same thing in portrait
  // and in landscape.
  const boxes = [oppSeat, middle, youSeat].filter(Boolean).sort((a, b) => a.top - b.top);
  const gaps = [];
  for (let i = 1; i < boxes.length; i++) gaps.push(boxes[i].top - boxes[i - 1].bottom);

  // --- the table row, §3.7 --------------------------------------------------
  // The fan lives here now. Three ways it goes wrong, all silent: the steps
  // collapse and a card cannot be singled out; the last card runs under the
  // table's edge; the steps are uneven, which means the derivation drifted.
  // What a thumb can actually reach, asked of the page rather than computed
  // from the step. Paint order decides which element a tap lands on, and a rule
  // that lifts one card above its neighbours takes `cw - step` off the strip of
  // the card after it without changing a single box: the geometry is untouched
  // and the card is simply not there any more. So walk the row a pixel at a
  // time and ask who is on top.
  const reachOf = row => {
    const cs = [...row.children];
    const got = cs.map(() => 0);
    if (!cs.length) return got;
    const first = cs[0].getBoundingClientRect();
    const y = Math.round(first.top + first.height / 2);
    // Off the screen entirely: there is nothing to hit-test, and the assertion
    // that the row is below the fold is the one with something to say.
    if (y < 0 || y >= window.innerHeight) return null;
    const rr = row.getBoundingClientRect();
    const x0 = Math.max(0, Math.ceil(rr.left));
    const x1 = Math.min(window.innerWidth - 1, Math.floor(rr.right));
    for (let x = x0; x <= x1; x++) {
      const i = cs.indexOf(document.elementFromPoint(x, y));
      if (i >= 0) got[i]++;
    }
    return got;
  };

  const rows = [...document.querySelectorAll('.tavola-row')];
  const rowStats = rows.map(row => {
    const cs = [...row.children].map(c => c.getBoundingClientRect());
    if (cs.length === 0) return null;
    const steps = cs.slice(1).map((c, i) => Math.round(c.left - cs[i].left));
    const rr = row.getBoundingClientRect();
    return {
      n: cs.length,
      minStep: steps.length ? Math.min(...steps) : Infinity,
      stepSpread: steps.length ? Math.max(...steps) - Math.min(...steps) : 0,
      // The last card whole, and the row inside the table's padding.
      spillRight: Math.round(Math.max(0, cs[cs.length - 1].right - (rr.right + 1))),
      spillLeft: Math.round(Math.max(0, rr.left - cs[0].left)),
      reach: reachOf(row),
    };
  }).filter(Boolean);

  const cw = card ? card.width : 0;

  // What the budget WANTS, before the clamp: --cw-height and --cw-width, read
  // through a probe because a custom property's computed value is its text,
  // not a length. Below --cw-floor the clamp decides the card, not the budget,
  // and the table pass reads these to tell when that is so — issue #5.
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;height:0';
  document.body.appendChild(probe);
  const want = v => { probe.style.width = `var(${v})`; return probe.getBoundingClientRect().width; };
  const cwHeight = want('--cw-height'), cwWidth = want('--cw-width');
  // The designed floor, from the page's own token rather than a number here
  // (issue #60): what the table pass calls "on the floor" follows the page.
  const cwFloor = want('--cw-floor');
  probe.remove();

  // Past the screen edge, and the name plates. These live in the audit too, but
  // the audit runs on a handful of screen shapes and these are questions about
  // the widest row on the table in a particular deck — so they belong where
  // every viewport and every deck is rendered. The plates were left out of the
  // card budget and the three breaks for it survived the whole check, because
  // the only pass that could see them ran at one portrait phone.
  const nameOf = e => e.id ? '#' + e.id : '.' + e.className.trim().split(/\s+/)[0];
  const offScreen = [...document.querySelectorAll('.hand, .tavola, .tavola-row, .seat__cards, .plate, .points, .say, .sel-name')]
    .filter(e => {
      const q = e.getBoundingClientRect();
      return q.width > 0 && (q.right > window.innerWidth + 1 || q.left < -1);
    }).map(nameOf);
  const plateBad = [];
  for (const plate of document.querySelectorAll('.plate, .points')) {
    if (plate.scrollWidth > plate.clientWidth + 1)
      plateBad.push(`${nameOf(plate)} spills ${plate.scrollWidth - plate.clientWidth}px past its own width`);
    if (plate.scrollHeight > plate.clientHeight + 1)
      plateBad.push(`${nameOf(plate)} spills ${plate.scrollHeight - plate.clientHeight}px past its own height`);
  }
  for (const kid of document.querySelectorAll('.plate, .plate *, .points, .points *')) {
    const a = kid.getBoundingClientRect();
    if (!a.width || !a.height) continue;
    for (const row of document.querySelectorAll('.seat__cards')) {
      const b = row.getBoundingClientRect();
      if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) {
        plateBad.push(`${nameOf(kid)} lands on the cards`); break;
      }
    }
  }

  // Nothing in the middle may land on a hand card — card against card, for the
  // reason the audit gives: the hand's own box does not follow the card that
  // leaves it.
  const handCards = [...document.querySelectorAll('.hand .card')].map(c => c.getBoundingClientRect());
  const cardsInTavola = [...document.querySelectorAll('.tavola .card')].map(c => c.getBoundingClientRect());
  const overlapsHand = cardsInTavola.filter(c =>
    handCards.some(h => c.left < h.right - 1 && c.right > h.left + 1
                     && c.top < h.bottom - 1 && c.bottom > h.top + 1)).length;

  return {
    sayShown,
    offScreen,
    plateBad,
    sayH: say ? Math.round(say.height) : 0,
    cw: Math.round(cw),
    cwExact: cw, cwHeight, cwWidth, cwFloor,
    rowStats,
    overlapsHand,
    // §3.7: one row in landscape, two in portrait once there is more than one
    // card. Without this the wrap rule is a line of JavaScript nothing reads.
    rowCount: rows.length,
    portrait: window.matchMedia('(orientation: portrait)').matches,
    // Your whole seat, not just your cards: in portrait the plate is below the
    // hand, and Tressette's hung 15px past the bottom of the screen while the
    // check printed `pass`, because it measured the hand.
    youSeatBottom: youSeat ? Math.round(youSeat.bottom) : 0,
    viewportH: window.innerHeight,
    // The table has `overflow: hidden auto`, so a budget that comes up short
    // does not error — it hands the player a scrollbar. Scrolling to reach a
    // card beats a card hidden under another one, which is why the fallback is
    // there, but needing it at all means a term of --chrome is missing: it was
    // --extra-gap, a hand-set .5rem standing in for --step, 6px short at
    // 1024x1366 and the table scrolled by exactly that.
    tableScroll: table ? Math.max(0, document.querySelector('.table').scrollHeight
                                   - document.querySelector('.table').clientHeight) : 0,
    tavolaInsideTable: tavola && table
      ? Math.round(Math.max(0, tavola.right - table.right) + Math.max(0, table.left - tavola.left))
      : 0,
    gapSpread: gaps.length ? Math.round(Math.max(...gaps) - Math.min(...gaps)) : 0,
    maxGap: gaps.length ? Math.round(Math.max(...gaps)) : 0,
    tavolaCount: cardsInTavola.length,
    engineCount: (state.tavola || []).length,
  };
};

// The tokens --chrome is derived from, made bigger. If anyone replaces the
// derivation with a constant, the cards stop shrinking to pay for the extra
// space and the assertions above catch it.
//
// Moderate on purpose. These numbers were chosen as the largest that left the
// 32px floor unbound at the tightest viewport, and they are verified to fail a
// hard-coded --chrome. Since #5 the floor binds under them at several shapes
// (980x385 in Bresciane, 500x425, and the short landscape windows), and there
// the table pass lifts it rather than testing the clamp. What still limits
// them is the budget's own zero: at 1100x320 they leave under a pixel of card,
// which is why that shape is not in TIGHT.
const INFLATE = `:root{
  --topbar: 56px !important;
  --pad-block: .95rem !important;
  --step: .85rem !important;
  --say: 26px !important;
  /* And no slack. --slack exists so the budget never lands on exactly zero,
     which means a term that is SHORT by less than --slack costs nothing and
     shows nowhere — --plates was 8px short at every portrait viewport and
     --slack is 8px. Taking it away here is what makes the budget's arithmetic
     assertable rather than merely comfortable. */
  --slack: 0px !important;
}`;

// The card with its clamp floor lifted and its cap kept out of the way: --cw is
// whatever the budget says. Only the table pass uses it, and only where the
// floor binds, to ask whether the budget itself fits the screen (issue #5). At
// !important it beats the portrait rule's own clamp as well as the root one.
const UNFLOOR = ':root{ --cw: min(var(--cw-height), var(--cw-width)) !important; }';

async function checkTable(browser, only, inflate) {
  console.log(inflate ? '\ntable, spacing inflated' : '\ntable');
  let failed = 0, flooredCases = 0, flooredShortest = 0, flooredNarrow = 0, exhaustedCases = 0;
  // Per shape: cases run, and cases whose inflated budget was exhausted. A
  // shape where every case was exhausted asked nothing, and the rail below
  // says so (the review of #73). And every floor read, which must agree.
  const casesAt = {}, exhaustedAt = {}, floorsRead = new Set();
  let list = only ? VIEWPORTS.filter(v => only.includes(v[0])) : VIEWPORTS;
  // 'tiny window' is in the quick grid because it is the shape the width term
  // is about, and 'shortest window' because it is where the plate is taller
  // than the card AND the budget has nothing left over: a break that takes a
  // term out of the budget has to have somewhere to show up. 'shorter window'
  // is the short landscape shape the inflated pass runs (1100x320 is not in
  // TIGHT), so a break confined to short windows can show up there too.
  if (QUICK) list = list.filter(v =>
    ['phone landscape', 'narrow phone', 'Android small', 'laptop',
     'tiny window', 'shortest window', 'shorter window'].includes(v[0]));

  for (const [vname, w, h] of list) {
    // Two decks even in the quick grid: Romagnole's cards are the widest, so it
    // is the only one where the width term of the budget binds, and a break
    // that takes a term out of that budget has nowhere else to show.
    for (const deck of (QUICK ? ['Trevisane', 'Romagnole'] : DECKS)) {
      for (const n of (QUICK ? [4, 13] : TABLE_SIZES)) {
        const page = await openPage(browser, { width: w, height: h });
        const errs = [];
        page.on('pageerror', e => errs.push(String(e)));
        page.on('console', m => { if (m.type() === 'error' && !noisy(m)) errs.push(m.text()); });
        await page.goto(URL_);
        await page.addStyleTag({ content: STILL });
        if (inflate) await page.addStyleTag({ content: INFLATE });
        await page.click('#play');
        // Off the table. Clicking leaves the pointer where the button was, and
        // a pointer resting on a card changes what is painted over what — so
        // every measurement below would carry a hover nobody asked for. Hover
        // is asserted on purpose in checkChoice instead.
        await page.mouse.move(0, 0);
        // The settings sheet that lets a player pick a deck is iteration 4, so
        // each deck is applied directly — applyDeck is the same call it will
        // make.
        await page.evaluate(d => applyDeck(d), deck);
        await page.evaluate(setTavola(n));
        await page.waitForTimeout(40);

        const m = await page.evaluate(measure);
        const bad = [];

        if (!m.sayShown || m.sayH < 10)
          bad.push(`the say line is ${m.sayH}px tall — it must cost --say whether or not it has something to say`);

        for (const e of m.offScreen)
          bad.push(`${e} runs off the screen`);
        bad.push(...m.plateBad);

        if (m.overlapsHand)
          bad.push(`${m.overlapsHand} table card(s) land on a hand`);

        const wantRows = (m.portrait && n > 1) ? 2 : 1;
        if (m.rowCount !== wantRows)
          bad.push(`the middle draws ${m.rowCount} row(s) in `
            + `${m.portrait ? 'portrait' : 'landscape'}, want ${wantRows}`);

        // Issue #5. Where the budget wants a card narrower than --cw's clamp
        // floor, the floor decides the card, not the budget, and the table may
        // scroll by what the floor adds: the designed fallback, since reaching a
        // card by scrolling beats a card too small to touch. "No scrolling" there
        // tested the clamp rather than the derivation, which is why 1100x320
        // left the grid and why 1100x330 tested nothing. So on the floor the
        // derivation is asked directly: lift the floor, let the card be what the
        // budget says, and the page must fit — the same rule as everywhere else.
        // The page as drawn, floor and all, is still held to every other rule in
        // this pass; only its scroll is the stated fallback.
        //
        // Only the DESIGNED floor earns this. A card held up by any other floor —
        // "the portrait card has a floor of its own" raises it to 36px — is a
        // defect the strict rule has to see, so a card that is not exactly
        // the designed floor's width (the page's --cw-floor token, read by
        // measure) is held to "no scrolling" whatever the budget wants.
        const wanted = Math.min(m.cwHeight, m.cwWidth);
        // Floored means both: the card is the designed floor's width, AND it is
        // wider than the budget wants. With the floor lowered to 20px, a card at
        // 500x425 is 31.9px because the budget wants 31.9px — near 32 and not
        // held up by any floor — and counting it as floored would have left the
        // rail below satisfied by a case the rule never had to lift.
        //
        // What this costs, and where: with the floor lifted the budget has its
        // full --slack again, where the strict rule on the floored page had only
        // what the floor left of it — 2-5px on the short landscape windows. A
        // defect that small, confined to those windows, passes this pass; it is
        // the inflated pass, with --slack at 0 and 640x480 to 1100x330 in TIGHT,
        // that catches it (the break "the icon bar grows on short landscape
        // windows"). 320x568 keeps about 3px of that difference, since the
        // inflated pass does not run it.
        casesAt[vname] = (casesAt[vname] || 0) + 1;
        floorsRead.add(Math.round(m.cwFloor * 10) / 10);
        if (!(m.cwFloor > 0))
          bad.push('the page declares no --cw-floor, so the designed card floor cannot be read');
        const floored = m.cwFloor > 0 && Math.abs(m.cwExact - m.cwFloor) < 0.5 && m.cwExact - wanted > 0.05;
        // Issue #58. The budget can also run out: when the chrome alone is
        // taller than the screen, --cw-height is negative and the probe reads 0.
        // Lifting the floor then leaves a card of nothing, the page still
        // overflows by the deficit, and "a term of --chrome is missing" would
        // blame a term that is there. Measured on correctly budgeted pages at
        // 1100x330, inflated: plate rows at 1.6 x --t-tiny leave 0.69px and fit,
        // at 1.7 x the budget reads 0.00 and overflows 4px. So "exhausted" is a
        // budget that reads zero, and it is asked apart. In the inflated pass it
        // is not a defect of the page — the inflation made the screen too short
        // — so the case is skipped and the summary counts it; in the plain pass
        // it is one, and it fails with its own message.
        const exhausted = floored && wanted < 0.05;
        if (floored) {
          flooredCases++;
          if (vname === 'shortest window') flooredShortest++;
          if (vname === 'narrow phone') flooredNarrow++;
        }
        if (exhausted) {
          if (inflate) { exhaustedCases++; exhaustedAt[vname] = (exhaustedAt[vname] || 0) + 1; }
          else bad.push('the budget leaves no card at all here: the chrome alone is taller than the '
            + 'screen, so no card size fits — not a missing term, a screen too short for the table');
        } else {
          const fit = floored ? await (async () => {
            await page.addStyleTag({ content: UNFLOOR });
            await page.waitForTimeout(40);
            return page.evaluate(measure);
          })() : m;
          const lifted = floored ? 'with the card\'s floor lifted, ' : '';
          if (fit.tableScroll > 1)
            bad.push(`${lifted}the table needs ${fit.tableScroll}px of scrolling — a term of --chrome is missing`);
          if (fit.youSeatBottom > fit.viewportH + 1)
            bad.push(`${lifted}your seat runs ${fit.youSeatBottom - fit.viewportH}px below the fold `
              + `(${fit.youSeatBottom} vs ${fit.viewportH})`);
        }

        if (m.tavolaInsideTable > 1)
          bad.push(`the table row runs ${m.tavolaInsideTable}px outside the table`);

        if (m.tavolaCount !== m.engineCount)
          bad.push(`the middle shows ${m.tavolaCount} cards, the engine holds ${m.engineCount}`);

        // The rows must not drift apart: cards hit their cap and the grid hands
        // the leftover height to the gaps until a third of the table is empty.
        // Before the per-card lines below, which can be many: a failure that is
        // about the whole table is the one worth printing first.
        if (m.gapSpread > Math.max(24, m.cw * 0.5))
          bad.push(`the rows drift apart — gaps differ by ${m.gapSpread}px`);

        // The fan floors, moved here from Tressette's hand. A strip too narrow
        // to touch does not error — it just makes a capture unreachable, and a
        // misplay costs the deal.
        const floor = Math.min(24, Math.round(m.cw * 0.45));
        for (const row of m.rowStats) {
          if (row.n > 1 && row.minStep < floor)
            bad.push(`a table row steps ${row.minStep}px between cards, want ${floor} `
              + `(${row.n} cards, ${m.cw}px each)`);
          if (row.stepSpread > 1)
            bad.push(`a table row's steps are uneven by ${row.stepSpread}px — the derivation has drifted`);
          if (row.spillRight > 1 || row.spillLeft > 1)
            bad.push(`a table row spills ${row.spillRight || row.spillLeft}px past its own box`);
          // Tressette asserted here that the last card of the fan is a whole
          // card. That assertion is gone, measured rather than argued away:
          // its cards are `width: --cw; flex: none` and the row's negative
          // margins keep the content inside the box, so nothing shrinks them.
          // `flex: 1 1 auto` on .card — the regression it was written against
          // — changes not one measurement. An assertion that cannot fail reads
          // like cover and is not any. What can fail is the spill above.

          // The strip the layout promises and the strip a thumb gets are two
          // different numbers, and only the second one plays the card. Every
          // card is reachable across its own step — the last one across a whole
          // card — unless something is painted over it.
          // One line per row, not one per card: a row that loses its strips
          // loses all of them, and thirteen copies of the same finding push the
          // assertion that explains it off the end of the report.
          const want = Math.min(row.minStep, m.cw);
          const reach = row.reach || [];
          const starved = reach.findIndex(g => g < floor);
          const robbed = reach.findIndex(g => g >= floor && g < want - 2);
          if (starved >= 0)
            bad.push(`table card ${starved} is ${reach[starved]}px wide to a thumb, `
              + `want ${floor} (${row.n} cards, ${m.cw}px each)`);
          else if (robbed >= 0)
            bad.push(`table card ${robbed} loses ${want - reach[robbed]}px of its strip to `
              + `whatever is painted over it (${reach[robbed]}px reachable of ${want}px)`);
        }

        const all = [...bad, ...errs];
        if (all.length) {
          failed++;
          console.log(`  FAIL  ${vname} / ${deck} / ${n} cards`);
          all.forEach(b => console.log(`        ${b}`));
        }
        await page.close();
      }
    }
  }
  // The floor rule is behind a condition, so say whether it was ever asked.
  // 1100x320 is in the grid to be on the floor; if no case there was, the
  // rule above went unasked and this pass would look exactly as if it held.
  if (list.some(v => v[0] === 'shortest window') && !flooredShortest) {
    failed++;
    console.log(`  FAIL  the landscape floor rail\n        no case at 1100x320 was on the card's clamp floor, so the floor rule was never asked`);
  }
  // The skip above is a guard too, and railed like the floors (the review of
  // #73): a shape where the inflated budget ran out in every case asked
  // nothing at all, so a defect only that shape could see — an 8px shortfall
  // confined to short landscape, beside a correct change that exhausts the
  // budget there — would pass with every line green. Partly exhausted is
  // fine: the other decks still ask.
  for (const [shape, n] of Object.entries(exhaustedAt))
    if (n === casesAt[shape]) {
      failed++;
      console.log(`  FAIL  the exhausted-budget rail at ${shape}\n        the inflated budget leaves no card in any case, so this pass asks `
        + 'nothing there: the page no longer fits the inflation at that shape. Take the shape out of '
        + 'TIGHT or ease INFLATE, and say why');
    }
  // One floor. --cw-floor is declared once and both clamps use it (#60); a
  // page that overrides it in one orientation reads two floors across the
  // grid, and the portrait one would then pass as "designed" (the review of
  // #73).
  if (floorsRead.size > 1) {
    failed++;
    console.log(`  FAIL  the one-floor rail\n        the card floor reads ${[...floorsRead].join('px and ')}px across the grid: `
      + '--cw-floor is overridden somewhere, so there is no one designed floor');
  }
  // The same for portrait, whose --cw rule has a clamp of its own (issue #59):
  // at 320x568 the budget wants a hair under the floor in two decks, one of them
  // Trevisane, which the quick grid runs. A portrait floor lowered below what
  // the budget wants floors nothing there, and without this nothing would say so.
  if (list.some(v => v[0] === 'narrow phone') && !flooredNarrow) {
    failed++;
    console.log(`  FAIL  the portrait floor rail\n        no case at 320x568 was on the card's clamp floor, so the portrait floor rule was never asked`);
  }
  const deckN = QUICK ? 2 : DECKS.length, sizeN = QUICK ? 2 : TABLE_SIZES.length;
  console.log(`  ${failed ? failed + ' case(s) failed' : 'pass'}  `
    + `${list.length} viewports x ${deckN} decks x ${sizeN} table sizes`
    + (flooredCases ? `, ${flooredCases} on the clamp floor` : '')
    + (exhaustedCases ? `, ${exhaustedCases} where the inflated budget leaves no card, so the floor rule was not asked` : ''));
  return failed;
}

/* ---- pass 2b: the capture choice and the toast ----------------------------- */

// The states §3.7 adds, measured rather than merely rendered. A capture with a
// choice in it is the one interaction this game has that neither ancestor did.
async function checkChoice(browser) {
  console.log('\nthe capture choice, and the toast');
  let failed = 0;
  const list = QUICK ? ['Android small'] : CHOICE_VIEWPORTS;
  for (const [vi, vname] of list.entries()) {
    const [, w, h] = VIEWPORTS.find(v => v[0] === vname);
    const page = await openPage(browser, { width: w, height: h });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !noisy(m)) errs.push(m.text()); });
    await page.goto(URL_);
    await page.addStyleTag({ content: STILL });
    await page.click('#play');
    // A different deck each time round: the decks differ in card ratio, so the
    // geometry below differs with them, and running one deck here was a gap
    // rather than a decision.
    const deck = DECKS[vi % DECKS.length];
    await page.evaluate(d => applyDeck(d), deck);
    await page.mouse.move(0, 0);
    await page.evaluate(poseChoice);

    const bad = await page.evaluate(() => {
      const out = [];
      const marked = () => [...document.querySelectorAll('.tavola .card')]
        .map((c, i) => [i, c.dataset.take === 'true'])
        .filter(([, t]) => t).map(([i]) => i);

      // The card is raised.
      const raised = document.querySelector('.hand--you .card[aria-pressed="true"]');
      if (!raised) out.push('a capture with a choice did not raise the card');

      // Exactly the cards of the proposal are marked — not more, not fewer.
      const want = propostaCorrente();
      const got = marked();
      if (JSON.stringify(got) !== JSON.stringify([...want].sort((a, b) => a - b)))
        out.push(`the table marks ${JSON.stringify(got)}, the proposal is ${JSON.stringify(want)}`);
      if (got.length === 0) out.push('nothing on the table is marked');

      // The line says what the next tap will do, not merely what the card is.
      const say = document.querySelector('.sel-name');
      if (say.hidden) out.push('the say line is hidden while a card is raised');
      if (!/^Prendi /.test(say.textContent))
        out.push(`the say line does not say what the tap does: "${say.textContent}"`);

      // Switching the proposal by tapping a table card marks exactly the new
      // set. This is the second of the two paths §4 requires.
      const other = proposte().findIndex(s => JSON.stringify(s) !== JSON.stringify(want));
      if (other < 0) out.push('the posed position offers only one capture — it is not a choice');
      else {
        const said = say.textContent;
        const idx = proposte()[other][0];
        document.querySelector(`.tavola .card[data-index="${idx}"]`).click();
        const now = marked();
        const wantNow = [...propostaCorrente()].sort((a, b) => a - b);
        if (JSON.stringify(now) !== JSON.stringify(wantNow))
          out.push(`after tapping a table card the marks are ${JSON.stringify(now)}, want ${JSON.stringify(wantNow)}`);
        if (JSON.stringify(now) === JSON.stringify([...want].sort((a, b) => a - b)))
          out.push('tapping a table card did not change the proposal');
        // Two proposals, one line. The posed position is two sevens on the
        // table and a seven in hand — the value alone reads "Prendi il sette
        // con il sette" for both of them, and a line that cannot tell the
        // player which seven is about to go is not telling them anything.
        if (say.textContent === said)
          out.push(`the say line reads the same for both proposals: "${said}"`);
      }
      return out;
    });

    // The toast floats: it takes no space in the flow and is never clipped.
    await page.evaluate(`toast("Scopa!")`);
    await page.waitForTimeout(30);
    const toastBad = await page.evaluate(() => {
      const out = [];
      const t = document.querySelector('.toast');
      if (t.hidden) out.push('the toast did not show');
      const cs = getComputedStyle(t);
      if (cs.position !== 'absolute' && cs.position !== 'fixed')
        out.push(`the toast is ${cs.position} — it is in the flow, and it will move the cards`);
      const r = t.getBoundingClientRect();
      if (r.right > window.innerWidth + 1 || r.left < -1)
        out.push(`the toast runs off the screen (${Math.round(r.left)}…${Math.round(r.right)})`);
      if (t.scrollHeight > t.clientHeight + 1)
        out.push(`the toast clips its own text (${t.scrollHeight} > ${t.clientHeight})`);
      return out;
    });

    // The same choice on a crowded table. Two things can only go wrong here:
    // the mark can take the tap that belongs to the card beside it, and the
    // raised card can stand on the cards it is proposing to capture. Both are
    // invisible in the diff, neither throws, and each costs a deal.
    await page.reload();
    await page.addStyleTag({ content: STILL });
    await page.click('#play');
    await page.evaluate(d => applyDeck(d), deck);
    await page.evaluate(poseChoiceCrowded);
    // And a pointer resting on one of those cards, on purpose. A hover that
    // lifts a card transforms it, a transform paints it as its own stacking
    // context, and the card to its right loses the difference — which is the
    // same defect as marking one, arriving by a different door. Hovering here
    // is what makes the measurement below see it.
    const spot = await page.evaluate(() => {
      // A card the proposal is offering to take, by preference: a pointer on a
      // marked card is where two rules meet, and the hover ring used to paint
      // over the mark and say the opposite of what was true.
      const rows = [...document.querySelectorAll('.tavola-row')];
      const row = rows[rows.length - 1];
      const c = document.querySelector('.tavola .card[data-take="true"]')
             || (row && row.children[Math.min(2, row.children.length - 1)]);
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { x: Math.round(r.left + 4), y: Math.round(r.top + r.height / 2) };
    });
    if (spot) await page.mouse.move(spot.x, spot.y);
    await page.waitForTimeout(40);
    const crowdBad = await page.evaluate(() => {
      const out = [];
      // From a card on the table, which is never raised and never scaled.
      const anyCard = document.querySelector('.tavola .card');
      const cw = anyCard ? anyCard.getBoundingClientRect().width : 0;
      const floor = Math.min(24, Math.round(cw * 0.45));

      const mark = document.querySelector('.tavola .card[data-take="true"]');
      if (!mark)
        out.push('nothing on the crowded table is marked — the position is not a choice');
      else if (!/rgb\(200, 162, 74\)/.test(getComputedStyle(mark).boxShadow))
        out.push('the marked card under the pointer is not drawn as marked');

      for (const row of document.querySelectorAll('.tavola-row')) {
        const cs = [...row.children];
        if (cs.length < 2) continue;
        const boxes = cs.map(c => c.getBoundingClientRect());
        const step = Math.min(...boxes.slice(1).map((b, i) => b.left - boxes[i].left));
        const want = Math.min(Math.round(step), Math.round(cw));
        const first = boxes[0];
        const y = Math.round(first.top + first.height / 2);
        if (y < 0 || y >= window.innerHeight) continue;
        const got = cs.map(() => 0);
        for (let x = Math.max(0, Math.ceil(row.getBoundingClientRect().left));
             x <= Math.min(window.innerWidth - 1, Math.floor(row.getBoundingClientRect().right)); x++) {
          const i = cs.indexOf(document.elementFromPoint(x, y));
          if (i >= 0) got[i]++;
        }
        got.forEach((g, i) => {
          if (g < floor)
            out.push(`with a capture marked, table card ${i} is ${g}px wide to a thumb, want ${floor}`);
          else if (g < want - 2)
            out.push(`with a capture marked, table card ${i} loses ${want - g}px of its strip `
              + `to whatever is painted over it (${g}px of ${want}px)`);
        });
      }

      // And the card you raised is not standing on the table.
      const hit = (a, b) => a.left < b.right - 1 && a.right > b.left + 1
                         && a.top < b.bottom - 1 && a.bottom > b.top + 1;
      const hand = [...document.querySelectorAll('.hand .card')].map(c => c.getBoundingClientRect());
      const on = [...document.querySelectorAll('.tavola .card')]
        .filter(c => hand.some(h => hit(c.getBoundingClientRect(), h))).length;
      if (on) out.push(`the raised card stands on ${on} table card(s)`);
      return out;
    });

    // The say line, hit-tested while a card is raised. That the line says the
    // right words is asserted above; that anything can READ them is a separate
    // question, and the raised card was drawn over 120px of a 309px line at
    // 1440x900 from the middle slot — over the suit, which is the reason the
    // line names one.
    const sayBad = [];
    for (const slot of [0, 1]) {
      await page.reload();
      await page.addStyleTag({ content: STILL });
      await page.click('#play');
      await page.evaluate(d => applyDeck(d), deck);
      await page.mouse.move(0, 0);
      await page.evaluate(`(() => {
        state.tavola = [{s:1,n:7},{s:0,n:7},{s:2,n:4},{s:3,n:3}];
        state.hands[0] = [{s:2,n:7},{s:3,n:7},{s:1,n:2}];
        state.deveGiocare = 0; state.over = false; state.selected = null; state.scelta = 0;
        render(); tapped(${slot});
      })()`);
      await page.waitForTimeout(40);
      sayBad.push(...await page.evaluate(() => {
        const out = [];
        const t = document.querySelector('.sel-name');
        const r = t.getBoundingClientRect();
        if (!r.width) { out.push('the say line has no box while a card is raised'); return out; }
        const y = Math.round(r.top + r.height / 2);
        let covered = 0;
        for (let x = Math.ceil(r.left); x <= Math.floor(r.right); x++) {
          const e = document.elementFromPoint(x, y);
          if (e !== t && !t.contains(e)) covered++;
        }
        if (covered > 1)
          out.push(`${covered}px of the say line is drawn over while a card is raised `
            + `(${Math.round(r.width)}px wide)`);
        return out;
      }));
    }

    // What the ladder must do, stated as a rule rather than as a string table.
    //
    // A string table is the shape of assertion that shipped a check passing
    // here and failing in CI: which rung wins depends on the width AND on the
    // type metrics, so naming one per viewport is naming the metrics of
    // whatever typeface happened to load. It was true of the widest line first,
    // and it became true of the middle rung the moment the say line stopped
    // being --t-tiny — 28 characters no longer fit a 320px screen.
    //
    // So each position declares what it MAY say: the shown line must be one of
    // the rungs, one line, inside its box and short enough to be a label.
    //
    // And only what it may say. A "may not" list was here as well, naming the
    // whole capture that is over the cap at two of the three positions — but
    // the forbidden string was never in the may list either, so the membership
    // check three lines below fired on it first and the extra rule could not go
    // red on its own. That is the same property this file cited when it deleted
    // the character count from the same block.
    const SEGNATA = 'Prendi la carta segnata';
    const rungBad = [];
    for (const [pose, may] of [
           [poseLongSay,    [LONG_SAY, SEGNATA]],
           [poseUnnameable, [UNNAMEABLE_SAY]],
           [poseWidestSay,  [WIDEST_SAY, CUT_SAY]]]) {
      await page.reload();
      await page.addStyleTag({ content: STILL });
      await page.click('#play');
      await page.evaluate(d => applyDeck(d), deck);
      await page.mouse.move(0, 0);
      await page.evaluate(pose);
      await page.waitForTimeout(40);
      rungBad.push(...await page.evaluate(rungs => {
        const out = [];
        if (!document.querySelector('.hand--you .card[aria-pressed="true"]'))
          out.push(`the position meant to say "${rungs[0]}" played the card instead of raising it`);
        const el = document.querySelector('.sel-name');
        const said = el.textContent;
        if (!rungs.includes(said))
          out.push(`the say line should name the capture "${rungs[0]}", it says "${said}"`);
        // Not the character count as well: every rung a position may produce is
        // inside the cap, so a length check here has a firing set that is a
        // strict subset of the membership check's and cannot go red on its own.
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (r.height > parseFloat(cs.lineHeight) + 1)
          out.push(`the say line wraps to ${Math.round(r.height)}px of a ${Math.round(parseFloat(cs.lineHeight))}px line: "${said}"`);
        const box = document.querySelector('.say').getBoundingClientRect();
        if (r.left < box.left - 1 || r.right > box.right + 1)
          out.push(`the say line is ${Math.round(r.width)}px in a ${Math.round(box.width)}px box: "${said}"`);
        return out;
      }, may));
    }

    const all = [...bad, ...toastBad, ...crowdBad, ...sayBad, ...rungBad, ...errs];
    if (all.length) {
      failed++;
      console.log(`  FAIL  ${vname} / ${deck}`);
      all.forEach(b => console.log(`        ${b}`));
    }
    await page.close();
  }
  console.log(`  ${failed ? failed + ' case(s) failed' : 'pass'}  `
    + `${list.length} viewports, seven positions each`);
  return failed;
}

/* ---- pass 2c: the two states only playing can reach ------------------------ */

// The sweep and the beat. Both are moments the deal passes through rather than
// states it sits in, so neither can be posed: the toast over a table that still
// has cards on it is not a scopa, and two empty hands are a state the engine
// refuses to sit in at all — gioca() deals the next round before it returns.
// The page is told, in `nuovoGiro`, and a page that does not listen simply
// never draws the beat. Tressette shipped a finished trick that way.
async function checkStates(browser) {
  console.log('\nthe sweep, and the beat between rounds');
  let failed = 0;
  const list = QUICK ? ['Android small'] : SCREEN_VIEWPORTS;
  for (const [vi, vname] of list.entries()) {
    const [, w, h] = VIEWPORTS.find(v => v[0] === vname);
    const page = await openPage(browser, { width: w, height: h });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !noisy(m)) errs.push(m.text()); });
    await page.goto(URL_);
    await page.addStyleTag({ content: STILL });
    await page.click('#play');
    // A different deck each time round, as in checkChoice: one deck here was a
    // gap rather than a decision.
    const deck = DECKS[vi % DECKS.length];
    await page.evaluate(d => applyDeck(d), deck);
    await page.mouse.move(0, 0);

    await page.evaluate(playSweep);
    await page.waitForTimeout(LANDS_MS);
    // Beat one: the card that was played is ON THE TABLE, among the two it is
    // about to take, and nothing is leaving yet. Without this beat a capturing
    // card is never drawn anywhere — gioca moves it from a hand to a pile — so
    // the player watches cards leave and has to work out what took them. It is
    // the defect the owner found by playing the preview.
    const lands = await page.evaluate(() => {
      const out = [];
      const shown = document.querySelectorAll('.tavola .card').length;
      if (shown !== 3)
        out.push(`the card that was played was not laid on the table: the middle shows ${shown}, want 3`);
      const played = document.querySelectorAll('.tavola .card[data-played="true"]').length;
      if (played !== 1) out.push(`${played} card(s) drawn as the one just played, want 1`);
      const going = document.querySelectorAll('.tavola .card--won-up, .tavola .card--won-down').length;
      if (going) out.push(`${going} card(s) are already leaving before the card that takes them has landed`);
      return out;
    });

    await page.waitForTimeout(SWEEPING_MS);
    // Beat two: all three leave together — the two that were taken and the one
    // that took them.
    const flying = await page.evaluate(() => {
      const out = [];
      const shown = document.querySelectorAll('.tavola .card').length;
      if (shown !== 3)
        out.push(`the capture was not drawn leaving the table: the middle shows ${shown} card(s)`);
      const down = document.querySelectorAll('.tavola .card--won-down').length;
      const up = document.querySelectorAll('.tavola .card--won-up').length;
      if (down + up !== 3) out.push(`${down + up} card(s) marked as leaving, want 3`);
      // Down, because you took it, and ALL of them: a sweep that sends the
      // cards one way and the card that took them the other says two players
      // captured, and counting "is anything going down" cannot see it.
      if (up) out.push(`the capture is sweeping the wrong way: ${up} of ${down + up} card(s) going up`);
      return out;
    });

    // The other direction. A sweep toward the wrong player says the other
    // player captured, and until now only one of the two was ever drawn.
    await page.reload();
    await page.addStyleTag({ content: STILL });
    await page.click('#play');
    await page.evaluate(d => applyDeck(d), deck);
    await page.mouse.move(0, 0);
    await page.evaluate(playSweepOpp);
    await page.waitForTimeout(LANDS_MS);
    // The opponent's card, on the table, where the player can see it. This is
    // the one that matters: you know what you played.
    const oppLands = await page.evaluate(() => {
      const out = [];
      const played = document.querySelector('.tavola .card[data-played="true"]');
      if (!played) out.push("the opponent's card was never drawn on the table");
      return out;
    });
    await page.waitForTimeout(SWEEPING_MS);
    const flyingOpp = await page.evaluate(() => {
      const out = [];
      const down = document.querySelectorAll('.tavola .card--won-down').length;
      const up = document.querySelectorAll('.tavola .card--won-up').length;
      if (down + up !== 2) out.push(`${down + up} card(s) marked as leaving on the opponent's capture, want 2`);
      if (down) out.push(`the opponent's capture is sweeping the wrong way: ${down} of ${down + up} card(s) going down`);
      // And your hand is plainly not ready while the table is busy. It is your
      // turn the moment their capture resolves, so the cards look live — and
      // `tapped` refuses while the sweep runs. A card that takes a tap and does
      // nothing is worse than one that looks refused.
      const live = [...document.querySelectorAll('.hand--you .card')]
        .filter((c, i) => state.hands[0][i] && !c.disabled).length;
      if (live) out.push(`${live} card(s) in your hand are still tappable during the sweep`);
      return out;
    });

    await page.reload();
    await page.addStyleTag({ content: STILL });
    await page.click('#play');
    await page.evaluate(d => applyDeck(d), deck);
    await page.mouse.move(0, 0);
    await page.evaluate(playLay);
    await page.waitForTimeout(LANDS_MS);
    const laidBad = await page.evaluate(() => {
      const out = [];
      const shown = document.querySelectorAll('.tavola .card').length;
      if (shown !== 2) out.push(`a card was laid and the middle shows ${shown}, want 2`);
      const played = document.querySelectorAll('.tavola .card[data-played="true"]').length;
      if (played !== 1) out.push(`${played} card(s) drawn as the one just played after a lay, want 1`);
      if (document.querySelectorAll('.tavola .card--won-up, .tavola .card--won-down').length)
        out.push('a card that took nothing is sweeping off the table');
      return out;
    });

    await page.reload();
    await page.addStyleTag({ content: STILL });
    await page.click('#play');
    await page.evaluate(d => applyDeck(d), deck);
    await page.mouse.move(0, 0);
    await page.evaluate(playSweep);
    await page.waitForTimeout(SWEEP_MS);
    const sweep = await page.evaluate(() => {
      const out = [];
      const t = document.querySelector('.toast');
      if (t.hidden) out.push('a sweep was played and nothing announced it');
      else if (!/scopa/i.test(t.textContent)) out.push(`the toast says "${t.textContent}"`);
      // Not `state.tavola.length` — that is the engine's business and
      // tools/engine.test.mjs owns it. And not "nothing still carries the
      // sweep class": the class is written from `sweeping` on every render, so
      // it cannot outlive it, and an assertion that cannot fail reads like
      // cover and is not any. What can fail is the table not catching up.
      const shown = document.querySelectorAll('.tavola .card').length;
      if (shown) out.push(`the middle still draws ${shown} card(s) after the sweep`);
      const marks = document.querySelectorAll('#scopeYou .scopa-mark').length;
      if (marks !== state.scope[0]) out.push(`${marks} scopa mark(s) drawn, the engine counted ${state.scope[0]}`);

      // The middle keeps its row while it is empty, or the whole table
      // re-centres on the beat when the player is looking hardest.
      const tav = document.querySelector('.tavola').getBoundingClientRect();
      const card = document.querySelector('.hand--you .card').getBoundingClientRect();
      if (tav.height < card.height - 1)
        out.push(`the empty middle collapsed to ${Math.round(tav.height)}px, a card is ${Math.round(card.height)}px`);
      return out;
    });

    // The 36th play. Everything above measures a play in the middle of a deal,
    // and the last one is not one of those: `gioca` sets `over` on it and
    // sweeps the leftovers up with it, so it is the one play where what covers
    // the table and where the cards go are both decided differently. Nothing
    // rendered it, and both went wrong.
    const last = await page.evaluate(playToLast);
    const ending = [];
    if (!last) ending.push('the driver never reached the last play of the deal');
    else {
      await page.waitForTimeout(LAST_LANDS_MS);
      ending.push(...await page.evaluate(() => {
        const out = [];
        // The panel is opaque and covers the whole table. Up from the first
        // frame, the card that ends the deal lands and sweeps behind it.
        if (!document.getElementById('result').hidden)
          out.push('the points are counted out over the last play, before it has been drawn');
        const played = document.querySelectorAll('.tavola .card[data-played="true"]').length;
        if (played !== 1)
          out.push(`${played} card(s) drawn as the one that ended the deal, want 1`);
        const going = document.querySelectorAll('.tavola .card--won-up, .tavola .card--won-down').length;
        if (going) out.push(`${going} card(s) are already leaving on the last play before it has landed`);
        return out;
      }));
      await page.waitForTimeout(LAST_FLYING_MS);
      ending.push(...await page.evaluate(info => {
        const out = [];
        if (!document.getElementById('result').hidden)
          out.push('the points are counted out over the last play while it is still sweeping');
        const down = document.querySelectorAll('.tavola .card--won-down').length;
        const up = document.querySelectorAll('.tavola .card--won-up').length;
        const shown = document.querySelectorAll('.tavola .card').length;
        if (down + up !== shown)
          out.push(`the last play leaves ${down + up} of ${shown} card(s) on the table — `
            + `after the 36th card nothing stays on it`);
        // ONE way. A card that takes nothing on the last play is swept up with
        // the leftovers, to whoever captured last — drawing it toward the
        // player who played it says two players took cards from one play.
        const wantDown = (info.took ? info.who : info.ultimaPresa) === 0;
        const wrong = wantDown ? up : down;
        if (wrong)
          out.push(`the last play sends ${wrong} of ${down + up} card(s) the wrong way: `
            + `they all go to player ${info.took ? info.who : info.ultimaPresa}`);
        return out;
      }, last));
      await page.waitForTimeout(LAST_SETTLED_MS);
      ending.push(...await page.evaluate(() => {
        const out = [];
        // And then it does show, or holding it back would be a way to lose it.
        if (document.getElementById('result').hidden)
          out.push('the last play was drawn and the points were never counted out');
        const shown = document.querySelectorAll('.tavola .card').length;
        if (shown) out.push(`the middle still draws ${shown} card(s) after the deal is over`);
        return out;
      }));
    }

    // The 36th play that takes NOTHING, twice: onto a table with cards on it
    // and onto an empty one. A driven deal reaches whichever ending its seed
    // reaches — this one captures — so these two are posed up to the play and
    // then played. Both breaks written for the lines below survived until the
    // check rendered them, which is the rule in one sentence.
    // Both expectations are DERIVED from what the pose reports — the table it
    // left plus the card that joins it, and the player it says took last —
    // rather than written beside it. Twenty lines up, the driven block does the
    // same with `info`. Hard-coded, they go quietly wrong the moment a pose is
    // edited, while still passing; and I had them wrong once already, having
    // forgotten that the played card joins the row it is drawn on.
    for (const [what, pose] of [['with leftovers under it', playLastLeftovers],
                                ['onto an empty table',     playLastOnEmpty]]) {
      await page.reload();
      await page.addStyleTag({ content: STILL });
      await page.click('#play');
      await page.evaluate(d => applyDeck(d), deck);
      await page.mouse.move(0, 0);
      const posed = await page.evaluate(pose);
      await page.waitForTimeout(LAST_LANDS_MS);
      ending.push(...await page.evaluate(([label, p]) => {
        const out = [];
        const shown = document.querySelectorAll('.tavola .card').length;
        if (shown !== p.cards)
          out.push(`the last card ${label} is drawn on a table of ${shown}, want ${p.cards}`);
        const played = document.querySelectorAll('.tavola .card[data-played="true"]').length;
        if (played !== 1)
          out.push(`${played} card(s) drawn as the last card ${label}, want 1`);
        return out;
      }, [what, posed]));
      await page.waitForTimeout(LAST_FLYING_MS);
      ending.push(...await page.evaluate(([label, p]) => {
        const out = [];
        const down = document.querySelectorAll('.tavola .card--won-down').length;
        const up = document.querySelectorAll('.tavola .card--won-up').length;
        if (down + up !== p.cards)
          out.push(`${down + up} of ${p.cards} card(s) leaving on the last card ${label}`);
        // All of them to whoever took last — the leftovers AND the card that
        // was just played, which is what makes this play unlike every other.
        const wrong = p.to === 0 ? up : down;
        if (wrong) out.push(`the last card ${label} sends ${wrong} card(s) the wrong way: `
          + `it takes nothing, so it goes to player ${p.to} with the leftovers`);
        return out;
      }, [what, posed]));
    }

    const reached = await page.evaluate(playToBeat);
    // The window between the play that empties both hands and the beat, which
    // is a state of its own and was never rendered. `gioca` deals the next
    // round before it returns, so by the time the page hears about the play the
    // state already holds three new cards a side — while the card that ended
    // the round is still landing. Drawn there, a hand appears, deals in, blanks
    // for the beat and deals in AGAIN: the flicker the deal-in was written to
    // remove, in a worse form, and measured at 1.35s of it.
    if (reached) ending.push(...await page.evaluate(() => {
      const out = [];
      const drawn = who => [...document.querySelectorAll(who)]
        .filter(c => c.dataset.empty !== 'true').length;
      if (drawn('.hand--you .card') || drawn('.hand--opp .card'))
        out.push(`the card that ended the round is still landing and the next round is `
          + `already drawn: ${drawn('.hand--you .card')}/${drawn('.hand--opp .card')} in hand`);
      return out;
    }));
    // Sampled once the TABLE has settled, not at the play. At the play `beat`
    // is true either way and the rule below cannot fail; after `then` has run
    // it is true only if the beat is being held, which is the whole of what
    // BEAT buys. `sweeping === null && laid < 0` is exactly "the table has
    // caught up", and `endBeat` is BEAT away from there.
    if (reached) await page.waitForFunction('sweeping === null && laid < 0', null,
      { timeout: 8000 }).catch(() => {});
    const between = await page.evaluate(() => {
      const out = [];
      const drawn = who => [...document.querySelectorAll(who)]
        .filter(c => c.dataset.empty !== 'true').length;
      const held = w => state.hands[w].filter(Boolean).length;
      // Not "did the page enter the beat" — that had a firing set strictly
      // inside the window assertion's and could not go red on its own, which
      // is the property this file used to delete two other rules. What BEAT is
      // for is holding the empty hands there after the table has settled, and
      // nothing asserted that at all: since the hands are empty for LANDS +
      // SWEEP anyway, `BEAT = 0` changed nothing any rule could see.
      if (!beat) { out.push('the round ended and the page did not hold the beat'); return out; }
      if (held(0) !== 3 || held(1) !== 3)
        out.push(`the next round was not dealt: ${held(0)}/${held(1)} in hand`);
      if (drawn('.hand--you .card') || drawn('.hand--opp .card'))
        out.push(`the beat draws ${drawn('.hand--you .card')}/${drawn('.hand--opp .card')} cards, `
          + `it is the moment both hands are empty`);
      // And the empty hand still costs a card row. Not the hand's height —
      // three slot elements hold that up whatever the rule says — but the slots
      // themselves: hide them and the hand collapses, and every card on the
      // table moves between the last play of a round and the first of the next.
      const card = document.querySelector('.tavola .card');
      const ch = card ? card.getBoundingClientRect().height : 0;
      const slots = [...document.querySelectorAll('.hand--you .card')]
        .filter(c => c.getBoundingClientRect().height > ch - 1).length;
      // Railed, because `ch` comes from a card on the table and the play that
      // ends a round can be a scopa, which leaves none. Seed 11 does not, and
      // the break for the collapse is caught today — but that is a property of
      // one seed recorded nowhere, and a reseed would skip this in silence.
      if (!ch)
        out.push('the table was empty on the beat, so the hand was never measured against a card');
      if (ch && slots !== 3)
        out.push(`the empty hand keeps ${slots} card-sized slot(s), want 3 — it collapsed`);
      return out;
    });

    // And then the new hand arrives. It must be DEALT rather than appear: three
    // outlines becoming three cards between one frame and the next reads as a
    // flicker, which is what the owner saw. The animation itself cannot be
    // asserted here — this check runs with motion off, on purpose — but the
    // mark the page puts on a card it has just dealt can be, and a hand that is
    // never marked is a hand that was never dealt in.
    await page.waitForFunction('beat === false', null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(60);
    between.push(...await page.evaluate(() => {
      const out = [];
      const hands = [...document.querySelectorAll('.hand .card')];
      const drawn = hands.filter(c => c.dataset.empty !== 'true');
      if (drawn.length !== 6)
        out.push(`the new round drew ${drawn.length} cards, want 6`);
      const marked = drawn.filter(c => c.dataset.dealt === 'true').length;
      if (marked !== drawn.length)
        out.push(`${drawn.length - marked} of ${drawn.length} cards in the new hand `
          + `were not drawn as dealt — they appeared`);
      return out;
    }));
    if (!reached) between.push('the driver never reached the end of a round');

    // And the FIRST hand of a session, which no pass could see. The faces are
    // local now, so `document.fonts.ready` resolves almost at once on file://
    // and the boot render always leaves the slots in a state `dealt` can work
    // from; on a real phone with a face still on its way it does not, and the
    // first hand a player ever sees APPEARS. Measured that way: {"drawn":6,"dealt":0}
    // against a settled-font control of {"drawn":6,"dealt":6}.
    //
    // So the rule is asserted on `buildHands` itself, called here with no
    // render after it — every slot it makes must be drawn empty, because that
    // is the state `dealt` compares against. Testing the outcome instead would
    // measure the boot render rather than the function. Last in the loop: it
    // replaces the hand elements.
    const firstDeal = await page.evaluate(() => {
      const out = [];
      buildHands();
      const slots = [...document.querySelectorAll('.hand .card')];
      const unset = slots.filter(c => c.dataset.empty !== 'true').length;
      if (unset) out.push(`${unset} of ${slots.length} hand slot(s) start neither empty nor `
        + `full — the first hand of a session appears rather than being dealt`);
      return out;
    });

    const all = [...lands, ...flying, ...oppLands, ...flyingOpp, ...laidBad,
                 ...sweep, ...ending, ...between, ...firstDeal, ...errs];
    if (all.length) {
      failed++;
      console.log(`  FAIL  ${vname} / ${deck}`);
      // Every one of them. This pass makes eight groups of assertions and up to
      // thirteen lines can precede the newest; truncating at six reported a
      // MISMATCH for an assertion that had fired and was simply off the end of
      // the list, which is what forced one EXPECT to be loosened a commit ago.
      all.forEach(b => console.log(`        ${b}`));
    }
    await page.close();
  }
  console.log(`  ${failed ? failed + ' case(s) failed' : 'pass'}  ${list.length} viewports`);
  return failed;
}

/* ---- pass 2d: turning the phone over ---------------------------------------- */

// A change of viewport is a state, and it is the one state the whole grid above
// cannot render: every case here loads the page at a size and measures it once.
// Two things about this table are decided in script rather than in the sheet —
// whether the middle row wraps, which is an orientation, and which rung the say
// line can hold, which is a width — and before iteration 3's fourth round
// neither was read again after the first paint. Measured then, thirteen cards
// down and no reload: rotating 980x385 to portrait left one row of thirteen
// with a 22.6px strip, under the floor; rotating 360x800 to landscape left two
// rows against a budget that paid for one, 82px of scrolling and your own seat
// 75px below the fold; and a say line raised at 600x853 and resized to 320 kept
// its rung and stood 38px tall in a 23px box.
async function checkRotation(browser) {
  console.log('\nturning the phone over');
  let failed = 0;
  // Both halves of every pair are shapes the game can actually hold. Rotating
  // 500x425 gives 425x500, which is not one: a portrait table is four card rows
  // and the chrome around them, and below about 570px of height the card is on
  // its clamp floor and the table hands back a scrollbar however faithfully the
  // budget tracks its tokens. That is the designed fallback, not a defect, and
  // asserting against it here would be asserting the clamp.
  const TURNS = QUICK ? [[[980, 385], [385, 980]]]
                      : [[[980, 385], [385, 980]], [[360, 800], [800, 360]],
                         [[1024, 1366], [1366, 1024]], [[430, 932], [932, 430]]];
  for (const [i, [from, to]] of TURNS.entries()) {
    const page = await openPage(browser, { width: from[0], height: from[1] });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !noisy(m)) errs.push(m.text()); });
    await page.goto(URL_);
    await page.addStyleTag({ content: STILL });
    await page.click('#play');
    // A different deck each time round, as everywhere else: these four shapes
    // are in no other grid, so one deck here is a gap rather than a decision.
    const deck = DECKS[i % DECKS.length];
    await page.evaluate(d => applyDeck(d), deck);
    await page.mouse.move(0, 0);
    await page.evaluate(setTavola(13));
    await page.waitForTimeout(40);

    // Over it goes and back again, without reloading and with the thirteen
    // cards still down. Both ways, because the two directions are different
    // questions: one asks whether the row learns to wrap, the other whether it
    // learns to stop. Everything measured below is on a page that has been
    // running since the other orientation.
    const bad = [];
    for (const size of [to, from]) {
      await page.setViewportSize({ width: size[0], height: size[1] });
      await page.waitForTimeout(80);

      const m = await page.evaluate(measure);
      const at = `after turning to ${size.join('x')}`;
      for (const e of m.offScreen) bad.push(`${at}, ${e} runs off the screen`);
      bad.push(...m.plateBad.map(b => `${at}, ${b}`));
      if (m.tableScroll > 1)
        bad.push(`${at}, the table needs ${m.tableScroll}px of scrolling`);
      if (m.youSeatBottom > m.viewportH + 1)
        bad.push(`${at}, your seat runs ${m.youSeatBottom - m.viewportH}px below the fold`);
      if (m.overlapsHand)
        bad.push(`${at}, ${m.overlapsHand} table card(s) land on a hand`);
      if (m.tavolaInsideTable > 1)
        bad.push(`${at}, the table row runs ${m.tavolaInsideTable}px outside the table`);
      if (m.tavolaCount !== m.engineCount)
        bad.push(`${at}, the middle shows ${m.tavolaCount} cards, the engine holds ${m.engineCount}`);
      const wantRows = m.portrait ? 2 : 1;
      if (m.rowCount !== wantRows)
        bad.push(`${at}, the middle draws ${m.rowCount} row(s) in `
          + `${m.portrait ? 'portrait' : 'landscape'}, want ${wantRows}`);
      const floor = Math.min(24, Math.round(m.cw * 0.45));
      for (const row of m.rowStats) {
        if (row.n > 1 && row.minStep < floor)
          bad.push(`${at}, a table row steps ${row.minStep}px between cards, want ${floor}`);
        if (row.spillRight > 1 || row.spillLeft > 1)
          bad.push(`${at}, a table row spills ${row.spillRight || row.spillLeft}px past its own box`);
        const starved = (row.reach || []).findIndex(g => g < floor);
        if (starved >= 0)
          bad.push(`${at}, table card ${starved} is ${row.reach[starved]}px wide to a thumb, want ${floor}`);
      }
    }

    // And the dossier's reservation, which is also a measured height and so is
    // also a width question. It is asserted once, at whatever size that pass
    // loads — and `reserveDossier` is called from the resize listener for
    // exactly this reason, with nothing watching that it still is. Same shape
    // as the defect this whole pass was written for.
    // A reload, because the page boots onto the start sheet and this pass has
    // been at the table since its first line. The reservation is then taken at
    // `from` and read at 320.
    await page.reload();
    await page.addStyleTag({ content: STILL });
    await page.setViewportSize({ width: from[0], height: from[1] });
    await page.waitForTimeout(60);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.waitForTimeout(80);
    bad.push(...await page.evaluate(() => {
      const out = [];
      if (document.getElementById('viewStart').hidden)
        return ['the start sheet was not on show, so the dossier was never measured'];
      const dossier = document.querySelector('#dossier');
      const where = () => Math.round(document.querySelector('#decks').getBoundingClientRect().top);
      const was = where();
      const said = dossier.textContent;
      dossier.textContent = '';
      const empty = where();
      dossier.textContent = said;
      if (Math.abs(empty - was) > 1)
        out.push(`after turning, the dossier does not hold its height: emptying it `
          + `moved the deck row by ${Math.abs(empty - was)}px`);
      return out;
    }));

    // And the say line, which picks its rung by measuring: raised at one width,
    // read at another.
    await page.reload();
    await page.addStyleTag({ content: STILL });
    await page.click('#play');
    await page.evaluate(d => applyDeck(d), deck);
    await page.setViewportSize({ width: from[0], height: from[1] });
    await page.evaluate(poseWidestSay);
    await page.waitForTimeout(40);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.waitForTimeout(80);
    bad.push(...await page.evaluate(() => {
      const out = [];
      const el = document.querySelector('.sel-name');
      // The rail. Without it this half passes by rendering nothing: the
      // opponent's first play is scheduled for state.speed and `tapped` refuses
      // while the table sweeps, so a slow run would measure an empty line and
      // say `pass`.
      if (!document.querySelector('.hand--you .card[aria-pressed="true"]'))
        out.push('nothing was raised, so the say line after turning was never measured');
      if (el.hidden) return out;
      const r = el.getBoundingClientRect();
      const box = document.querySelector('.say').getBoundingClientRect();
      if (r.height > parseFloat(getComputedStyle(el).lineHeight) + 1)
        out.push(`after turning, the say line wraps to ${Math.round(r.height)}px `
          + `in a ${Math.round(box.height)}px box: "${el.textContent}"`);
      if (r.left < box.left - 1 || r.right > box.right + 1)
        out.push(`after turning, the say line is ${Math.round(r.width)}px in a ${Math.round(box.width)}px box`);
      return out;
    }));

    const all = [...bad, ...errs];
    if (all.length) {
      failed++;
      console.log(`  FAIL  ${from.join('x')} turned to ${to.join('x')} / ${deck}`);
      all.forEach(b => console.log(`        ${b}`));
    }
    await page.close();
  }
  console.log(`  ${failed ? failed + ' case(s) failed' : 'pass'}  `
    + `${TURNS.length} shapes turned over and back`);
  return failed;
}

/* ---- pass 2e: the rules ----------------------------------------------------- */

// The one screen on this page that is read rather than glanced at, and the one
// that has to come back to where it was opened from: a back button that always
// goes to the start sheet abandons the deal of anyone who opened the rules to
// check what a scopa is worth mid-hand.
async function checkRules(browser) {
  console.log('\nthe rules');
  let failed = 0;
  for (const vname of (QUICK ? ['narrow phone'] : SCREEN_VIEWPORTS)) {
    const [, w, h] = VIEWPORTS.find(v => v[0] === vname);
    const page = await openPage(browser, { width: w, height: h });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !noisy(m)) errs.push(m.text()); });
    await page.goto(URL_);
    await page.addStyleTag({ content: STILL });
    const bad = [];

    // Both languages, and enough of each to be the rules rather than a note.
    await page.click('#aboutStart');
    bad.push(...await page.evaluate(() => {
      const out = [];
      // By SECTION, because that is where the language lives: a half of this
      // page that is not marked as its language is a half screen readers and
      // hyphenation read as the other one.
      const text = lang => {
        const sec = document.querySelector(`#viewRules section[lang="${lang}"]`);
        return sec ? [...sec.querySelectorAll('p, h2')]
          .map(e => e.textContent.replace(/\s+/g, ' ').trim()) : [];
      };
      for (const lang of ['it', 'en']) {
        const blocks = text(lang);
        const words = blocks.join(' ').split(' ').filter(Boolean).length;
        if (blocks.length < 5)
          out.push(`the rules have ${blocks.length} block(s) in ${lang}, want at least 5`);
        if (words < 200)
          out.push(`the rules run to ${words} words in ${lang}, which is a note and not the rules`);
        // The five points and the one that is easiest to leave out.
        for (const must of ['scopa', 'primiera', 'settebello'])
          if (!blocks.join(' ').toLowerCase().includes(must))
            out.push(`the rules in ${lang} never mention the ${must}`);
      }
      // The two apps, linked from each half: the Android one and, since 1.0.1,
      // the Windows one (DESKTOP.md). Both links go to the same releases page,
      // so each is told apart by its text. `Windows` is the same word in both
      // languages, so each half is also asked for a phrase only its own
      // language has; a sentence pasted untranslated into the other half
      // answers the first question and not the second. Tressette's check, whose
      // own page had the Android link and no assertion for it either.
      const computer = { it: /sul computer/, en: /\ba computer\b/ };
      for (const lang of ['it', 'en']) {
        const sec = document.querySelector(`#viewRules section[lang="${lang}"]`);
        if (!sec) continue;   // the language checks above already said so
        const links = [...sec.querySelectorAll('a[href]')].filter(a =>
          a.getAttribute('href').startsWith('https://github.com/diegoami/scopetta-releases'));
        for (const app of ['Android', 'Windows'])
          if (!links.some(a => a.textContent.includes(app)))
            out.push(`the rules in ${lang} do not link to the ${app} app`);
        if (!computer[lang].test(sec.textContent.replace(/\s+/g, ' ')))
          out.push(`the rules in ${lang} do not say the Windows app is for a computer, in ${lang}`);
      }
      return out;
    }));

    // Back to the start sheet, because that is where it was opened from.
    await page.click('#rulesBack');
    if (await page.evaluate(() => document.getElementById('viewStart').hidden))
      bad.push('the rules were opened from the start sheet and did not go back to it');

    // And back to the TABLE when that is where it was opened from, with the
    // deal still there.
    //
    // The deal has to be PUT IN MOTION and the rules left open long enough for
    // it to move, or "reading the rules changed the hand" cannot go red: the
    // first version of this clicked in and straight back out, no timer ever
    // fired, and the assertion passed a page where the opponent answered, the
    // capture swept and both were gone before the player pressed Back. A card
    // is played, the rules are opened on the beat that follows, and the wait is
    // longer than the whole of a capture at this speed.
    await page.click('#play');
    const before = await page.evaluate(() => {
      // A card is played so that the table is IN MOTION when the rules open —
      // the opponent's answer is on the clock. Without that there is no timer
      // to hold, and the assertion below passes a page that would have played
      // the whole exchange behind the screen. The first version of this row
      // clicked in and straight back out and could not go red at all.
      state.speed = 300;
      tapped(0);
      if (state.selected !== null) tapped(0);   // a capture with a choice raises first
      return { plays: state.plays, tavola: state.tavola.length };
    });
    await page.click('#about');
    if (await page.evaluate(() => document.getElementById('viewRules').hidden))
      bad.push('the rules did not open from the table');
    // Longer than a whole capture at this speed — LANDS + SWEEP + NEXT is 1.9 x
    // speed — so a table that has not been stopped will have moved.
    await page.waitForTimeout(1500);
    await page.click('#rulesBack');
    bad.push(...await page.evaluate(was => {
      const out = [];
      if (document.getElementById('viewTable').hidden)
        out.push('the rules were opened from the table and went back to the start sheet');
      // The deal is where it was left. Not the hand: gioca takes the played
      // card out of it synchronously, so a hand is unchanged by a deal running
      // on behind the screen, and an assertion on it says nothing.
      if (state.plays !== was.plays)
        out.push(`the deal played on behind the rules: ${was.plays} plays became ${state.plays}`);
      if (state.tavola.length !== was.tavola)
        out.push(`the table changed behind the rules: ${was.tavola} cards became ${state.tavola.length}`);
      return out;
    }, before));

    const all = [...bad, ...errs];
    if (all.length) {
      failed++;
      console.log(`  FAIL  ${vname}`);
      all.forEach(b => console.log(`        ${b}`));
    }
    await page.close();
  }
  console.log(`  ${failed ? failed + ' case(s) failed' : 'pass'}  `
    + `${QUICK ? 1 : SCREEN_VIEWPORTS.length} viewports, both ways in`);
  return failed;
}

/* ---- pass 2ee: the plates in a fallback font ------------------------------- */

// The faces are local now, but `--font-label` still ends in `system-ui`, so the
// font a plate falls back to when its face does not load is not the same on two
// machines. `system-ui` is Segoe UI on Windows and DejaVu or Liberation Sans on
// a Linux runner, and the second is wider. So iteration 4 shipped a plate that
// fitted here and spilled 3px in CI at every 360x800 case in all five decks,
// with the local check green: the same shape as the iteration-3 defect that
// made webfont blocking necessary, one level down.
//
// A check whose answer depends on which fonts the machine happens to have is
// not a check. This one asks the question against a spread of real metrics
// instead: narrow, wide, and a monospace that is wider than either.
const LABEL_STACKS = [
  ['system-ui', 'system-ui, sans-serif'],
  ['Verdana',   'Verdana, Geneva, sans-serif'],
  ['Tahoma',    'Tahoma, Geneva, sans-serif'],
  ['Arial',     'Arial, Helvetica, sans-serif'],
  ['monospace', '"Courier New", monospace'],
];

// The phone shapes and the two short landscape ones, which is where --t-pick
// and --t-tiny sit on different floors and the plate is at its narrowest
// relative to the word it has to hold.
const FALLBACK_VIEWPORTS = ['narrow phone', 'Android small', 'iPhone 15',
                            'iPhone Pro Max', 'phone landscape', 'tiny window'];

// And the whole type scale, for the sheets. The plate is the only box on the
// TABLE with a fixed width that has to fit text — the say line measures itself
// and picks a rung, and the dossier's reservation is measured too — but the
// sheets are full of boxes that are sized by their content and bounded by
// something else: the names in a two-column chip grid, `Cambia avversario o
// mazzo` in a 320px-bounded button, a history row on auto tracks. Not one of
// them had ever been measured in a face this machine does not happen to have.
//
// Real families rather than a synthetic worst case: these exist on Windows and
// have genuinely different metrics, which is the point. A monospace display
// face would fail on a page that is not wrong.
const FALLBACK_FACES = [
  ['system',  'system-ui, sans-serif',        'system-ui, serif',        'system-ui, sans-serif'],
  ['Verdana', 'Verdana, Geneva, sans-serif',  'Georgia, serif',          'Verdana, Geneva, sans-serif'],
  ['Tahoma',  'Tahoma, Geneva, sans-serif',   '"Times New Roman", serif', 'Tahoma, Geneva, sans-serif'],
];

// The sheets, which is where the text is. The table is covered by the plate
// half of this pass, at more shapes.
const FALLBACK_SCREENS = [
  ['the start sheet', async p => {}],
  ['the settings', async p => { await p.click('#play'); await p.click('#btnSettings');
    await p.evaluate(`document.querySelector('#viewSettings details').open = true`); }],
  ['the history', async p => {
    await p.evaluate(`localStorage.setItem("scopetta.history", JSON.stringify([
      { t: Date.parse("2026-02-11"), o: "Graziano", d: "Romagnole", y: 2, a: 5 },
      { t: Date.parse("2026-02-10"), o: "Franco", d: "Trevisane", y: 4, a: 4 }
    ]))`);
    await p.reload();
    await p.click('#play'); await p.click('#btnHistory'); }],
  ['the result', async p => { await p.click('#play'); await p.evaluate(poseDraw); }],
  ['the confirm', async p => { await p.click('#play'); await p.click('#again'); }],
];

async function checkFallbackFonts(browser) {
  console.log('\nthe plates in a fallback font');
  let failed = 0;
  const list = QUICK ? ['Android small'] : FALLBACK_VIEWPORTS;
  const stacks = QUICK ? LABEL_STACKS.slice(0, 2) : LABEL_STACKS;
  for (const vname of list) {
    const [, w, h] = VIEWPORTS.find(v => v[0] === vname);
    for (const [label, stack] of stacks) {
      const page = await openPage(browser, { width: w, height: h });
      const errs = [];
      page.on('pageerror', e => errs.push(String(e)));
      page.on('console', m => { if (m.type() === 'error' && !noisy(m)) errs.push(m.text()); });
      await page.goto(URL_);
      await page.addStyleTag({ content: STILL });
      // The label face only. It is what the role and the mazziere tag are set
      // in, and the role is what sets the plate's minimum — §5 measured the
      // whole roster and `avversario` is longer than any name in it.
      await page.addStyleTag({ content: `:root{ --font-label: ${stack} !important; }` });
      await page.click('#play');
      await page.mouse.move(0, 0);
      // The longest name in §0's roster, as everywhere else that measures a
      // plate: only Franco exists until iteration 5.
      await page.evaluate(`(() => { state.opponent = "Graziano"; render(); })()`);
      await page.waitForTimeout(40);

      const m = await page.evaluate(measure);
      const bad = [...m.plateBad];
      for (const e of m.offScreen) bad.push(`${e} runs off the screen`);
      if (m.tableScroll > 1)
        bad.push(`the table needs ${m.tableScroll}px of scrolling`);
      if (m.youSeatBottom > m.viewportH + 1)
        bad.push(`your seat runs ${m.youSeatBottom - m.viewportH}px below the fold`);

      // And the say line, which is in the label face too, with a card raised on
      // the widest line it keeps. In the face the page ships, that line is 274px
      // of text and fits a 320px screen even in a box sized by its content — so
      // the break that takes the say line's width away, measured at −22..342 in
      // system-ui when it was written, went quiet once the condensed face
      // shipped, and passed everywhere the say line was asked. The rung the page
      // picks is read back from a rendered height, so a wider face is exactly
      // what it exists for, and a player sees that face while the webfont is
      // still on its way.
      await page.evaluate(poseWidestSay);
      await page.waitForTimeout(40);
      const raised = await page.evaluate(measure);
      if (!await page.evaluate(() => document.querySelector('.sel-name').textContent.trim()))
        bad.push('the say line is empty with a card raised, so the rule below was never asked');
      for (const e of raised.offScreen) bad.push(`with a card raised, ${e} runs off the screen`);

      const all = [...bad, ...errs];
      if (all.length) {
        failed++;
        console.log(`  FAIL  ${vname} / ${label}`);
        all.forEach(b => console.log(`        ${b}`));
      }
      await page.close();
    }
  }
  // And the sheets, in a whole type scale this machine does not have. The audit
  // is the right instrument here rather than `measure`: what can go wrong on a
  // sheet in a wider face is text past the screen edge, text clipped by a box
  // that cannot scroll, and a button that has stopped being thumb-sized — which
  // are rules it already carries, and which have only ever been asked in one
  // font.
  const shapes = QUICK ? ['narrow phone'] : ['narrow phone', 'Android small', 'tiny window'];
  const faces = QUICK ? FALLBACK_FACES.slice(0, 2) : FALLBACK_FACES;
  for (const vname of shapes) {
    const [, w, h] = VIEWPORTS.find(v => v[0] === vname);
    for (const [label, sans, serif, body] of faces) {
      for (const [sname, open] of FALLBACK_SCREENS) {
        const page = await openPage(browser, { width: w, height: h });
        const errs = [];
        page.on('pageerror', e => errs.push(String(e)));
        page.on('console', m => { if (m.type() === 'error' && !noisy(m)) errs.push(m.text()); });
        await page.goto(URL_);
        await page.addStyleTag({ content: STILL });
        await page.addStyleTag({ content: `:root{
          --font-label: ${sans} !important;
          --font-display: ${serif} !important;
          --font-body: ${body} !important; }` });
        await open(page);
        await page.waitForTimeout(60);
        const bad = await page.evaluate(audit);
        const all = [...bad, ...errs];
        if (all.length) {
          failed++;
          console.log(`  FAIL  ${sname} @ ${vname} / ${label}`);
          all.forEach(b => console.log(`        ${b}`));
        }
        await page.close();
      }
    }
  }

  console.log(`  ${failed ? failed + ' case(s) failed' : 'pass'}  `
    + `${list.length} viewports x ${stacks.length} label faces on the table, `
    + `${shapes.length} x ${faces.length} x ${FALLBACK_SCREENS.length} on the sheets`);
  return failed;
}

/* ---- pass 2f: the sheets, and the partita around the deal ------------------ */

// A position one play from the end, with the OPPONENT to play it. Everything
// else about it is a position the engine sits in: 37 cards accounted for, the
// dealer is whoever plays last, and the piles are built by excluding what is on
// the table and in the hand rather than by slicing 35 off the front.
//
// It exists for one row: the deal ending while the confirm is open. The confirm
// is a scrim rather than a screen, so `show` never runs and the table's clock
// is NOT held — which is deliberate, and which makes this reachable. A question
// about abandoning a deal in progress stops being a question when the deal ends
// while it is being asked, and its promise that nothing is written down has
// just stopped being true.
const poseOppPlaysLast = `(() => {
  state.tavola = [{s:2,n:2},{s:0,n:3}];
  state.hands[0] = [null, null, null];
  state.hands[1] = [{s:1,n:10}, null, null];
  state.deveGiocare = 1; state.over = false; state.speed = 200;
  state.plays = 35; state.ultimaPresa = 0; state.mazziere = 0;
  const out = state.tavola.concat(state.hands[1].filter(Boolean))
    .map(c => c.s * 11 + c.n);
  const rest = state.cards.filter(c => !out.includes(c.s * 11 + c.n));
  state.prese = [rest.slice(0, 18), rest.slice(18)];
  state.selected = null; state.scelta = 0;
  render();
  later(() => computerPlay(), 300);
})()`;

// The sheets are Tressette's, forked, and the three rules its iteration 4 paid
// for are forked with them rather than rediscovered: the reload icon deals
// again AT THE TABLE, the result closes whatever is in front of it, and the
// confirm never opens over a deal that is already recorded.
async function checkSheets(browser) {
  console.log('\nthe sheets, and the partita');
  let failed = 0;
  const list = QUICK ? ['Android small'] : SCREEN_VIEWPORTS;
  for (const vname of list) {
    const [, w, h] = VIEWPORTS.find(v => v[0] === vname);
    const page = await openPage(browser, { width: w, height: h });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !noisy(m)) errs.push(m.text()); });
    await page.goto(URL_);
    await page.addStyleTag({ content: STILL });
    const bad = [];

    // The start sheet's own tools, which it did not have: the settings and the
    // history were reachable only from the table, so changing the deck or
    // reading the record meant dealing a hand first and abandoning it. This
    // drives the two buttons rather than counting them — a bar whose buttons
    // open nothing looks identical to a working one — and presses Back after
    // each, because a sheet opened before the deal has to return HERE, not to a
    // table that does not exist yet.
    bad.push(...await page.evaluate(() => {
      const out = [];
      const shown = () => [...document.querySelectorAll('.view')]
        .filter(v => !v.hidden).map(v => v.id).join(',');
      // The bar needs a grid row of its own. Given one, the sheet starts where
      // the bar ends; given none, the bar takes the 1fr row and leaves a band
      // of bare rail under it, which is not an overflow and clips nothing.
      // Both ways: that band is what a tall window shows, and a phone shows
      // the opposite. Where the sheet's content fills the screen the 1fr row
      // comes to 0px, the bar overflows it, and the sheet starts at the top of
      // the screen UNDER the bar — 48px of it at 320x568, 24px at 360x800.
      // Asked only for a band, the rule read that as a negative gap and
      // passed, and the quick run renders only the phone.
      const bar = document.querySelector('#viewStart .topbar');
      const body = document.querySelector('#viewStart .sheet-body');
      if (!bar) out.push('the start sheet has no icon bar');
      else if (body) {
        const gap = Math.round(body.getBoundingClientRect().top - bar.getBoundingClientRect().bottom);
        if (gap > 1) out.push(`${gap}px of nothing between the icon bar and the start sheet`);
        if (gap < -1) out.push(`${-gap}px of overlap between the icon bar and the start sheet`);
      }
      for (const [nav, view] of [['history', 'viewHistory'], ['settings', 'viewSettings']]) {
        const tool = document.querySelector(`#viewStart [data-nav="${nav}"]`);
        if (!tool){ out.push(`the start sheet has no ${nav} tool`); continue; }
        const r = tool.getBoundingClientRect();
        if (Math.min(r.width, r.height) < 32)
          out.push(`the start sheet's ${nav} tool is ${Math.round(r.width)}x${Math.round(r.height)}, want 32`);
        tool.click();
        if (shown() !== view){ out.push(`the start sheet's ${nav} tool opened ${shown() || 'nothing'}`); continue; }
        const back = document.querySelector(`#${view} [data-back]`);
        if (!back){ out.push(`${view} has no Back button`); continue; }
        back.click();
        if (shown() !== 'viewStart')
          out.push(`Back from ${nav}, opened before a deal, landed on ${shown() || 'nothing'}`);
      }
      return out;
    }));

    // This pass DRIVES more of the page than any other, and driving can throw:
    // a button that should be there and is not, a scrim that should have closed
    // and has not, and Playwright waits for it and then gives up. That is
    // usually a defect the loop has already recorded, so it has to survive to
    // be printed — an exception here took the whole check's output with it and
    // the mutation harness saw eight failures with nothing in them. checkDeal
    // has carried this guard since iteration 3; this pass needed it too.
    //
    // And a shorter deadline than Playwright's thirty seconds, because on a
    // broken page several of these wait it out in series. Nothing on a correct
    // page waits at all.
    page.setDefaultTimeout(8000);
    try {

    /* --- the start sheet ---------------------------------------------------- */
    // Every name the engine's roster holds has a chip, and the chosen one says
    // so. The roster is one name until iteration 5 measures the corners; asking
    // the page against `rollProfiles` rather than against a list written here
    // is what makes this row grow with it instead of going stale.
    bad.push(...await page.evaluate(() => {
      const out = [];
      const names = Object.keys(PROFILES);
      const chips = [...document.querySelectorAll('#opponents .chip')].map(c => c.dataset.name);
      if (JSON.stringify(chips) !== JSON.stringify(names))
        out.push(`the start sheet offers ${JSON.stringify(chips)}, the roster is ${JSON.stringify(names)}`);
      const pressed = [...document.querySelectorAll('#opponents .chip')]
        .filter(c => c.getAttribute('aria-pressed') === 'true').map(c => c.dataset.name);
      if (JSON.stringify(pressed) !== JSON.stringify([state.opponent]))
        out.push(`${JSON.stringify(pressed)} chips are pressed, the opponent is ${state.opponent}`);
      if (!document.querySelector('#dossier').textContent.trim())
        out.push('the chosen opponent has no dossier');
      // And the line that says how the last one went, which is the only thing
      // on this sheet that is about a smazzata rather than about the next one.
      // With nothing behind it, it must be out of the way rather than blank.
      const last = document.getElementById('lastResult');
      if (!last.hidden)
        out.push(`the start sheet says "${last.textContent}" with an empty history`);
      // And with one behind it, it is SHOWN and it says what happened. The
      // screen row that renders this state runs `audit()` and nothing else, and
      // `audit` skips anything invisible — so a regression that left the line
      // hidden would have rendered an empty start sheet and reported `pass`,
      // and the verb, the score and the name were unasserted besides: "hai
      // vinto 5-3 contro Graziano" could have read "hai perso 3-5 contro
      // Franco" with everything green.
      localStorage.setItem('scopetta.history', JSON.stringify(
        [{ t: Date.parse('2026-02-11'), o: 'Graziano', d: 'Romagnole', y: 5, a: 3 }]));
      renderLastResult();
      if (last.hidden)
        out.push('the start sheet says nothing about the smazzata behind it');
      else {
        const want = 'Ultima smazzata: hai vinto 5–3 contro Graziano';
        if (last.textContent !== want)
          out.push(`the start sheet reads "${last.textContent}", want "${want}"`);
      }
      localStorage.removeItem('scopetta.history');
      renderLastResult();
      // And the restore happened. If `removeItem` ever failed quietly the line
      // would stay up and the failure would surface two hundred lines later as
      // "an abandoned smazzata was recorded", pointing at the abandon logic —
      // a pass that drives the page has to leave it as it found it, and saying
      // so here is what stops the misattribution.
      if (!last.hidden)
        out.push('the start-sheet row left its own smazzata behind');
      const decks = [...document.querySelectorAll('#decks .deck-opt')].map(d => d.dataset.deck);
      const want = Object.keys(SHEET);
      if (JSON.stringify(decks) !== JSON.stringify(want))
        out.push(`the deck row offers ${JSON.stringify(decks)}, the deck table is ${JSON.stringify(want)}`);
      if (document.querySelector('#deckName').textContent !== state.deck)
        out.push(`the deck row names ${document.querySelector('#deckName').textContent}, `
          + `the deck is ${state.deck}`);
      return out;
    }));

    // The deck row must not move under the thumb when the opponent changes.
    // Tressette held four lines open for a dossier because three of its four
    // ran to four lines on a phone; the number is a guess and the measurement
    // is not, so the row is measured rather than the reservation trusted.
    bad.push(...await page.evaluate(() => {
      const out = [];
      const dossier = document.querySelector('#dossier');
      const where = () => Math.round(document.querySelector('#decks').getBoundingClientRect().top);
      const was = where();

      // Every name in the roster, which is the real thing: choosing one must
      // not move the row under a thumb already on its way to it.
      for (const chip of document.querySelectorAll('#opponents .chip')){
        chip.click();
        if (Math.abs(where() - was) > 1)
          out.push(`choosing ${chip.dataset.name} moved the deck row by `
            + `${Math.abs(where() - was)}px — it is under the player's thumb`);
      }

      // And the reservation itself, because the loop above cannot see it while
      // the roster is ONE name: clicking the only chip re-renders the same
      // sentence, nothing moves, and the break that takes `min-height` off the
      // dossier survived the whole check. What holds the row still is the space
      // held open for a dossier that is not there, so that is what is measured
      // — emptied and put back, which is the shortest and longest this box can
      // ever be. It stops being a proxy the moment iteration 5 brings the other
      // names, and it is right in the meantime.
      const said = dossier.textContent;
      dossier.textContent = '';
      const empty = where();
      dossier.textContent = said;
      if (Math.abs(empty - was) > 1)
        out.push(`the dossier does not hold its height: emptying it moved the deck row `
          + `by ${Math.abs(empty - was)}px`);
      return out;
    }));

    // A deck chosen on the start sheet is the deck the table deals with, and
    // the settings sheet agrees with it. Two controls choose a deck and neither
    // is the source of truth.
    await page.click('#decks .deck-opt[data-deck="Romagnole"]');
    await page.click('#play');
    bad.push(...await page.evaluate(() => {
      const out = [];
      if (state.deck !== 'Romagnole') out.push(`the deck row chose Romagnole, the state says ${state.deck}`);
      const sheet = getComputedStyle(document.documentElement).getPropertyValue('--sheet');
      if (!/romagnole/.test(sheet)) out.push(`the table is drawn from ${sheet.trim()}`);
      if (document.querySelector('#deckSel').value !== 'Romagnole')
        out.push(`the settings sheet still says ${document.querySelector('#deckSel').value}`);
      if (!state.dealt) out.push('Gioca did not deal');
      // And the row says so. Asserting this before anything has changed the
      // deck asks whether `Trevisane` equals `Trevisane` — which the markup
      // says on its own, so the break that stops the row being written at all
      // survived the whole check. The question only has content once the deck
      // is not the one the page was born with.
      if (document.querySelector('#deckName').textContent !== 'Romagnole')
        out.push(`the deck row names ${document.querySelector('#deckName').textContent} `
          + `after Romagnole was picked`);
      return out;
    }));

    /* --- the settings sheet ------------------------------------------------- */
    await page.click('#btnSettings');
    // Seven weights, which is what iteration 2's ladder left — and the values
    // the engine will actually play with, read off the profile rather than
    // written here.
    bad.push(...await page.evaluate(() => {
      const out = [];
      const rows = [...document.querySelectorAll('#weightsTable tbody tr')]
        .map(tr => [...tr.children].map(td => td.textContent));
      if (rows.length !== WEIGHT_KEYS.length)
        out.push(`the settings sheet discloses ${rows.length} weights, the engine has ${WEIGHT_KEYS.length}`);
      const P = PROFILES[state.opponent];
      WEIGHT_KEYS.forEach((k, i) => {
        if (!rows[i]) return;
        if (rows[i][0] !== k.toLowerCase().replace(/_/g, ' '))
          out.push(`weight ${i} is listed as "${rows[i][0]}", the engine's is ${k}`);
        if (rows[i][1] !== String(P[k]))
          out.push(`${k} is disclosed as ${rows[i][1]}, ${state.opponent} plays with ${P[k]}`);
      });
      return out;
    }));

    // Each control moves the state, and the state survives a reload. Storage is
    // the only thing on this page that outlives the tab, and what comes out of
    // it is not necessarily what this build wrote.
    await page.click('#pointsSel');
    await page.click('#soundSel');
    await page.evaluate(`(() => {
      el.speedSel.value = 1400; el.speedSel.dispatchEvent(new Event("input"));
      el.feltSel.value = "#402a52"; el.feltSel.dispatchEvent(new Event("input"));
      el.deckSel.value = "Francesi"; el.deckSel.dispatchEvent(new Event("change"));
    })()`);
    bad.push(...await page.evaluate(() => {
      const out = [];
      if (state.showPoints !== false) out.push('show-points did not turn off');
      if (state.sound !== false) out.push('sound did not turn off');
      if (state.speed !== 800) out.push(`the rhythm slider set speed to ${state.speed}, want 800`);
      if (state.felt !== '#402a52') out.push(`the felt is ${state.felt}`);
      const felt = getComputedStyle(document.documentElement).getPropertyValue('--felt').trim();
      if (felt !== '#402a52') out.push(`--felt is ${felt}, the setting says ${state.felt}`);
      return out;
    }));

    // And the boxes it turns off are gone, measured AT THE TABLE. Measuring
    // them from the settings sheet is measuring a screen that is not on: every
    // `.points` box has zero height while `#viewTable` is hidden, whatever
    // show-points says, so the break written for this survived the whole check.
    // An assertion has to look at the screen its subject is on.
    //
    // And nothing the CARD BUDGET pays for may move when it is toggled. That is
    // the whole argument for putting these counters in the column opposite the
    // plate rather than on it — `--seat-extra` was already buying two plate
    // widths and only one had a plate in it — and it was the one property
    // nothing measured. (The plate itself DOES move, by 71.5px, in portrait:
    // the seat is a centred flex row there, so losing one of its two items
    // re-centres the other. That is a visible jolt when a setting is changed
    // and it is not the budget. §3.6 says so — which it did not when this
    // comment first claimed it did, and that disagreement between a comment
    // and the plan is the thing §7.5 exists to stop.)
    await page.click('#viewSettings [data-back]');
    await page.evaluate(`(() => { el.pointsSel.checked = true;
      el.pointsSel.dispatchEvent(new Event("change")); })()`);
    // Four rects, and deliberately NOT `--cw`: `getPropertyValue` on a custom
    // property returns the unresolved token stream — the whole
    // `clamp(min(min(calc(100dvh - …))))` chain as a string — so comparing it
    // across a toggle compares a line of the stylesheet with itself and can
    // never differ. It read as though the budget itself were under test. The
    // card's own box is the budget, resolved, and it is the first of these.
    //
    // These are BOXES, and a box can hold still while its contents move — which
    // is exactly how the 71.5px plate shift hid inside an unchanged `youSeat`.
    // The opponent's cards and the deck are not among them, so a regression that
    // moved those within an unchanged seat would pass here; the symmetric one on
    // your side would not, because `.hand--you .card` is in the list.
    const withPoints = await page.evaluate(() => {
      const R = s => { const e = document.querySelector(s); const r = e.getBoundingClientRect();
                       return [Math.round(r.left * 10) / 10, Math.round(r.top * 10) / 10,
                               Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10]; };
      return { card: R('.hand--you .card'), tavola: R('.tavola'),
               oppSeat: R('.seat--opp'), youSeat: R('.seat--you') };
    });
    await page.evaluate(`(() => { el.pointsSel.checked = false;
      el.pointsSel.dispatchEvent(new Event("change")); })()`);
    bad.push(...await page.evaluate(was => {
      const out = [];
      if (document.getElementById('viewTable').hidden)
        return ['Back from the settings did not return to the table'];
      const shown = [...document.querySelectorAll('.points')]
        .filter(b => b.getBoundingClientRect().height > 0).length;
      if (shown) out.push(`${shown} points box(es) still drawn with show-points off`);
      const R = s => { const e = document.querySelector(s); const r = e.getBoundingClientRect();
                       return [Math.round(r.left * 10) / 10, Math.round(r.top * 10) / 10,
                               Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10]; };
      const now = { card: R('.hand--you .card'), tavola: R('.tavola'),
                    oppSeat: R('.seat--opp'), youSeat: R('.seat--you') };
      // Within a pixel, not to the tenth of one. Flex and grid round their
      // tracks, and at 500x425 the hand card lands on 197.4 with the counters
      // and 197.0 without — which is the layout rounding differently, not the
      // budget changing. The defect this rule is for moves things by a plate
      // width or a card row, so a pixel of tolerance costs it nothing and a
      // tenth of one makes it cry wolf.
      const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 1);
      for (const k of Object.keys(was)) {
        if (!near(now[k], was[k]))
          out.push(`show-points moved ${k}: ${JSON.stringify(was[k])} became `
            + `${JSON.stringify(now[k])} — it stands in a column the budget already paid for`);
      }
      return out;
    }, withPoints));
    await page.click('#btnSettings');
    await page.reload();
    await page.addStyleTag({ content: STILL });
    bad.push(...await page.evaluate(() => {
      const out = [];
      if (state.showPoints !== false || state.sound !== false || state.speed !== 800
          || state.felt !== '#402a52' || state.deck !== 'Francesi')
        out.push(`the settings did not survive a reload: ${JSON.stringify({
          showPoints: state.showPoints, sound: state.sound, speed: state.speed,
          felt: state.felt, deck: state.deck })}`);
      // And the controls agree with what was restored, or the sheet says one
      // thing while the game does another.
      if (document.querySelector('#pointsSel').checked !== state.showPoints)
        out.push('the show-points control disagrees with the setting after a reload');
      if (document.querySelector('#deckSel').value !== state.deck)
        out.push('the deck control disagrees with the setting after a reload');
      return out;
    }));
    // Put show-points back for the rows below, which measure a table.
    await page.evaluate(`(() => { el.pointsSel.checked = true;
      el.pointsSel.dispatchEvent(new Event("change")); })()`);

    /* --- back, from each door ----------------------------------------------- */
    // Every sheet is entered from the table here, so every Back returns to it —
    // with the deal still on. `show` holds the table's clock on the way out for
    // every screen rather than for the one that had a button first, and
    // iteration 4 is exactly the iteration that adds the other three.
    await page.click('#play');
    for (const [icon, view] of [['#btnSettings', '#viewSettings'],
                                ['#btnHistory', '#viewHistory'],
                                ['#about', '#viewRules']]) {
      await page.click(icon);
      if (await page.evaluate(v => document.querySelector(v).hidden, view))
        bad.push(`${icon} did not open ${view}`);
      await page.click(view === '#viewRules' ? '#rulesBack' : `${view} [data-back]`);
      if (await page.evaluate(() => document.getElementById('viewTable').hidden))
        bad.push(`Back from ${view} did not return to the table`);
    }

    /* --- the keys that are supposed to work --------------------------------- */
    // Only their SUPPRESSION under a dialog was asserted. `1`-`3` playing a
    // card, Space cycling the proposal, Enter confirming it and Escape putting
    // it back are four documented promises — §3.6's key list, and both halves
    // of the rules screen — with no row between them. A handler that stopped
    // playing cards entirely would have been caught by nothing.
    await page.evaluate(`(() => {
      epoch++; clearTimeout(timer); pending = null;
      state.tavola = [{s:1,n:7},{s:0,n:7},{s:2,n:4},{s:3,n:3}];
      state.hands[0] = [{s:2,n:7}, {s:3,n:10}, {s:1,n:2}];
      state.deveGiocare = 0; state.over = false;
      state.selected = null; state.scelta = 0; render();
    })()`);
    await page.keyboard.press('1');            // two sevens down: raises
    bad.push(...await page.evaluate(() => {
      const out = [];
      if (state.selected !== 0) out.push('`1` did not raise a card that has a capture to choose');
      return out;
    }));
    const firstChoice = await page.evaluate(() => JSON.stringify(propostaCorrente()));
    await page.keyboard.press(' ');
    bad.push(...await page.evaluate(was => {
      const out = [];
      if (JSON.stringify(propostaCorrente()) === was)
        out.push(`Space did not cycle the proposal: still ${was}`);
      return out;
    }, firstChoice));
    await page.keyboard.press('Escape');
    bad.push(...await page.evaluate(() => {
      const out = [];
      if (state.selected !== null) out.push('Escape did not put the raised card back');
      return out;
    }));
    const beforeKeys = await page.evaluate(() => state.plays);
    await page.keyboard.press('1');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(40);
    bad.push(...await page.evaluate(was => {
      const out = [];
      if (state.plays !== was + 1)
        out.push(`Enter did not play the raised card: ${was} plays became ${state.plays}`);
      return out;
    }, beforeKeys));

    // The card Enter just played took the sevens, and a capture is swept a beat
    // later. Freezing the clock below while that sweep is still running
    // cancels the timer that ends it, so `sweeping` stays set and the hand
    // stays dead for the rest of this pass — every key the dialog block below
    // presses was refused by `tapped` on a healthy page as much as on a broken
    // one. Let the page finish drawing the play; do not put its flag back by
    // hand.
    await page.waitForFunction(() => !sweeping && !beat, null, { timeout: 5000 }).catch(() => {});

    // And Escape backs out of a sheet, which is the other promise the rules
    // screen makes about it. Nothing pressed Escape anywhere in this check.
    await page.evaluate(`(() => { epoch++; clearTimeout(timer); pending = null; render(); })()`);
    await page.click('#btnSettings');
    await page.keyboard.press('Escape');
    bad.push(...await page.evaluate(() => {
      const out = [];
      if (document.getElementById('viewSettings').hidden === false)
        out.push('Escape did not back out of the settings sheet');
      if (document.getElementById('viewTable').hidden)
        out.push('Escape left the settings sheet and did not land on the table');
      return out;
    }));

    /* --- the card keys while a dialog is open ------------------------------- */
    // A dialog is over the table, not beside it. While one is open the card
    // keys are not the player's business — and Enter least of all, since it is
    // what you press to answer a dialog whose safe button already has focus,
    // and in Tressette it played the raised card on the way through. A misplay
    // costs the deal.
    //
    // The table is held still first, so that "a key played a card" is a
    // question about the keys rather than a race with the opponent's turn.
    //
    // And the hand is dealt again, because the block above played the card in
    // slot 1 and left it empty. `1` on an empty slot raises nothing and Enter
    // then has nothing to play, so on that hand this rule could not fail with
    // the guard deleted outright — its break survived every run from the
    // iteration that wrote both blocks. A key that reaches nothing proves
    // nothing, so the rail asks whether the hand would take a key at all: a
    // card in slot 1, and no play still being drawn.
    await page.evaluate(`(() => { epoch++; clearTimeout(timer); pending = null;
      state.tavola = [{s:1,n:7},{s:0,n:7},{s:2,n:4},{s:3,n:3}];
      state.hands[0] = [{s:2,n:7}, {s:3,n:10}, {s:1,n:2}];
      state.deveGiocare = 0; state.over = false;
      state.selected = null; state.scelta = 0; render(); })()`);
    await page.click('#again');
    const guarded = await page.evaluate(() => state.plays);
    if (!await page.evaluate(() => !!state.hands[0][0] && !sweeping && !beat))
      bad.push('the hand is not live under the confirm, so the rule below was never asked');
    await page.keyboard.press('1');
    await page.keyboard.press('Enter');
    bad.push(...await page.evaluate(was => {
      const out = [];
      if (state.plays !== was)
        out.push(`a key played a card through the confirm: ${was} plays became ${state.plays}`);
      return out;
    }, guarded));

    // And put the table back the way it was found. Enter answered the confirm
    // through its safe button, which is right — but on a page where THAT button
    // is broken the deal is already gone by the time the next block starts, and
    // the next block is the one that asks whether the safe button throws the
    // deal away. It reported the damage this block did, on the wrong assertion.
    // Tressette's rule, one iteration later: a pass that drives the page has to
    // leave it as it found it.
    //
    // Frozen again for the same reason as above — the block below snapshots
    // `state.plays` and compares it two clicks later.
    await page.evaluate(`(() => {
      closeConfirm(); newDealHere();
      epoch++; clearTimeout(timer); pending = null;
      state.deveGiocare = 0; render();
    })()`);

    /* --- abandoning --------------------------------------------------------- */
    // The reload icon over a deal in progress asks first, and "Continua a
    // giocare" leaves the deal exactly where it was.
    const before = await page.evaluate(() => ({ plays: state.plays, cards: state.cards.length }));
    await page.click('#again');
    if (await page.evaluate(() => document.getElementById('confirmScrim').hidden))
      bad.push('the reload icon threw the deal away without asking');
    await page.click('#confirmNo');
    bad.push(...await page.evaluate(was => {
      const out = [];
      if (!document.getElementById('confirmScrim').hidden)
        out.push('"Continua a giocare" did not close the confirm');
      if (!state.dealt || state.plays !== was.plays)
        out.push('"Continua a giocare" threw the deal away anyway');
      return out;
    }, before));

    // And "Abbandona" deals again AT THE TABLE. Tressette's discard went to the
    // start sheet and dealt the new hand behind it: a live deal you could not
    // see or play, with the opponent leading into it.
    await page.click('#again');
    await page.click('#confirmYes');
    await page.waitForTimeout(40);
    bad.push(...await page.evaluate(() => {
      const out = [];
      if (document.getElementById('viewTable').hidden)
        out.push('abandoning from the reload icon left the table');
      if (!state.dealt) out.push('abandoning from the reload icon did not deal again');
      if (state.plays !== 0 && state.plays !== 1)
        out.push(`the new smazzata starts at play ${state.plays}`);
      // And nothing was written down. A deal that is thrown away is not a
      // result, which is what the confirm promises in so many words.
      const list = JSON.parse(localStorage.getItem('scopetta.history') || '[]');
      if (list.length) out.push(`an abandoned smazzata was recorded: ${list.length} entries`);
      return out;
    }));

    // "Cambia avversario" leaves the table, so it asks too — and lands on the
    // start sheet rather than back where it was.
    await page.click('#btnSettings');
    await page.click('#changeOpponent');
    if (await page.evaluate(() => document.getElementById('confirmScrim').hidden))
      bad.push('changing opponent threw the deal away without asking');
    await page.click('#confirmYes');
    bad.push(...await page.evaluate(() => {
      const out = [];
      if (document.getElementById('viewStart').hidden)
        out.push('changing opponent did not land on the start sheet');
      if (state.dealt) out.push('changing opponent left the deal running behind the start sheet');
      return out;
    }));

    /* --- the deal ends while the confirm is open ---------------------------- */
    // The confirm is a scrim and not a screen, so the table's clock runs on
    // behind it. That is what makes this reachable, and it is the whole of
    // Tressette's "the result dialog closes whatever sheet is in front".
    await page.click('#play');
    await page.evaluate(poseOppPlaysLast);
    await page.click('#again');
    if (await page.evaluate(() => document.getElementById('confirmScrim').hidden))
      bad.push('the confirm did not open over the deal that was about to end');
    await page.waitForTimeout(1600);
    const ended = await page.evaluate(() => {
      const out = [];
      if (!document.getElementById('confirmScrim').hidden)
        out.push('the smazzata ended and the confirm was still asking whether to abandon it');
      if (document.getElementById('result').hidden)
        out.push('the smazzata ended behind the confirm and the points were never counted out');
      // "the result was drawn somewhere other than over the table it came from"
      // was here, for `show("table")` in `finish`. It cannot fail, and the
      // break written for it survived the whole check: `show` HOLDS the table's
      // clock on the way to any sheet, so a pending `finish` cannot run while a
      // sheet is up, and the only thing that can be in front of the table when
      // a deal ends is the confirm — which is a scrim over the table rather
      // than a screen instead of it. There is no state in this game where the
      // player is somewhere else when `finish` runs. An assertion that cannot
      // fire reads like cover and is not any, so it is gone; the call it
      // guarded stays, and break_ui.mjs records it as equivalent with this
      // reasoning rather than as a hole.
      const r = scoreDeal(state);
      const list = JSON.parse(localStorage.getItem('scopetta.history') || '[]');
      if (list.length !== 1)
        out.push(`${list.length} smazzate recorded, want 1`);
      else if (list[0].y !== r.punti[0] || list[0].a !== r.punti[1])
        out.push(`the history recorded ${list[0].y}–${list[0].a}, scoreDeal returned `
          + `${r.punti[0]}–${r.punti[1]}`);
      else if (list[0].o !== state.opponent || list[0].d !== state.deck)
        out.push(`the history recorded ${list[0].o}/${list[0].d}, the deal was `
          + `${state.opponent}/${state.deck}`);
      return out;
    });
    bad.push(...ended);

    // Once it is recorded there is nothing left to lose, so the confirm does
    // not open over it.
    await page.click('#again');
    bad.push(...await page.evaluate(() => {
      const out = [];
      if (!document.getElementById('confirmScrim').hidden)
        out.push('the confirm opened over a smazzata that is already recorded');
      if (!state.dealt || state.over)
        out.push('the reload icon did not deal again once the smazzata was over');
      return out;
    }));

    /* --- and it survives a reload icon pressed on the closing beats --------- */
    // `gioca` sets `over` on the 36th play and three beats of drawing follow
    // it. Through all three `state.over` is already true, so the reload icon
    // does NOT ask — there is nothing left to lose — and it cancels every timer
    // the table has pending. A smazzata written down behind one of those timers
    // is a smazzata the same click throws away, after it was played to the last
    // card.
    await page.evaluate(`localStorage.removeItem("scopetta.history")`);
    await page.evaluate(playLastLeftovers);
    await page.waitForTimeout(200);          // inside the landing beat
    await page.click('#again');
    await page.waitForTimeout(80);
    bad.push(...await page.evaluate(() => {
      const out = [];
      const list = JSON.parse(localStorage.getItem('scopetta.history') || '[]');
      if (list.length !== 1)
        out.push(`a smazzata played to the last card was lost when the next one was `
          + `dealt over its closing beats: ${list.length} in the history, want 1`);
      return out;
    }));

    /* --- and it shows up in the history ------------------------------------- */
    // A win, a loss and a draw put in beside the one that was just played, so
    // that the tally's four numbers are four DIFFERENT numbers. With one
    // smazzata in the history every count is 1 and every cell agrees with every
    // other by accident: the break that made the tally count wins where it says
    // smazzate survived the whole check.
    //
    // And under TWO names, for the same reason one step along: the record
    // against each opponent only renders when there is more than one to compare,
    // so seeding them all against Franco left that assertion guarded by a
    // condition the fixture never met — and the break for it survived too. Two
    // names, and the second one loses both of its, so a miscount shows.
    await page.evaluate(`(() => {
      const list = JSON.parse(localStorage.getItem("scopetta.history") || "[]");
      list.push({ t: Date.parse("2026-02-10"), o: "Franco", d: "Trevisane", y: 6, a: 1 },
                { t: Date.parse("2026-02-09"), o: "Graziano", d: "Trevisane", y: 1, a: 4 },
                { t: Date.parse("2026-02-08"), o: "Graziano", d: "Trevisane", y: 2, a: 2 });
      localStorage.setItem("scopetta.history", JSON.stringify(list));
    })()`);
    await page.click('#btnHistory');
    bad.push(...await page.evaluate(() => {
      const out = [];
      // The four cells, against the list they are counted from. They are four
      // different numbers now, so a cell wired to the wrong one says so.
      const list0 = JSON.parse(localStorage.getItem('scopetta.history') || '[]');
      const want = [list0.length,
                    list0.filter(m => m.y > m.a).length,
                    list0.filter(m => m.y < m.a).length,
                    list0.filter(m => m.y === m.a).length];
      const got = [...document.querySelectorAll('#historyBody .tally b')].map(b => Number(b.textContent));
      if (JSON.stringify(got) !== JSON.stringify(want))
        out.push(`the tally counts ${JSON.stringify(got)}, the history holds `
          + `${JSON.stringify(want)} (smazzate, vinte, perse, pari)`);
      const rows = [...document.querySelectorAll('#historyBody .log li')];
      const list = JSON.parse(localStorage.getItem('scopetta.history') || '[]');
      if (rows.length !== list.length)
        out.push(`the history sheet draws ${rows.length} rows for ${list.length} smazzate`);
      // EVERY row against its own entry, not just the newest. The newest one
      // is whatever the driven deal happened to produce, and it happened to be
      // a win — so the break that marks every row `V` survived the whole
      // check. The list underneath holds a win, a loss and a draw on purpose,
      // and all three letters have to appear on the right lines.
      rows.forEach((li, i) => {
        const m = list[i];
        if (!m) return;
        const said = li.querySelector('.score').textContent;
        const want = `${m.y}–${m.a}`;
        if (said !== want) out.push(`history row ${i} reads ${said}, the smazzata was ${want}`);
        const verdict = li.querySelector('.res').textContent;
        const wantV = m.y > m.a ? 'V' : m.y < m.a ? 'S' : 'P';
        if (verdict !== wantV)
          out.push(`history row ${i} is marked ${verdict}, want ${wantV} for ${want}`);
      });
      // And a row this build did not write is dropped rather than rendered: one
      // entry of another shape took Tressette's sheet down along with the
      // button that clears it, so there was no way out from inside the game.
      localStorage.setItem('scopetta.history', JSON.stringify(
        [null, 7, { o: 'Franco' }, ...list]));
      // In a try, because the defect this names is a THROW: `renderHistory`
      // read `m.y` off a null and took the sheet down along with the button
      // that clears it, and an exception here would take this whole evaluate —
      // and every line already in `out` — with it.
      try { renderHistory(); }
      catch (e){ out.push(`a row this build did not write took the history sheet down: ${e.message}`); }
      const after = [...document.querySelectorAll('#historyBody .log li')].length;
      if (after !== list.length)
        out.push(`${after} rows after three unreadable entries were added, want ${list.length}`);
      if (!document.querySelector('#historyBody .btn'))
        out.push('the history sheet lost the button that clears it');
      // And the record against each opponent, read back rather than merely
      // rendered. The tally's four cells were made discriminating this
      // iteration; these two numbers were not, and `clearHistory` was asserted
      // to EXIST and never pressed.
      const per = {};
      for (const m of list) { const r = per[m.o] || (per[m.o] = { n: 0, v: 0 });
                              r.n++; if (m.y > m.a) r.v++; }
      const names = Object.keys(per);
      const record = [...document.querySelectorAll('#historyBody .group .field')];
      // The rail. The block only renders when there is more than one name to
      // compare, so a fixture that seeds one leaves this guard unentered — and
      // an assertion that is never made looks exactly like one that passed.
      // That is how the break for it survived once already; saying so out loud
      // is what stops it happening again to whoever reseeds this list.
      if (names.length < 2)
        out.push(`the history holds ${names.length} opponent(s), so the record `
          + `against each of them was never rendered or read`);
      if (names.length > 1){
        if (record.length !== names.length)
          out.push(`the record shows ${record.length} opponents, the history holds ${names.length}`);
        for (const line of record){
          const who = line.firstElementChild.textContent;
          const said = line.querySelector('.score').textContent;
          const want = `${per[who].v}/${per[who].n}`;
          if (said !== want)
            out.push(`the record against ${who} reads ${said}, the history says ${want}`);
        }
      }
      return out;
    }));

    // The button that clears it, pressed. It is the one control on this sheet
    // that destroys something, and it had never been touched.
    await page.click('#historyBody .btn');
    bad.push(...await page.evaluate(() => {
      const out = [];
      const list = JSON.parse(localStorage.getItem('scopetta.history') || '[]');
      if (list.length) out.push(`clearing the history left ${list.length} smazzate in storage`);
      if (document.querySelectorAll('#historyBody .log li').length)
        out.push('clearing the history left rows on the sheet');
      if (!document.querySelector('#historyBody .empty'))
        out.push('the cleared history does not say it is empty');
      return out;
    }));

    // And it is capped. `localStorage` is a few megabytes and a smazzata is a
    // hundred bytes, so this is not about running out today — it is that a log
    // nothing ever prunes grows without a bound and the sheet draws every row
    // of it. A hundred is what §3.8 says, and the same hundred the other two
    // games keep.
    bad.push(...await page.evaluate(() => {
      const out = [];
      localStorage.setItem('scopetta.history', JSON.stringify(
        Array.from({ length: 130 }, (_, i) => (
          { t: Date.now() - i * 1000, o: 'Franco', d: 'Trevisane', y: 4, a: 3 }))));
      recordDeal(1, 2);
      const list = JSON.parse(localStorage.getItem('scopetta.history') || '[]');
      if (list.length !== 100)
        out.push(`the history holds ${list.length} smazzate, it is capped at 100`);
      // Newest first, and the new one is the new one.
      if (list.length && (list[0].y !== 1 || list[0].a !== 2))
        out.push(`the newest smazzata in the history reads ${list[0].y}–${list[0].a}, `
          + `the one just recorded was 1–2`);
      return out;
    }));

    /* --- what the result says, and the two ways on -------------------------- */
    // Both posed endings, because a driven deal ends wherever its seed ends and
    // this line picks between five components: one deal the scope decided and
    // one nobody won. NOTE_OK asserts the property the line claims rather than
    // comparing it with a string.
    // The scope-decided pose passes `true`: exactly one component decides that
    // deal, so the line has to name one and the property rule below it stops
    // being optional. The draw does not — its branch returns before naming
    // anything, which is the correct behaviour there.
    await page.click('#viewHistory [data-back]');
    for (const [pose, mustName] of [[poseScopeDecide, true], [poseDraw, false]]) {
      await page.evaluate(pose);
      await page.waitForTimeout(40);
      bad.push(...await page.evaluate(NOTE_OK(mustName)));
    }

    // Ancora deals again at the table, and does not ask: the smazzata is over
    // and there is nothing left to lose. Cambia leaves for the start sheet.
    await page.click('#resultAgain');
    await page.waitForTimeout(40);
    bad.push(...await page.evaluate(() => {
      const out = [];
      if (!document.getElementById('confirmScrim').hidden)
        out.push('"Ancora" asked whether to abandon a smazzata that was already over');
      if (document.getElementById('viewTable').hidden)
        out.push('"Ancora" left the table');
      if (!state.dealt || state.over) out.push('"Ancora" did not deal again');
      if (!document.getElementById('result').hidden)
        out.push('"Ancora" dealt again and the result is still over the table');
      return out;
    }));
    await page.evaluate(poseDraw);
    await page.click('#resultChange');
    bad.push(...await page.evaluate(() => {
      const out = [];
      if (document.getElementById('viewStart').hidden)
        out.push('"Cambia" did not land on the start sheet');
      if (state.dealt)
        out.push('"Cambia" left a deal running behind the start sheet');
      return out;
    }));

    /* --- the easter egg ----------------------------------------------------- */
    // 1-3 are the only card keys here, so the 6 and the 4 in the word fall
    // through to the buffer as they did in Discola. Tressette had to move it off
    // the table because every digit played a card.
    await page.click('#play');
    // The table held still while eleven keys are typed at it, so that "the word
    // played a card" is a question about the keys rather than a race with the
    // opponent's own turn. Bumping the epoch is what the page itself does when
    // a deal is abandoned, and it is the only thing that stops a pending play.
    await page.evaluate(`(() => { epoch++; clearTimeout(timer); pending = null;
      state.deveGiocare = 0; render(); })()`);
    await page.waitForTimeout(40);
    const dealtNow = await page.evaluate(() => state.plays);
    for (const k of '6winouj64ie') await page.keyboard.press(k);
    bad.push(...await page.evaluate(was => {
      const out = [];
      if (!state.cheat) out.push('typing the 1997 word did not turn the opponent’s hand face up');
      const faces = [...document.querySelectorAll('.hand--opp .card')]
        .filter(c => c.dataset.empty === 'false' && c.style.getPropertyValue('--col') !== '10').length;
      const held = state.hands[1].filter(Boolean).length;
      if (faces !== held)
        out.push(`${faces} of ${held} of the opponent’s cards are face up`);
      if (document.getElementById('cheatNote').hidden)
        out.push('the opponent’s hand is face up and nothing says so');
      if (state.plays !== was)
        out.push(`typing the word played ${state.plays - was} card(s)`);
      return out;
    }, dealtNow));

    } catch (e) {
      bad.push(`the sheets could not be driven to the end: `
        + `${String(e).split('\n')[0].slice(0, 110)}`);
    }

    const all = [...bad, ...errs];
    if (all.length) {
      failed++;
      console.log(`  FAIL  ${vname}`);
      all.forEach(b => console.log(`        ${b}`));
    }
    await page.close();
  }
  console.log(`  ${failed ? failed + ' case(s) failed' : 'pass'}  ${list.length} viewports`);
  return failed;
}

/* ---- pass 3: a whole deal, through the table ------------------------------- */

// The two passes above measure a table that has just been dealt. This is the
// only one that fails when the page and the engine come apart — and it reads
// the table as well as driving it, which is the whole of Tressette's issue #7:
// a pass that played twenty cards and never looked at the hand between them.
async function checkDeal(browser) {
  console.log('\na whole deal');
  const page = await openPage(browser, { width: 430, height: 932 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !noisy(m)) errs.push(m.text()); });
  await page.goto(URL_);
  await page.addStyleTag({ content: STILL });
  await page.click('#play');
  await page.mouse.move(0, 0);
  // A fixed deal, so a failure is reproducible — and **seed 16 rather than any
  // seed**, because §4's "Done when" needs a capture chosen by each path and an
  // ambiguous capture is not common: seed 7 played thirty-six cards without
  // offering one, and the assertion at the bottom said so.
  //
  // Searched for with a simulation of the driver below rather than guessed at,
  // and that mattered: a seed picked by a simpler simulation offered three
  // choices on paper and one in the page, because switching a proposal changes
  // which cards are captured and the deal diverges from there.
  //
  // `mazziere` is cleared first, and that is not a detail: newDeal ALTERNATES
  // the dealer from whatever the state already holds, and #play has already
  // dealt one. Seeding the rng alone therefore does not reproduce a cold start
  // — the dealer differs, so the lead differs, so the whole deal differs. The
  // seed searched for offline offered two capture choices and the page offered
  // none, and this was why.
  await page.evaluate(`(() => { epoch++; state.mazziere = null;
    newDeal(state, rngSeed(16)); state.speed = 1; render();
    if (state.deveGiocare === 1) computerPlay(); })()`);

  const bad = [];
  let plays = 0, chosenByTap = 0, chosenByAccept = 0, scopeSeen = 0;

  // Driving can throw — a slot that should hold a card and draws none is not
  // clickable, and Playwright waits for it and then gives up. That is a defect
  // the loop has already recorded, so it has to survive to be printed: an
  // exception here used to take the whole check's output with it and the
  // mutation harness saw a failure with nothing in it.
  try {
  for (let guard = 0; guard < 120 && plays < 36; guard++) {
    await page.waitForTimeout(25);
    const st = await page.evaluate(() => ({
      over: state.over, turn: state.deveGiocare, plays: state.plays, beat,
      sweeping: !!sweeping,
      tavola: state.tavola.length,
      domTavola: document.querySelectorAll('.tavola .card').length,
      badgeYou: document.querySelector('#countYou').textContent,
      badgeOpp: document.querySelector('#countOpp').textContent,
      badgeDeck: document.querySelector('#countMazzo').textContent,
      preseYou: state.prese[0].length, preseOpp: state.prese[1].length,
      deck: state.cards.length - state.next,
      scope: state.scope.slice(),
      marksYou: document.querySelectorAll('#scopeYou .scopa-mark').length,
      marksOpp: document.querySelectorAll('#scopeOpp .scopa-mark').length,
      hand: [...document.querySelectorAll('.hand--you .card')]
        .map(c => ({ empty: c.dataset.empty, disabled: c.disabled })),
      slots: state.hands[0].map(c => !!c),
      // What the show-points boxes say, against what the piles hold. The owner
      // plays off these counters, so they are read back after every play like
      // the badges are — and primiera above all, since it is the one number on
      // this table nobody can check by looking at the cards.
      shownPoints: [
        [...document.querySelectorAll('#pointsYou b')].map(b => b.textContent),
        [...document.querySelectorAll('#pointsOpp b')].map(b => b.textContent),
      ],
      wantPoints: [0, 1].map(w => {
        const pile = state.prese[w];
        const p = primieraTotale(pile);
        return [String(pile.length),
                String(pile.filter(c => c.s === DENARI).length),
                pile.some(isSettebello) ? 'sì' : '—',
                p === null || p === undefined ? '—' : String(p),
                String(state.scope[w])];
      }),
    }));

    // --- read the table, every play ---------------------------------------
    // Except mid-sweep, when the middle is deliberately still showing the
    // table the capture was made from — checkStates is where that is asserted.
    if (!st.sweeping && st.domTavola !== st.tavola)
      bad.push(`play ${st.plays}: the middle shows ${st.domTavola} cards, the engine holds ${st.tavola}`);
    if (st.badgeYou !== String(st.preseYou) || st.badgeOpp !== String(st.preseOpp))
      bad.push(`play ${st.plays}: badges say ${st.badgeYou}/${st.badgeOpp}, the piles hold ${st.preseYou}/${st.preseOpp}`);
    if (st.badgeDeck !== String(st.deck))
      bad.push(`play ${st.plays}: the deck badge says ${st.badgeDeck}, the deck holds ${st.deck}`);
    if (st.marksYou !== st.scope[0] || st.marksOpp !== st.scope[1])
      bad.push(`play ${st.plays}: ${st.marksYou}/${st.marksOpp} scopa marks, the engine counted ${st.scope[0]}/${st.scope[1]}`);
    for (const w of [0, 1]){
      const shown = st.shownPoints[w], want = st.wantPoints[w];
      if (JSON.stringify(shown.slice(0, 4)) !== JSON.stringify(want.slice(0, 4)))
        bad.push(`play ${st.plays}: ${w ? "their" : "your"} counters say `
          + `${JSON.stringify(shown.slice(0, 4))}, the pile holds `
          + `${JSON.stringify(want.slice(0, 4))} (carte, ori, settebello, primiera)`);
      // The fifth point, and the one the running score used to leave to the
      // marks on the pile. Kept as its own line so the break written for it can
      // name one assertion rather than sharing "counters say" with the four.
      if (shown[4] !== want[4])
        bad.push(`play ${st.plays}: ${w ? "their" : "your"} scope counter says `
          + `${shown[4]}, the engine counted ${st.scope[w]}`);
    }
    // Every card you hold is shown, and every slot you do not is empty —
    // except in the beat between rounds, which is the one moment the page draws
    // empty hands over a state that already holds the next three. checkStates
    // is where that is asserted; here it would be a race, because the beat is
    // half a millisecond long at this speed.
    if (!st.beat) st.hand.forEach((node, i) => {
      if (st.slots[i] && node.empty === 'true')
        bad.push(`play ${st.plays}: slot ${i} holds a card and shows none`);
      if (!st.slots[i] && node.empty === 'false')
        bad.push(`play ${st.plays}: slot ${i} is empty and shows a card`);
    });
    scopeSeen = Math.max(scopeSeen, st.scope[0] + st.scope[1]);

    if (st.over) break;
    if (st.beat || st.sweeping) continue;   // the table is busy; the hand is not tappable
    if (st.turn !== 0) continue;   // the opponent is thinking

    // --- drive it ----------------------------------------------------------
    // Prefer a card that offers a choice, so both paths through the capture
    // state are exercised in one deal. Playing whatever card came first met no
    // choice at all in thirty-six plays and the assertion below reported it —
    // which is the assertion working, and the driver not.
    const move = await page.evaluate(() => {
      let best = -1, bestN = -1;
      for (let i = 0; i < state.hands[0].length; i++){
        if (!state.hands[0][i]) continue;
        const n = prese(state.tavola, state.hands[0][i]).length;
        if (n > bestN){ bestN = n; best = i; }
      }
      return { slot: best, choices: bestN };
    });
    if (move.slot < 0) { await page.waitForTimeout(40); continue; }

    const card = await page.$(`.hand--you .card[data-slot="${move.slot}"]`);
    await card.click();

    if (move.choices > 1) {
      // A choice: the card is raised now. The first is taken by accepting the
      // proposal the table offers, the next by tapping a table card to switch
      // it — so both paths §3.7 describes are exercised in one deal, as §4's
      // "Done when" requires.
      if (chosenByAccept > chosenByTap) {
        const idx = await page.evaluate(() => {
          const opts = proposte();
          const other = opts.findIndex(s => JSON.stringify(s) !== JSON.stringify(propostaCorrente()));
          return other < 0 ? -1 : opts[other][0];
        });
        if (idx >= 0) {
          await page.click(`.tavola .card[data-index="${idx}"]`);
          chosenByTap++;
        }
      } else {
        chosenByAccept++;   // accept the proposal exactly as the table offers it
      }
      await page.click(`.hand--you .card[data-slot="${move.slot}"]`);
    }
    plays++;
  }
  } catch (e) {
    bad.push(`the deal could not be driven to the end: ${String(e).split('\n')[0].slice(0, 100)}`);
  }

  // `finish` runs a beat after the table has settled, and it is what writes the
  // smazzata down and puts the table back in front. Wait for it rather than
  // racing it — the loop above breaks on `over`, which `gioca` sets on the 36th
  // play, three beats earlier.
  await page.waitForFunction(
    '!document.getElementById("result").hidden'
    + ' && JSON.parse(localStorage.getItem("scopetta.history") || "[]").length > 0',
    null, { timeout: 8000 }).catch(() => {});

  const end = await page.evaluate(() => {
    const r = scoreDeal(state);
    const grid = document.getElementById('resultGrid');
    const val = sel => [...grid.querySelectorAll(sel)].map(n => n.querySelector('.r-val').textContent);
    // The points each column is awarded, read off the markers the player sees.
    const pts = who => [...grid.querySelectorAll('.r-num:not(.r-total)')]
      .filter((_, i) => i % 2 === who)
      .reduce((sum, n) => sum + (parseInt(n.querySelector('.r-pt').textContent.slice(1), 10) || 0), 0);
    return {
      over: state.over, plays: state.plays,
      domTavola: document.querySelectorAll('.tavola .card').length,
      tavola: state.tavola.length,
      piles: state.prese[0].length + state.prese[1].length,
      say: document.querySelector('.sel-name').textContent,
      sayShown: !document.querySelector('.sel-name').hidden,
      punti: r.punti,
      resultShown: !document.getElementById('result').hidden,
      title: document.getElementById('resultTitle').textContent,
      note: document.getElementById('resultNote').textContent,
      ways: [...document.querySelectorAll('#result .result__actions .btn')]
        .map(b => b.id),
      logged: JSON.parse(localStorage.getItem('scopetta.history') || '[]'),
      labels: [...grid.querySelectorAll('.r-label')].map(n => n.textContent),
      // carte, denari, settebello, primiera, scope, totale — six rows of two
      nums: val('.r-num'),
      marked: [pts(0), pts(1)],
      rule: (document.querySelector('.result__rule') || {}).textContent || '',
      carte: [String(state.prese[0].length), String(state.prese[1].length)],
      denari: [0, 1].map(w => String(state.prese[w].filter(c => c.s === DENARI).length)),
      // The one row whose number is not a count of anything the player can
      // see — and so the one most worth reading back. A missing suit is no
      // point at all, which the engine says with null and the page draws as a
      // dash rather than a zero.
      prim: [0, 1].map(w => {
        const p = primieraTotale(state.prese[w]);
        return p === null || p === undefined ? '—' : String(p);
      }),
      sette: [0, 1].map(w => String(state.prese[w].some(isSettebello) ? 1 : 0)),
      scope: state.scope.map(String),
    };
  });

  if (!end.over) bad.push(`the deal did not finish: ${end.plays} plays`);
  if (end.plays !== 36) bad.push(`${end.plays} plays, want 36`);
  // §3.7 row six: the table is empty in the DOM after the leftovers go.
  if (end.domTavola !== 0 || end.tavola !== 0)
    bad.push(`the table still shows ${end.domTavola} cards after the last play`);
  if (end.piles !== 40) bad.push(`${end.piles} cards in the piles, want 40`);
  // The say line is the capture line and nothing else. Iteration 3 put the
  // deal's score in it because there was nowhere else for it; iteration 4 has
  // the panel, and a second copy of the score is a second thing that can be
  // wrong. It was: the panel is held back while the last play is still being
  // drawn — that was a defect and it was fixed — and this line is not under the
  // panel until the panel goes up, so the score was read out over the last card
  // as it landed.
  if (end.sayShown || end.say)
    bad.push(`the say line still says "${end.say}" with the smazzata over — the score `
      + `is the result panel's, and a second copy of it is a second thing to be wrong about`);

  // The partita around the deal: the verdict, the line saying what decided it,
  // the two ways on, and the entry in the history.
  if (end.title !== (end.punti[0] > end.punti[1] ? 'Hai vinto'
                   : end.punti[0] < end.punti[1] ? 'Hai perso' : 'Pareggio'))
    bad.push(`the result says "${end.title}" on ${end.punti[0]}–${end.punti[1]}`);
  if (!end.note.trim())
    bad.push('the smazzata ended and nothing says what decided it');
  if (JSON.stringify(end.ways) !== JSON.stringify(['resultAgain', 'resultChange']))
    bad.push(`the result offers ${JSON.stringify(end.ways)}, want Ancora and Cambia`);
  if (end.logged.length !== 1)
    bad.push(`${end.logged.length} smazzate in the history after one deal, want 1`);
  else if (end.logged[0].y !== end.punti[0] || end.logged[0].a !== end.punti[1])
    bad.push(`the history recorded ${end.logged[0].y}–${end.logged[0].a}, scoreDeal `
      + `returned ${end.punti[0]}–${end.punti[1]}`);
  bad.push(...await page.evaluate(NOTE_OK()));

  // The breakdown, which is the only thing that says WHY the score is what it
  // is. A total with no working is a number the player has to take on trust.
  if (!end.resultShown) bad.push('the deal ended and the points were never counted out');
  const wantLabels = ['carte', 'denari', 'settebello', 'primiera', 'scope', 'totale'];
  if (JSON.stringify(end.labels) !== JSON.stringify(wantLabels))
    bad.push(`the breakdown lists ${JSON.stringify(end.labels)}, want ${JSON.stringify(wantLabels)}`);
  // The arithmetic is on the page rather than in the reader's head: the
  // markers down each column are what the total is made of, so they have to
  // add up to it.
  if (end.marked[0] !== end.punti[0] || end.marked[1] !== end.punti[1])
    bad.push(`the points marked on the rows add to ${end.marked[0]}/${end.marked[1]}, `
      + `the total says ${end.punti[0]}/${end.punti[1]}`);
  if (!/scopa/i.test(end.rule))
    bad.push(`the breakdown does not say what the total is made of: "${end.rule}"`);

  if (end.nums.length !== 12)
    bad.push(`the breakdown has ${end.nums.length} numbers, want 12 — six rows of two`);
  else {
    if (end.nums[0] !== end.carte[0] || end.nums[1] !== end.carte[1])
      bad.push(`the breakdown counts ${end.nums[0]}/${end.nums[1]} cards, the piles hold `
        + `${end.carte[0]}/${end.carte[1]}`);
    // Every one of the twelve, not the four that happened to be easy. Two of
    // them — denari and primiera — were read and never asserted, and a page
    // that showed the wrong player's denari count and the wrong player's
    // primiera total was green through all nine passes. The marker sum cannot
    // stand in for this: the markers come from scoreDeal too, so a wrong count
    // beside a right marker adds up perfectly.
    if (end.nums[2] !== end.denari[0] || end.nums[3] !== end.denari[1])
      bad.push(`the breakdown counts ${end.nums[2]}/${end.nums[3]} denari, the piles hold `
        + `${end.denari[0]}/${end.denari[1]}`);
    if (end.nums[6] !== end.prim[0] || end.nums[7] !== end.prim[1])
      bad.push(`the breakdown totals ${end.nums[6]}/${end.nums[7]} of primiera, the piles make `
        + `${end.prim[0]}/${end.prim[1]}`);
    if (end.nums[4] !== end.sette[0] || end.nums[5] !== end.sette[1])
      bad.push(`the breakdown counts ${end.nums[4]}/${end.nums[5]} settebello, the piles hold `
        + `${end.sette[0]}/${end.sette[1]}`);
    if (end.nums[8] !== end.scope[0] || end.nums[9] !== end.scope[1])
      bad.push(`the breakdown counts ${end.nums[8]}/${end.nums[9]} scope, the engine counted `
        + `${end.scope[0]}/${end.scope[1]}`);
    if (end.nums[10] !== String(end.punti[0]) || end.nums[11] !== String(end.punti[1]))
      bad.push(`the breakdown totals ${end.nums[10]}/${end.nums[11]}, scoreDeal returned `
        + `${end.punti[0]}/${end.punti[1]}`);
  }
  if (!chosenByTap) bad.push('no capture was chosen by tapping a table card');
  if (!chosenByAccept) bad.push('no capture was chosen by accepting the proposal');

  const all = [...bad, ...errs];
  console.log(`  ${all.length ? 'FAIL' : 'pass'}  one deal, ${plays} of your plays, `
    + `${chosenByTap} capture(s) chosen by tapping, ${chosenByAccept} by accepting, ${scopeSeen} scopa(e)`);
  all.forEach(b => console.log(`        ${b}`));
  await page.close();
  return all.length ? 1 : 0;
}

/* ---- run ------------------------------------------------------------------ */

const browser = await chromium.launch({ ...(CHROME && { executablePath: CHROME }), args: ['--no-sandbox'] });
// Printed, because every measurement below is this browser's. check.yml pins
// playwright-core for the same reason: two runs that do not agree about the
// environment are not two runs of the same check.
console.log(`chromium ${browser.version()}`);
let failed = 0;
failed += await checkDocument(browser);
failed += await checkFonts(browser);
failed += await checkScreens(browser);
failed += await checkTable(browser, null, false);
failed += await checkTable(browser, TIGHT, true);
failed += await checkChoice(browser);
failed += await checkStates(browser);
failed += await checkRotation(browser);
failed += await checkRules(browser);
failed += await checkFallbackFonts(browser);
failed += await checkSheets(browser);
failed += await checkDeal(browser);
await browser.close();

console.log(failed ? `\n${failed} case(s) failed` : '\nAll checks pass.');
process.exit(failed ? 1 : 0);
