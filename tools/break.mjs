// Break the engine on purpose, one rule at a time, and check the tests notice.
//
//   node tools/break.mjs            every break
//   node tools/break.mjs scopa      only the breaks whose name matches
//
// §4 iteration 1: "every rule test is broken deliberately after it is written
// — the wrong player credited, the sum rule skipped, the scopa counted on the
// last card — and watched to fail. A test that still passes is decoration."
//
// Doing that by hand produces a number in a pull request that nobody can
// re-derive, and PLAN.md §7.5 is explicit that a measured number and a
// remembered one look the same on the page. So it is a script: each break is a
// single edit to engine.js, applied to a copy, with the suite run against it.
// A break the suite does not catch is printed as SURVIVED and is a hole in the
// tests, not a curiosity.
//
// This is not part of CI. It edits nothing in the repository — the mutants go
// to a temporary directory and the suite is pointed at them through
// SCOPETTA_ENGINE.

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ENGINE = fileURLToPath(new URL("../public/engine.js", import.meta.url));
// Both suites: the rules and the opponent. A trap that cannot fail is the same
// defect as a rule test that cannot fail, and §4 iteration 2 records that four
// of Tressette's traps were written against positions where the bug they named
// could not appear.
const TESTS = [fileURLToPath(new URL("./engine.test.mjs", import.meta.url)),
               fileURLToPath(new URL("./opponent.test.mjs", import.meta.url))];
// LF, whatever the checkout: a `find` that spans lines is written with "\n",
// and Git for Windows checks engine.js out CRLF, where every such break
// matched nothing and came back INVALID — issue #43.
const TEXT = readFileSync(ENGINE, "utf8").replace(/\r\n/g, "\n");

// Each break is [name, find, replace] and optionally a fourth entry: the
// reason it is EQUIVALENT — a rewrite that cannot change what the engine
// does, so no test can catch it and its surviving is not a hole. Marking one
// equivalent is a claim, so each says how it was measured; an equivalent that
// starts failing is telling you the rewrite was not equivalent after all.
//
// `find` must appear exactly once, or the break is reported INVALID rather
// than quietly doing nothing somewhere else — a mutation that did not mutate
// would otherwise be counted as a hole.
// The test that is supposed to name each defect. Without this, "caught" means
// only that the suite went red — which a break that merely stops the file
// parsing would also achieve, and which a break caught by some unrelated test
// would too. The point of the exercise is that the assertion written for a
// defect is the one that sees it, so each break says which test that is, and
// a break caught only by other tests is reported MISMATCH.
//
// It checks membership in the whole set of failures, not the first one: Node
// reports tests in completion order, so the first `not ok` is whichever
// finished first, not whichever names the defect. Attributing to the first
// failure had three breaks pointing at a test that had nothing to do with them.
const EXPECT = {
  "capture credited to the wrong player": "a capture takes the card and its catch into the player's own pile",
  "the played card is not put in the pile": "a capture takes the card and its catch into the player's own pile",
  "leftovers to the wrong player": "the leftovers go to whoever captured last, and are not a scopa",
  "leftovers to nobody": "the leftovers go to whoever captured last, and are not a scopa",
  "laying a card counts as capturing last": "a card that takes nothing is laid on the table",
  "single before sum ignored": "a single of equal value is taken before any sum",
  "a sum may use the same card twice": "a sum never uses a card twice, and never exceeds the table",
  "a one-card sum is offered as a sum": "single before sum is one constant away too",
  "captures come back in the wrong order": "a sum can be three cards, and the order is the table's own",
  "a card that can take need not take": "a card that can take must take",
  "any set that adds up is accepted, offer or not": "a capture that is not one of prese()'s is refused",
  "a capture is accepted for a card that takes nothing": "claiming a capture for a card that takes nothing is refused",
  "playing out of turn is allowed": "playing out of turn, into a finished deal, or from an empty slot is refused",
  "a scopa is counted on the last card of the deal": "a sweep with the last card of the deal is not a scopa",
  "asso piglia tutto scores a scopa for its sweep": "asso piglia tutto sweeps the table without scoring a scopa for it",
  "no scopa is ever counted": "a capture that empties the table is a scopa",
  "the scopa goes to the other player": "a capture that empties the table is a scopa",
  "the dealer plays first": "the deal is three each and four up, and you play first on a cold start",
  "the dealer plays first in later rounds": "the dealer plays the last card of every round",
  "the deal does not alternate": "the deal alternates",
  "you deal the first deal": "the deal is three each and four up, and you play first on a cold start",
  "the turn does not alternate": "the turn alternates, play by play, all the way through",
  "the redeal rule never fires": "three re on the table is a redeal, and the rule is what redeals it",
  "the redeal rule fires on two re": "plain Scopa is what is played: the variants are all off",
  "the redeal boundary moves to two re without touching the constant": "a table of exactly two re is kept, not redealt",
  "an asso sweep stops scoring in the game as played": "an asso that sweeps the table scores a scopa like any other card",
  "every sweep stops scoring under asso piglia tutto": "under asso piglia tutto, a sweep by any other card is still a scopa",
  "a round deals four to the table again": "six rounds of three, thirty-six plays, and the deck dealt out",
  "the hand is not sorted": "a hand is sorted when it is dealt, at the deal and at every round",
  "the hand is sorted lowest first inside a suit": "a hand is sorted when it is dealt, at the deal and at every round",
  "the hand is sorted by value before suit": "a hand is sorted when it is dealt, at the deal and at every round",
  "a played card's hole is closed up": "a played card leaves a hole, and nothing closes it",
  "a tied point goes to you": "carte goes to more than twenty cards, and twenty-all to nobody",
  "primiera ignores a missing suit": "a player missing a suit cannot take the primiera",
  "primiera uses the capture value": "primiera is the best card of each suit, summed",
  "the primiera scale is off by one card": "the primiera scale is §2.1's, which is not the capture scale",
  "any seven is the settebello": "the settebello is the sette di denari and nothing else",
  "the scope are left out of the totals": "the totals are the four points plus the scope",
  "a draw is called a win": "vincitore reads the totals, and a draw is a draw",
  "the rng warm-up is dropped": "a seed names one stream, and the warm-up is in it",
  "the shuffle leaves the first card alone": "the shuffle is uniform, not merely disordered",
  "primiera takes the lowest of each suit": "primiera takes the best of each suit, not the first or the last",
  "primiera takes the last card of each suit seen": "primiera takes the best of each suit, not the first or the last",
  "later rounds are dealt unsorted": "a hand is sorted at every round, not only at the deal",
  "a new deal keeps the old plays count": "a new deal on a finished one starts from nothing",
  "a new deal keeps the old piles and scope": "a new deal on a finished one starts from nothing",
  "a new deal keeps the old ultimaPresa": "a new deal on a finished one starts from nothing",
  "a new deal does not say it is dealt": "a new deal on a finished one starts from nothing",
  "the cards are dealt to the opponent first": "the cards are dealt in order: three to you, three to them, four up",
  "the settebello term is dropped from worth": "with two sevens on the table, it takes the settebello",
  "the tempo term is dropped": "the golden fixture still plays out exactly as recorded",
  "the tempo term recurses instead of stopping at one ply": "the tempo term stops at one ply",
  "the tempo term looks at their real hand": "the tempo term cannot tell their hand from the deck",
  "the tempo term guesses at a round boundary it cannot see past": "the tempo term guesses at nothing it cannot see",
  "the score hands out a live reference to the scope": "the score reports a copy of the scope, not the state's own array",
  "worth ignores the suit, so a denaro is just a card": "offered the same card in two suits, it takes the denaro",
  "worth ignores primiera entirely": "the golden fixture still plays out exactly as recorded",
  "worth counts a card I already beat in that suit": "the golden fixture still plays out exactly as recorded",
  "the scopa risk term is dropped": "it lays the card that leaves the table hardest to sweep",
  "the gift term is dropped": "the golden fixture still plays out exactly as recorded",
  "the card laid down is left out of the table it leaves": "the golden fixture still plays out exactly as recorded",
  "ties go to the highest slot": "the golden fixture still plays out exactly as recorded",
  "the search never runs": "the search declines a capture the formula takes, and wins four more cards",
  "the search maximises the opponent's points": "the search plays for its own points, not theirs",
  "the search lets the opponent help me": "the search expects the opponent to play against it, not to help",
  "the search ties to the highest slot": "the golden fixture still plays out exactly as recorded",
  "fuori counts my own hand as unseen": "the golden fixture still plays out exactly as recorded",
  "pHold always says they hold it": "the golden fixture still plays out exactly as recorded",
  "the roster no longer leads with the house standard": "four players, and each one plays a different game",
};

const BREAKS = [
  // --- who gets what -------------------------------------------------------
  ["capture credited to the wrong player",
   "state.prese[who].push(card, ...taken);",
   "state.prese[altro(who)].push(card, ...taken);"],
  ["the played card is not put in the pile",
   "state.prese[who].push(card, ...taken);",
   "state.prese[who].push(...taken);"],
  ["leftovers to the wrong player",
   "state.prese[state.ultimaPresa].push(...resto);",
   "state.prese[altro(state.ultimaPresa)].push(...resto);"],
  ["leftovers to nobody",
   "state.prese[state.ultimaPresa].push(...resto);",
   "void resto;"],
  ["laying a card counts as capturing last",
   "  } else {\n    state.tavola.push(card);",
   "  } else {\n    state.ultimaPresa = who;\n    state.tavola.push(card);"],

  // --- what a card can take ------------------------------------------------
  ["single before sum ignored",
   "if (SINGLE_BEFORE_SUM && singles.length) return singles;",
   "if (false && singles.length) return singles;"],
  ["a sum may use the same card twice",
   "take(i + 1, chosen, left - w);",
   "take(i, chosen, left - w);"],
  ["a one-card sum is offered as a sum",
   "if (chosen.length >= 2) sums.push(chosen.slice());",
   "if (chosen.length >= 1) sums.push(chosen.slice());"],
  ["captures come back in the wrong order",
   "  take(0, [], v);",
   "  take(0, [], v); sums.reverse();"],
  ["a capture is offered that does not add up",
   "      if (w > left) continue;",
   "      if (w > left + 1) continue;",
   "the prune is an optimisation: a branch that overshoots reaches left < 0, " +
   "where every remaining card is still too big and the recursion dies without " +
   "pushing. Identical output over 200,000 random tables."],

  // --- the compulsion and the offer ----------------------------------------
  ["a card that can take need not take",
   "    if (PRESA_OBBLIGATORIA) throw new Error(\"this card must take\");",
   "    if (false) throw new Error(\"this card must take\");"],
  ["any set that adds up is accepted, offer or not",
   "  } else if (!options.some(set => sameSet(set, chosen))){",
   "  } else if (chosen.reduce((a, i) => a + valore(state.tavola[i].n), 0) !== valore(card.n)){"],
  ["a capture is accepted for a card that takes nothing",
   "    if (chosen.length) throw new Error(\"this card takes nothing\");",
   "    if (false) throw new Error(\"this card takes nothing\");"],
  ["playing out of turn is allowed",
   "  if (who !== state.deveGiocare) throw new Error(\"not this player's turn\");",
   "  if (false) throw new Error(\"not this player's turn\");"],

  // --- the scopa -----------------------------------------------------------
  ["a scopa is counted on the last card of the deal",
   "if (state.tavola.length === 0 && (SCOPA_ULTIMA || !ultima) && !perAsso){",
   "if (state.tavola.length === 0 && !perAsso){"],
  ["the settebello term is dropped from worth",
   "  if (isSettebello(c)) w += P.SETTEBELLO_BONUS;",
   "  if (false) w += P.SETTEBELLO_BONUS;"],
  ["the tempo term is dropped",
   "      score += P.TEMPO_BONUS * tempoShare(state, me, m, hidden, P);",
   "      score += 0;"],
  ["the tempo term looks at their real hand",
   "    st.hands[altro(me)] = ordina(pick.map(c => ({ ...c })));",
   "    void pick;"],
  ["the tempo term recurses instead of stopping at one ply",
   "    const reply = compGioca(st, P, 1);  // depth 1: their reply prices no tempo",
   "    const reply = compGioca(st, P, 0);"],
  ["the tempo term guesses at a round boundary it cannot see past",
   "  if (mine <= 1 && h <= 1) return 0;",
   "  if (false) return 0;"],
  ["an asso sweep stops scoring in the game as played",
   "    const perAsso = ASSO_PIGLIA_TUTTO && card.n === 1;",
   "    const perAsso = card.n === 1;"],
  ["every sweep stops scoring under asso piglia tutto",
   "    const perAsso = ASSO_PIGLIA_TUTTO && card.n === 1;",
   "    const perAsso = ASSO_PIGLIA_TUTTO;"],
  ["the redeal boundary moves to two re without touching the constant",
   "    if (state.tavola.filter(c => c.n === 10).length < REDEAL_RE) break;",
   "    if (state.tavola.filter(c => c.n === 10).length < 2) break;"],
  ["asso piglia tutto scores a scopa for its sweep",
   "    const perAsso = ASSO_PIGLIA_TUTTO && card.n === 1;",
   "    const perAsso = false;"],
  ["no scopa is ever counted",
   "      state.scope[who]++;",
   "      state.scope[who] += 0;"],
  ["the scopa goes to the other player",
   "      state.scope[who]++;",
   "      state.scope[altro(who)]++;"],

  // --- the deal ------------------------------------------------------------
  ["the dealer plays first",
   "  state.deveGiocare = altro(state.mazziere);\n  return state;\n}\n\n// §2.2. The next round",
   "  state.deveGiocare = state.mazziere;\n  return state;\n}\n\n// §2.2. The next round"],
  ["the dealer plays first in later rounds",
   "  state.deveGiocare = altro(state.mazziere);\n  return state;\n}\n\n/* --- what a card can take",
   "  state.deveGiocare = state.mazziere;\n  return state;\n}\n\n/* --- what a card can take"],
  ["the deal does not alternate",
   "    ? ALTO : altro(state.mazziere);",
   "    ? ALTO : state.mazziere;"],
  ["you deal the first deal",
   "    ? ALTO : altro(state.mazziere);",
   "    ? BASSO : altro(state.mazziere);"],
  ["the turn does not alternate",
   "    state.deveGiocare = altro(who);",
   "    state.deveGiocare = who;"],
  ["the redeal rule never fires",
   "const REDEAL_RE = 3;",
   "const REDEAL_RE = 9;"],
  ["the redeal rule fires on two re",
   "const REDEAL_RE = 3;",
   "const REDEAL_RE = 2;"],
  ["a round deals four to the table again",
   "  daiCarte(state, 3, 0);",
   "  daiCarte(state, 3, 4);"],

  // --- the sort ------------------------------------------------------------
  ["the hand is not sorted",
   "  hand.sort((a, b) => (a.s - b.s) || (b.n - a.n));",
   "  void hand;"],
  ["the hand is sorted lowest first inside a suit",
   "  hand.sort((a, b) => (a.s - b.s) || (b.n - a.n));",
   "  hand.sort((a, b) => (a.s - b.s) || (a.n - b.n));"],
  ["the hand is sorted by value before suit",
   "  hand.sort((a, b) => (a.s - b.s) || (b.n - a.n));",
   "  hand.sort((a, b) => (b.n - a.n) || (a.s - b.s));"],
  ["a played card's hole is closed up",
   "  state.hands[who][slot] = null;",
   "  state.hands[who][slot] = null;\n  state.hands[who] = state.hands[who].filter(c => c);"],

  // --- the score -----------------------------------------------------------
  ["a tied point goes to you",
   "  if (a === b) return null;",
   "  if (a === b) return BASSO;"],
  ["a point needs only as many, not more",
   "  return a > b ? BASSO : ALTO;",
   "  return a >= b ? BASSO : ALTO;",
   "unreachable: piuDi returns null on a === b one line above, so >= and > " +
   "agree on every input. Identical over every 0..40 pair."],
  ["primiera ignores a missing suit",
   "  if (best.some(v => v === 0)) return null;      // a suit missing: no point",
   "  ;"],
  ["primiera uses the capture value",
   "    if (primiera(c.n) > best[c.s]) best[c.s] = primiera(c.n);",
   "    if (c.n > best[c.s]) best[c.s] = c.n;"],
  ["the primiera scale is off by one card",
   "const PRIMIERA = { 1: 16, 2: 12, 3: 13, 4: 14, 5: 15, 6: 18, 7: 21, 8: 10, 9: 10, 10: 10 };",
   "const PRIMIERA = { 1: 16, 2: 12, 3: 13, 4: 14, 5: 15, 6: 21, 7: 18, 8: 10, 9: 10, 10: 10 };"],
  ["any seven is the settebello",
   "const isSettebello = c => c.s === DENARI && c.n === 7;",
   "const isSettebello = c => c.n === 7;"],
  ["the scope are left out of the totals",
   "  punti[BASSO] += state.scope[BASSO];",
   "  punti[BASSO] += 0;"],
  ["a draw is called a win",
   "  if (punti[BASSO] === punti[ALTO]) return null;",
   "  if (false) return null;"],

  // --- the opponent --------------------------------------------------------
  ["worth ignores the suit, so a denaro is just a card",
   "  if (c.s === DENARI) w += P.DENARI_WEIGHT;",
   "  if (false) w += P.DENARI_WEIGHT;"],
  ["worth ignores primiera entirely",
   "  if (gain > 0) w += gain * P.PRIMIERA_WEIGHT;",
   "  if (false) w += gain * P.PRIMIERA_WEIGHT;"],
  ["worth counts a card I already beat in that suit",
   "  const gain = primiera(c.n) - bestMine[c.s];",
   "  const gain = primiera(c.n);"],
  ["the scopa risk term is dropped",
   "    score -= P.SCOPA_RISK_PENALTY * pHold(U, ctx.outstanding[somma], h);",
   "    score -= 0;"],
  ["the gift term is dropped",
   "    score -= P.GIFT_FACTOR * worth(c, ctx.bestMine, P) * pHold(U, ctx.outstanding[valore(c.n)], h);",
   "    score -= 0;"],
  ["the card laid down is left out of the table it leaves",
   "  if (!mossa.presa.length) resta.push(card);",
   "  if (false) resta.push(card);"],
  ["ties go to the highest slot",
   "    if (score > bestScore){ bestScore = score; best = m; }",
   "    if (score >= bestScore){ bestScore = score; best = m; }"],
  ["the search never runs",
   "const CODA_FROM = 5;",
   "const CODA_FROM = 6;"],
  ["the search maximises the opponent's points",
   "    return punti[me] - punti[altro(me)];",
   "    return punti[altro(me)] - punti[me];"],
  ["the search lets the opponent help me",
   "    if (best === null || (who === me ? v > best : v < best)) best = v;",
   "    if (best === null || v > best) best = v;"],
  ["the search ties to the highest slot",
   "    if (v > bestValue){ bestValue = v; best = m; }",
   "    if (v >= bestValue){ bestValue = v; best = m; }"],
  ["fuori counts my own hand as unseen",
   "  for (const c of state.hands[me]) if (c) mark(c);",
   "  for (const c of []) if (c) mark(c);"],
  ["pHold always says they hold it",
   "  if (k <= 0 || h <= 0) return 0;",
   "  if (k <= 0 || h <= 0) return 0;\n  return 1;"],

  // --- the generator -------------------------------------------------------
  ["the rng warm-up is dropped",
   "  for (let i = 0; i < 8; i++) next();",
   "  for (let i = 0; i < 0; i++) next();"],
  ["the shuffle leaves the first card alone",
   "  for (let i = cards.length - 1; i > 0; i--){",
   "  for (let i = cards.length - 1; i > 1; i--){"],

  // --- the review's mutants: coverage this suite did not have --------------
  ["primiera takes the lowest of each suit",
   "    if (primiera(c.n) > best[c.s]) best[c.s] = primiera(c.n);",
   "    if (best[c.s] === 0 || primiera(c.n) < best[c.s]) best[c.s] = primiera(c.n);"],
  ["primiera takes the last card of each suit seen",
   "    if (primiera(c.n) > best[c.s]) best[c.s] = primiera(c.n);",
   "    best[c.s] = primiera(c.n);"],
  ["later rounds are dealt unsorted",
   "  daiCarte(state, 3, 0);",
   "  for (const w of [BASSO, ALTO]){ const h = []; for (let i = 0; i < 3; i++) h.push(state.cards[state.next++]); state.hands[w] = h; }"],
  ["a new deal keeps the old plays count",
   "  state.plays = 0;",
   "  state.plays = state.plays || 0;"],
  ["a new deal keeps the old piles and scope",
   "  state.prese = [[], []];\n  state.scope = [0, 0];",
   "  state.prese = state.prese || [[], []];\n  state.scope = state.scope || [0, 0];"],
  ["a new deal keeps the old ultimaPresa",
   "  state.ultimaPresa = null;",
   "  state.ultimaPresa = state.ultimaPresa ?? null;"],
  ["a new deal does not say it is dealt",
   "  state.dealt = true;",
   "  state.dealt = false;"],
  ["the cards are dealt to the opponent first",
   "  for (const who of [BASSO, ALTO]){\n    const hand = [];",
   "  for (const who of [ALTO, BASSO]){\n    const hand = [];"],
  // The start sheet renders the roster in key order, so a roster that does not lead
  // with the house standard puts the wrong name first in the selection list. Only the
  // first-key assertion sees it: the membership assertion sorts, and the golden fixture
  // compares objects, where key order is not observed.
  ["the roster no longer leads with the house standard",
   "  return { Graziano: GRAZIANO_WEIGHTS, Franco: FRANCO_WEIGHTS,",
   "  return { Franco: FRANCO_WEIGHTS, Graziano: GRAZIANO_WEIGHTS,"],
  ["the score hands out a live reference to the scope",
   "                scope: state.scope.slice(), punti };",
   "                scope: state.scope, punti };"],
];

const filter = process.argv[2];
const chosen = filter ? BREAKS.filter(b => b[0].includes(filter)) : BREAKS;
if (!chosen.length){
  console.error(`no break matches ${JSON.stringify(filter)}`);
  process.exit(2);
}

const dir = mkdtempSync(join(tmpdir(), "scopetta-break-"));
let caught = 0, survived = [], invalid = [], equivalent = [], wrongly = [],
    mismatched = [], undeclared = [];

// Everything below parses TAP, so the reporter is named rather than left to
// Node: with no TTY the runner picks spec, which prints neither `# tests` nor
// `not ok`, and every caught break came back INVALID — issue #40.
const RUN = ["--test-reporter=tap", "--test", ...TESTS];

// The suite has to pass on the real engine first, or every "caught" below
// means nothing.
let BASELINE = 0;
try {
  const out = String(execFileSync(process.execPath, RUN, { stdio: "pipe", maxBuffer: 64 * 1024 * 1024 }));
  // How many tests the suite really has, so the "did it run at all?" check
  // below is a fact rather than a magic number.
  BASELINE = (out.match(/^# tests (\d+)$/m) || [, 0])[1] | 0;
} catch {
  console.error("the tests do not pass on the unbroken engine — fix that first");
  rmSync(dir, { recursive: true, force: true });
  process.exit(2);
}
// A passing suite that reports no tests is a summary this script cannot read,
// not an empty suite, and every verdict below would be built on it.
if (!BASELINE){
  console.error("the unbroken suite passed but its summary could not be read — no `# tests` line");
  rmSync(dir, { recursive: true, force: true });
  process.exit(2);
}

let n = 0;
for (const [name, find, replace, why] of chosen){
  const hits = TEXT.split(find).length - 1;
  if (hits !== 1){
    invalid.push([name, `matched ${hits} times, want exactly 1`]);
    console.log(`INVALID  ${name} — matched ${hits} times`);
    continue;
  }
  const file = join(dir, `engine-${n++}.js`);
  writeFileSync(file, TEXT.replace(find, replace));

  let failed = false, failures = [], ran = 0;
  try {
    // A break can stop the deal from ending — "a new deal keeps the old plays
    // count" leaves a second deal that never reaches 36 — and a harness that
    // hangs reports nothing at all. A real hang lands in INVALID rather than in
    // caught, deliberately: nothing ran, so nothing noticed anything. It still
    // exits red.
    //
    // Ten minutes, not one. A break can be caught *slowly*: removing the tempo
    // term's depth guard does not recurse for ever, it recurses exponentially,
    // and the suite still fails on the test that names it — after 6m36s. At a
    // one-minute budget that arrived here as "the suite did not run", which
    // was a harness defect reporting a caught break as an unrunnable one. One
    // slow break costs this tool a few minutes and it is run by hand.
    execFileSync(process.execPath, RUN,
      { stdio: "pipe", timeout: 600000, maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, SCOPETTA_ENGINE: file } });
  } catch (e) {
    failed = true;
    const out = String(e.stdout || "") + String(e.stderr || "");
    // TAP escapes `\` and `#` in a name, so a test file that fails to load is
    // named `C:\\Users\\…` on Windows and never equalled its entry in TESTS:
    // the INVALID check below could not fire there — issue #46.
    failures = [...out.matchAll(/^not ok \d+ - (.*)$/gm)]
      .map(m => m[1].trim().replace(/\\([\\#])/g, "$1"));
    ran = (out.match(/^# tests (\d+)$/m) || [, 0])[1] | 0;
  }
  if (why){
    // An equivalent mutant is expected to survive. If it was caught, the
    // claim that it changes nothing is wrong, and that is worth a red exit
    // just as much as a hole is.
    if (failed){
      wrongly.push([name, failures.join(", ")]);
      console.log(`NOT EQUIV ${name}  →  caught by: ${failures.join(", ")}`);
    } else {
      equivalent.push([name, why]);
      console.log(`equivalent ${name}`);
    }
    continue;
  }

  // A break that stops the file parsing is not the tests noticing anything —
  // it breaks the tests rather than the rules. Node reports that as a single
  // failing "test" named after the file, so the tell is the failure carrying
  // the test file's own path, or the suite reporting far fewer tests than it
  // has. Checked, because the obvious guard — no failures at all — does not
  // fire on this case: a syntax-error probe reached UNDECLARED instead.
  if (failed && (failures.length === 0 || TESTS.some(t => failures.includes(t)) || ran < BASELINE / 2)){
    invalid.push([name, `the suite did not run — ${ran} test(s) reported`]);
    console.log(`INVALID  ${name} — the suite did not run, so nothing caught anything`);
    continue;
  }

  if (!failed){ survived.push(name); console.log(`SURVIVED ${name}`); continue; }

  const want = EXPECT[name];
  if (!want){
    undeclared.push(name);
    console.log(`caught   ${name}  →  ${failures[0]}  (no expected test declared)`);
  } else if (!failures.includes(want)){
    mismatched.push([name, want, failures.join(", ")]);
    console.log(`MISMATCH ${name}\n         expected: ${want}\n         but failed: ${failures.join(", ")}`);
  } else {
    caught++;
    console.log(`caught   ${name}  →  ${want}`);
  }
}

rmSync(dir, { recursive: true, force: true });

const real = chosen.length - equivalent.length - wrongly.length - invalid.length;
console.log(`\n${chosen.length} breaks: ${caught} of ${real} caught by the test that names them, ` +
            `${mismatched.length} caught by another test, ${survived.length} survived, ` +
            `${equivalent.length} equivalent, ${undeclared.length} undeclared, ` +
            `${invalid.length} invalid`);
for (const s of survived) console.log(`  SURVIVED — a hole in the tests: ${s}`);
for (const [s, want, got] of mismatched)
  console.log(`  MISMATCH — no test names this defect: ${s}\n             wanted: ${want}\n             failed: ${got}`);
for (const s of undeclared) console.log(`  UNDECLARED — add it to EXPECT: ${s}`);
for (const [s, w] of wrongly) console.log(`  NOT EQUIVALENT — the claim is wrong: ${s} (${w})`);
for (const [s, w] of equivalent) console.log(`  equivalent: ${s}\n              ${w}`);
for (const [s, w] of invalid) console.log(`  invalid: ${s} (${w})`);
process.exit(survived.length || invalid.length || wrongly.length
             || mismatched.length || undeclared.length ? 1 : 0);
