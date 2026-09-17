// Tests for public/engine.js, on node --test. No dependencies.
//
// The engine is a classic script so the page can load it from a folder, so the
// tests load it the way Node can: read the text, run it in this context, and
// take the names off globalThis. That is the same file the page runs.
//
// Every test here was broken on purpose after it was written and watched to
// fail; `node tools/break.mjs` re-runs those breaks, so the tally in the pull
// request is a command rather than a memory. §4 iteration 1.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInThisContext, runInContext, createContext } from "node:vm";
import { fileURLToPath } from "node:url";

// tools/break.mjs points this at a deliberately broken copy, so that "every
// test was watched to fail" is a command rather than a memory. Nothing else
// sets it, and CI does not.
const SOURCE = process.env.SCOPETTA_ENGINE
  || fileURLToPath(new URL("../public/engine.js", import.meta.url));
const TEXT = readFileSync(SOURCE, "utf8");
runInThisContext(TEXT);

const {
  SUITS, DENARI, BASSO, ALTO, altro,
  valore, primiera, isSettebello, buildDeck, mescola, rngSeed,
  REDEAL_RE, ordina, newDeal, distribuisci, prese, gioca,
  scoreDeal, vincitore, primieraTotale
} = globalThis;

const card = (s, n) => ({ s, n });
const hand = (...cs) => cs.slice();

// A card left in the other hand on purpose. Both hands empty means the round
// is over and gioca deals the next one — correctly, and from a deck these
// hand-built states have already spent. A position that claims to be
// mid-round has to actually be mid-round, and the first draft of these tests
// was not: it threw "the deck is empty" from four of them.
const avanzo = () => [null, null, { s: 3, n: 10 }];

// A state built by hand, for the positions a real deal reaches too rarely to
// wait for. Every one of these is backed by an assertion over 10,000 real
// deals at the bottom of this file, because a position built by hand to be
// convenient is built to be wrong in the way that matters.

function rigged(over){
  return Object.assign({
    cards: buildDeck(), next: 40,
    hands: [[null, null, null], avanzo()],
    tavola: [], prese: [[], []], scope: [0, 0],
    ultimaPresa: null, mazziere: ALTO, deveGiocare: BASSO,
    giro: 5, plays: 30, over: false
  }, over);
}

/* --- the engine runs anywhere ---------------------------------------------- */

// Comments are stripped first, or this check trips on the sentence in
// engine.js that promises not to do any of it. Tressette wrote this test
// without the stripping and it passed on its own comment, which is one of the
// three tests that could not fail that §4 says not to write again.
const CODE = TEXT.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, "");
const BROWSER_ONLY = [/\bdocument\b/, /\bwindow\b/, /\bsetTimeout\b/,
                      /\bsetInterval\b/, /Math\.random/];

test("the engine reaches for nothing a browser has", () => {
  for (const forbidden of BROWSER_ONLY)
    assert.equal(forbidden.test(CODE), false,
      `engine.js uses ${forbidden} — it has to run under Node too`);

  // Stripping comments is exactly the kind of step that quietly empties an
  // assertion. Prove it still bites.
  assert.ok(BROWSER_ONLY.some(f => f.test("el = document.body")), "document");
  assert.ok(BROWSER_ONLY.some(f => f.test("const r = Math.random()")), "Math.random");
  assert.ok(BROWSER_ONLY.some(f => f.test("setTimeout(go, 900)")), "setTimeout");
  // And that there was something left to search.
  assert.ok(CODE.includes("function gioca"), "the stripped source is still the engine");
});

test("a whole deal plays in a context with no globals at all", () => {
  // The check above says what the file does not mention; this one says what it
  // does not need. A bare vm context has no document, no window and no
  // require — if the engine wanted any of them, this throws.
  const bare = createContext({});
  runInContext(TEXT, bare);
  const plays = runInContext(`
    const s = newDeal({}, rngSeed(7));
    while (!s.over){
      const who = s.deveGiocare;
      const slot = s.hands[who].findIndex(c => c);
      const opts = prese(s.tavola, s.hands[who][slot]);
      gioca(s, who, slot, opts.length ? opts[0] : []);
    }
    s.plays;
  `, bare);
  assert.equal(plays, 36);
});

/* --- the cards -------------------------------------------------------------- */

test("a card takes by its number, and nothing reorders the deck", () => {
  for (let n = 1; n <= 10; n++) assert.equal(valore(n), n);
});

test("the primiera scale is §2.1's, which is not the capture scale", () => {
  // Written out rather than computed, because a formula here would be the same
  // guess twice. §2.1's table.
  assert.deepEqual([1,2,3,4,5,6,7,8,9,10].map(primiera),
                   [16, 12, 13, 14, 15, 18, 21, 10, 10, 10]);
  // The two orderings genuinely differ: the sette beats the re for primiera
  // and loses to it for capture. If that ever stops being true, one of the two
  // scales has been made from the other.
  assert.ok(primiera(7) > primiera(10) && valore(7) < valore(10));
  assert.ok(primiera(6) > primiera(1) && valore(6) > valore(1));
});

test("the settebello is the sette di denari and nothing else", () => {
  assert.ok(isSettebello(card(DENARI, 7)));
  assert.equal(isSettebello(card(1, 7)), false);
  assert.equal(isSettebello(card(DENARI, 6)), false);
});

test("the deck is forty distinct cards, four suits of ten", () => {
  const deck = buildDeck();
  assert.equal(deck.length, 40);
  assert.equal(new Set(deck.map(c => `${c.s}-${c.n}`)).size, 40);
  for (let s = 0; s < 4; s++)
    assert.equal(deck.filter(c => c.s === s).length, 10);
  assert.equal(SUITS.length, 4);
  assert.equal(SUITS[DENARI], "denari");
});

test("the shuffle is a permutation, and it does move cards", () => {
  const before = buildDeck().map(c => `${c.s}-${c.n}`);
  const after = mescola(buildDeck(), rngSeed(3)).map(c => `${c.s}-${c.n}`);
  assert.deepEqual([...after].sort(), [...before].sort(), "same forty cards");
  // Tressette wrote a shuffle test whose case never came up. State the case:
  // this one has to actually be out of order, and by more than a card or two.
  const moved = after.filter((k, i) => k !== before[i]).length;
  assert.ok(moved > 30, `only ${moved} of 40 cards moved`);
});

test("the shuffle is uniform, not merely disordered", () => {
  // "Most cards moved" passes a shuffle that is biased, which the break
  // harness found: stopping Fisher-Yates one step early leaves the last two
  // positions under-mixed, and one card then never reaches index 0 at all.
  // Nothing downstream would throw — it would only tilt every measurement
  // iteration 2 makes.
  //
  // So: where does each of the forty cards end up? Over 4,000 shuffles the
  // real generator gives chi-square 35 to 39 on 39 degrees of freedom with
  // every card seen 79 times or more at a given index; the one-step-short
  // version gives 270 and a card seen zero times. The bounds below sit in
  // that gap, measured with tools/break.mjs and the probe beside it.
  const N = 4000, expected = N / 40;
  for (const pos of [0, 1]){
    const at = new Array(40).fill(0);
    for (let seed = 1; seed <= N; seed++){
      const cards = buildDeck().map((c, i) => ({ ...c, i }));
      mescola(cards, rngSeed(seed));
      at[cards[pos].i]++;
    }
    const chi = at.reduce((a, c) => a + (c - expected) ** 2 / expected, 0);
    assert.ok(Math.min(...at) > 0,
      `index ${pos}: some card never landed there in ${N} shuffles`);
    assert.ok(chi < 100,
      `index ${pos}: chi-square ${chi.toFixed(1)} over 39 degrees of freedom — not uniform`);
  }
});

test("a seed names one stream, and the warm-up is in it", () => {
  const a = rngSeed(11), b = rngSeed(11), c = rngSeed(12);
  const draw = r => Array.from({ length: 5 }, () => r());
  const first = draw(a);
  assert.deepEqual(draw(b), first, "the same seed draws the same numbers");
  assert.notDeepEqual(draw(c), first, "a different seed does not");
  // The warm-up is what makes the first draw usable. Without it mulberry32's
  // first output for seeds 1..6 is 0.627, 0.734, 0.720, 0.924, 0.690, 0.526 —
  // every one above a half. With it, they are not all on one side.
  const firsts = [1, 2, 3, 4, 5, 6].map(s => rngSeed(s)());
  assert.ok(firsts.some(v => v < 0.5) && firsts.some(v => v >= 0.5),
    `all six first draws fell on one side of a half: ${firsts.map(v => v.toFixed(3))}`);
});

/* --- the deal --------------------------------------------------------------- */

const sorted = h => {
  const cs = h.filter(c => c);
  for (let i = 1; i < cs.length; i++){
    const a = cs[i - 1], b = cs[i];
    if (a.s > b.s) return false;
    if (a.s === b.s && a.n <= b.n) return false;   // same suit: highest first
  }
  return true;
};

test("the deal is three each and four up, and you play first on a cold start", () => {
  const s = newDeal({}, rngSeed(5));
  assert.equal(s.hands[BASSO].length, 3);
  assert.equal(s.hands[ALTO].length, 3);
  assert.equal(s.tavola.length, 4);
  assert.equal(s.next, 10);
  assert.equal(s.plays, 0);
  assert.equal(s.giro, 0);
  assert.equal(s.over, false);
  assert.deepEqual(s.prese, [[], []]);
  assert.deepEqual(s.scope, [0, 0]);
  assert.equal(s.ultimaPresa, null);
  // §2.2: the opponent deals the first deal, so you play first.
  assert.equal(s.mazziere, ALTO);
  assert.equal(s.deveGiocare, BASSO);
  // The ten cards dealt are ten distinct cards off the top of the deck.
  const out = [...s.hands[BASSO], ...s.hands[ALTO], ...s.tavola];
  assert.equal(new Set(out.map(c => `${c.s}-${c.n}`)).size, 10);
});

test("the deal alternates", () => {
  const rng = rngSeed(5);
  const s = newDeal({}, rng);
  assert.equal(s.mazziere, ALTO);
  newDeal(s, rng);
  assert.equal(s.mazziere, BASSO, "the other player deals the next one");
  assert.equal(s.deveGiocare, ALTO, "and the non-dealer plays first");
  newDeal(s, rng);
  assert.equal(s.mazziere, ALTO);
});

test("a new deal on a finished one starts from nothing", () => {
  // This is the page's Ancora path (§3.6), and it is the call shape the rest
  // of this file never makes: every other test deals into a fresh {}. A
  // newDeal that kept the old `plays` would leave a second deal that never
  // reaches thirty-six — an endless deal on the table, and nothing here would
  // have said so.
  const rng = rngSeed(23);
  const s = newDeal({}, rng);
  while (!s.over){
    const who = s.deveGiocare;
    const slot = s.hands[who].findIndex(c => c);
    const opts = prese(s.tavola, s.hands[who][slot]);
    gioca(s, who, slot, opts.length ? opts[0] : []);
  }
  assert.equal(s.plays, 36);
  assert.ok(s.prese[BASSO].length + s.prese[ALTO].length === 40 && s.over);

  // Dirtied on purpose: the deal above never raises a card, so asserting
  // `selected` against a state that was already null asserts nothing.
  s.selected = 1;
  s.scelta = 2;

  newDeal(s, rng);
  assert.equal(s.plays, 0, "the play count starts again");
  assert.deepEqual(s.prese, [[], []], "the piles are empty");
  assert.deepEqual(s.scope, [0, 0], "the scope are zero");
  assert.equal(s.ultimaPresa, null);
  assert.equal(s.over, false);
  assert.equal(s.dealt, true);
  assert.equal(s.giro, 0);
  assert.equal(s.next, 10);
  assert.equal(s.tavola.length, 4);
  assert.equal(s.selected, null, "a raised card does not survive the new deal");
  assert.equal(s.scelta, 0, "nor does the capture it had proposed");

  // And it really plays to the end a second time, which is the thing the
  // reset is for.
  while (!s.over){
    const who = s.deveGiocare;
    const slot = s.hands[who].findIndex(c => c);
    const opts = prese(s.tavola, s.hands[who][slot]);
    gioca(s, who, slot, opts.length ? opts[0] : []);
  }
  assert.equal(s.plays, 36, "the second deal ends too");
});

test("the score reports a copy of the scope, not the state's own array", () => {
  // §3.2's return shape. A live reference lets the page's next scopa change a
  // result dialog that is already on screen.
  const s = { prese: [[], []], scope: [1, 2] };
  const r = scoreDeal(s);
  s.scope[0] = 99;
  assert.deepEqual(r.scope, [1, 2], "the reported scope moved with the state");
});

test("three re on the table is a redeal, and the rule is what redeals it", () => {
  // Searching seeds for the case rather than asserting it never happens: a
  // test that waits for a 1-in-many deal is a test that asserts nothing on
  // almost every run.
  let found = 0, checked = 0;
  for (let seed = 1; seed <= 4000 && found < 3; seed++){
    // Deal the same seed by hand, without the rule, to see what it would have
    // turned up; then deal it with the engine and see that it differs.
    const raw = mescola(buildDeck(), rngSeed(seed));
    const wouldBe = raw.slice(6, 10);
    checked++;
    if (wouldBe.filter(c => c.n === 10).length >= REDEAL_RE){
      found++;
      const s = newDeal({}, rngSeed(seed));
      assert.ok(s.tavola.filter(c => c.n === 10).length < REDEAL_RE,
        `seed ${seed} kept a table of ${s.tavola.filter(c => c.n === 10).length} re`);
      assert.notDeepEqual(s.tavola, wouldBe, "the redeal produced a different table");
    }
  }
  assert.ok(found >= 3, `only ${found} three-re deals in ${checked} seeds — the case never came up`);
});

test("a table of exactly two re is kept, not redealt", () => {
  // The other two redeal tests both use REDEAL_RE as their own threshold, so
  // they say nothing about where it sits: mutate the rule to redeal on two
  // while leaving the constant at 3 and all of them still pass. This one
  // states the boundary in cards rather than in the constant, which is the
  // only way the wrong side of it is visible.
  let found = 0;
  for (let seed = 1; seed <= 4000 && found < 5; seed++){
    const raw = mescola(buildDeck(), rngSeed(seed));
    if (raw.slice(6, 10).filter(c => c.n === 10).length !== 2) continue;
    found++;
    const s = newDeal({}, rngSeed(seed));
    assert.deepEqual(s.tavola, raw.slice(6, 10),
      `seed ${seed}: a table of two re was redealt — §2.2 redeals on three`);
  }
  assert.ok(found >= 5, `only ${found} two-re deals in 4,000 seeds — the case never came up`);
});

test("no deal ever keeps three re on the table", () => {
  for (let seed = 1; seed <= 2000; seed++){
    const s = newDeal({}, rngSeed(seed));
    const re = s.tavola.filter(c => c.n === 10).length;
    assert.ok(re < REDEAL_RE, `seed ${seed} turned up ${re} re`);
  }
});

test("a hand is sorted when it is dealt, at the deal and at every round", () => {
  for (let seed = 1; seed <= 200; seed++){
    const s = newDeal({}, rngSeed(seed));
    assert.ok(sorted(s.hands[BASSO]) && sorted(s.hands[ALTO]),
      `seed ${seed}: the dealt hands are not in §2.2's order`);
  }
  // ordina's order, stated rather than sampled: suit ascending, value
  // descending inside a suit.
  const h = ordina(hand(card(3, 1), card(0, 5), card(3, 9), card(0, 10)));
  assert.deepEqual(h, [card(0, 10), card(0, 5), card(3, 9), card(3, 1)]);
});

test("a hand is sorted at every round, not only at the deal", () => {
  // The test above deals 200 times with newDeal and never plays a round, so
  // its title claimed five rounds it never rendered. §4 iteration 1 asks for
  // "every hand sorted as §2.2 says at the deal AND after each round", and
  // §4 puts the sort in this iteration because iteration 2's fixture freezes
  // it — so an unsorted round 3 would be frozen and paid for later.
  let rounds = 0;
  for (let seed = 1; seed <= 50; seed++){
    const s = newDeal({}, rngSeed(seed));
    let giro = -1;
    while (!s.over){
      if (s.giro !== giro){
        giro = s.giro;
        rounds++;
        for (const who of [BASSO, ALTO])
          assert.ok(sorted(s.hands[who]),
            `seed ${seed}, round ${giro}: ${who === BASSO ? "your" : "their"} hand is not in §2.2's order`);
      }
      const who = s.deveGiocare;
      const slot = s.hands[who].findIndex(c => c);
      const opts = prese(s.tavola, s.hands[who][slot]);
      gioca(s, who, slot, opts.length ? opts[0] : []);
    }
  }
  assert.equal(rounds, 50 * 6, "every round of every deal was looked at");
});

test("a new round is dealt, and says so, when both hands empty", () => {
  // The page needs the beat between rounds — §4 iteration 3 lists "a hand
  // empty for a beat between rounds" among the states the check must render —
  // and after gioca returns, the state no longer shows it.
  const s = newDeal({}, rngSeed(14));
  const announced = [];
  while (!s.over){
    const who = s.deveGiocare;
    const slot = s.hands[who].findIndex(c => c);
    const opts = prese(s.tavola, s.hands[who][slot]);
    const r = gioca(s, who, slot, opts.length ? opts[0] : []);
    if (r.nuovoGiro) announced.push(s.plays);
    assert.equal(r.nuovoGiro === true, s.plays % 6 === 0 && s.plays < 36,
      `play ${s.plays}: nuovoGiro disagrees with where the round boundary is`);
  }
  assert.deepEqual(announced, [6, 12, 18, 24, 30],
    "five new rounds after the deal, and none after the last play");
});

test("the cards are dealt in order: three to you, three to them, four up", () => {
  // Unspecified in §2.2 and frozen by iteration 2's fixture either way, so it
  // is pinned here rather than left to whichever way the loop happened to run.
  const s = newDeal({}, rngSeed(19));
  const key = c => `${c.s}-${c.n}`;
  const off = (a, b) => s.cards.slice(a, b).map(key).sort();
  assert.deepEqual(s.hands[BASSO].map(key).sort(), off(0, 3), "the first three are yours");
  assert.deepEqual(s.hands[ALTO].map(key).sort(), off(3, 6), "the next three are theirs");
  assert.deepEqual(s.tavola.map(key), s.cards.slice(6, 10).map(key),
    "and the next four go up, in the order they come off the deck");
});

test("a played card leaves a hole, and nothing closes it", () => {
  const s = newDeal({}, rngSeed(5));
  const before = s.hands[BASSO].slice();
  const slot = 1;
  const opts = prese(s.tavola, s.hands[BASSO][slot]);
  gioca(s, BASSO, slot, opts.length ? opts[0] : []);
  assert.equal(s.hands[BASSO][1], null, "the played slot is empty");
  assert.equal(s.hands[BASSO][0], before[0], "slot 0 did not move");
  assert.equal(s.hands[BASSO][2], before[2], "slot 2 did not move");
});

test("six rounds of three, thirty-six plays, and the deck dealt out", () => {
  const s = newDeal({}, rngSeed(21));
  const giri = new Set();
  let plays = 0;
  while (!s.over){
    giri.add(s.giro);
    const who = s.deveGiocare;
    const slot = s.hands[who].findIndex(c => c);
    const opts = prese(s.tavola, s.hands[who][slot]);
    gioca(s, who, slot, opts.length ? opts[0] : []);
    plays++;
  }
  assert.equal(plays, 36);
  assert.equal(s.plays, 36);
  assert.deepEqual([...giri].sort(), [0, 1, 2, 3, 4, 5]);
  assert.equal(s.giro, 5);
  assert.equal(s.next, 40, "every card left the deck");
  assert.equal(s.deveGiocare, null);
});

test("the turn alternates, play by play, all the way through", () => {
  // Nothing named this before: making gioca leave the turn where it was broke
  // seven tests and was reported as caught by whichever finished first. The
  // rule is its own, so it gets its own assertion.
  const s = newDeal({}, rngSeed(41));
  let previous = null;
  while (!s.over){
    const who = s.deveGiocare;
    if (previous !== null && s.plays % 6 !== 0)
      assert.equal(who, altro(previous),
        `play ${s.plays + 1}: the same player moved twice inside a round`);
    if (previous !== null && s.plays % 6 === 0)
      assert.equal(who, altro(s.mazziere),
        `play ${s.plays + 1}: a round did not open with the non-dealer`);
    const slot = s.hands[who].findIndex(c => c);
    const opts = prese(s.tavola, s.hands[who][slot]);
    gioca(s, who, slot, opts.length ? opts[0] : []);
    previous = who;
  }
  assert.equal(s.plays, 36);
});

test("the dealer plays the last card of every round", () => {
  const s = newDeal({}, rngSeed(33));
  const last = [];
  let seen = 0;
  while (!s.over){
    const who = s.deveGiocare;
    const slot = s.hands[who].findIndex(c => c);
    const opts = prese(s.tavola, s.hands[who][slot]);
    gioca(s, who, slot, opts.length ? opts[0] : []);
    if (++seen % 6 === 0) last.push(who);
  }
  assert.equal(last.length, 6);
  assert.ok(last.every(w => w === s.mazziere),
    `the dealer did not close every round: ${last}`);
});

/* --- what a card can take --------------------------------------------------- */

test("a single of equal value is taken before any sum", () => {
  // §2.3's own example: a 7 onto 7, 4 and 3 takes the 7.
  const tavola = [card(1, 7), card(2, 4), card(3, 3)];
  assert.deepEqual(prese(tavola, card(DENARI, 7)), [[0]],
    "the 4 and the 3 must not be offered while a 7 is there");
});

test("two singles are two choices, and the sums stay hidden", () => {
  const tavola = [card(1, 7), card(2, 7), card(3, 4), card(0, 3)];
  assert.deepEqual(prese(tavola, card(DENARI, 7)), [[0], [1]]);
});

test("every sum is found, and none is invented", () => {
  // 4, 3, 5, 2 with a 7: exactly 4+3 and 5+2.
  const tavola = [card(0, 4), card(1, 3), card(2, 5), card(3, 2)];
  assert.deepEqual(prese(tavola, card(0, 7)), [[0, 1], [2, 3]]);
});

test("a sum can be three cards, and the order is the table's own", () => {
  const tavola = [card(0, 1), card(1, 2), card(2, 4), card(3, 6)];
  // 1+2+4 = 7. 1+6 = 7 as well, and it comes first: index 0 pairs with the
  // earliest partner before the longer set starting at the same index.
  const got = prese(tavola, card(0, 7));
  assert.deepEqual(got, [[0, 1, 2], [0, 3]]);
  assert.deepEqual(got[0], [0, 1, 2], "the first set is the proposal §3.7 shows");
});

test("nothing to take is an empty list, not a throw", () => {
  assert.deepEqual(prese([card(0, 10), card(1, 9)], card(2, 1)), []);
  assert.deepEqual(prese([], card(2, 7)), [], "an empty table takes nothing");
});

test("a sum never uses a card twice, and never exceeds the table", () => {
  // A single 3 cannot make 6 by being counted twice.
  assert.deepEqual(prese([card(0, 3)], card(1, 6)), []);
  // And the whole table summing to the value is one legal set.
  assert.deepEqual(prese([card(0, 3), card(1, 2), card(2, 5)], card(3, 10)), [[0, 1, 2]]);
});

test("a re takes a re, and a sum to ten is offered when no re is there", () => {
  assert.deepEqual(prese([card(0, 10), card(1, 6), card(2, 4)], card(3, 10)), [[0]]);
  assert.deepEqual(prese([card(1, 6), card(2, 4)], card(3, 10)), [[0, 1]]);
});

/* --- a play ----------------------------------------------------------------- */

test("a card that can take must take", () => {
  const s = rigged({ tavola: [card(1, 7)], hands: [[card(0, 7), null, null], avanzo()] });
  assert.throws(() => gioca(s, BASSO, 0, []), /must take/);
  // And the refusal changed nothing.
  assert.equal(s.plays, 30);
  assert.equal(s.tavola.length, 1);
  assert.ok(s.hands[BASSO][0], "the card is still in hand");
});

test("a capture that is not one of prese()'s is refused", () => {
  // Single before sum: the 7 is there, so 4+3 is not a capture at all, even
  // though it adds up. Checking the sum rather than the offer would let this
  // through, which is the whole reason gioca checks membership.
  const s = rigged({
    tavola: [card(1, 7), card(2, 4), card(3, 3)],
    hands: [[card(0, 7), null, null], avanzo()]
  });
  assert.throws(() => gioca(s, BASSO, 0, [1, 2]), /not one of this card's captures/);
  assert.equal(s.tavola.length, 3, "nothing was taken");
});

test("claiming a capture for a card that takes nothing is refused", () => {
  const s = rigged({ tavola: [card(1, 9)], hands: [[card(0, 2), null, null], avanzo()] });
  assert.throws(() => gioca(s, BASSO, 0, [0]), /takes nothing/);
});

test("playing out of turn, into a finished deal, or from an empty slot is refused", () => {
  const base = () => rigged({
    tavola: [card(1, 9)],
    hands: [[card(0, 2), null, null], [card(1, 2), null, null]]
  });
  assert.throws(() => gioca(base(), ALTO, 0, []), /not this player's turn/);
  assert.throws(() => gioca(rigged({ over: true }), BASSO, 0, []), /the deal is over/);
  assert.throws(() => gioca(base(), BASSO, 1, []), /holds no card/);
});

test("a card that takes nothing is laid on the table", () => {
  const s = rigged({ tavola: [card(1, 9)], hands: [[card(0, 2), null, null], avanzo()] });
  const r = gioca(s, BASSO, 0, []);
  assert.deepEqual(s.tavola, [card(1, 9), card(0, 2)]);
  assert.deepEqual(r.presa, []);
  assert.equal(r.scopa, false);
  assert.deepEqual(s.prese, [[], []], "nothing went to a pile");
  assert.equal(s.ultimaPresa, null, "laying a card is not capturing");
});

test("a capture takes the card and its catch into the player's own pile", () => {
  const s = rigged({
    tavola: [card(1, 4), card(2, 3), card(3, 9)],
    hands: [[card(0, 7), null, null], avanzo()]
  });
  const r = gioca(s, BASSO, 0, [0, 1]);
  assert.deepEqual(r.presa, [card(1, 4), card(2, 3)]);
  assert.deepEqual(s.tavola, [card(3, 9)], "and only the uncaught card is left");
  // The entries, not the total: these three cards are in BASSO's pile and
  // ALTO's is untouched. A test that counted "three cards captured" would pass
  // with them in the wrong pile.
  assert.equal(s.prese[BASSO].length, 3);
  assert.equal(s.prese[ALTO].length, 0);
  for (const c of [card(0, 7), card(1, 4), card(2, 3)])
    assert.ok(s.prese[BASSO].some(x => x.s === c.s && x.n === c.n), `${c.s}-${c.n} is BASSO's`);
  assert.equal(s.ultimaPresa, BASSO);
});

test("a capture that empties the table is a scopa", () => {
  const s = rigged({
    tavola: [card(1, 4), card(2, 3)],
    hands: [[card(0, 7), null, null], avanzo()]
  });
  const r = gioca(s, BASSO, 0, [0, 1]);
  assert.equal(r.scopa, true);
  assert.deepEqual(s.scope, [1, 0]);
  assert.equal(s.tavola.length, 0);
});

test("an asso that sweeps the table scores a scopa like any other card", () => {
  // In the game as played there is nothing special about an asso, and this
  // says so. It exists because the ASSO_PIGLIA_TUTTO guard beside the scopa
  // rule made the scopa card-dependent for the first time: drop the
  // `ASSO_PIGLIA_TUTTO &&` from `perAsso` and plain Scopa silently stops
  // scoring every asso sweep — 161 of 5,316 scope over 10,000 random-legal
  // deals, 3.0%, with every other test in this file still green.
  //
  // The 10,000-deal pass cannot see it: it asserts that a scopa implies an
  // empty table, never that an emptied table implies a scopa.
  const s = rigged({
    tavola: [card(1, 1)],
    hands: [[card(0, 1), null, null], avanzo()]
  });
  const r = gioca(s, BASSO, 0, [0]);
  assert.equal(r.scopa, true, "an asso sweeping the table is a scopa");
  assert.deepEqual(s.scope, [1, 0]);
});

test("under asso piglia tutto, a sweep by any other card is still a scopa", () => {
  // The pair to the test above and to the asso one below it. Without this,
  // suppressing *every* sweep under the variant — `perAsso = ASSO_PIGLIA_TUTTO`
  // — passes, and the variant would score no scope at all.
  const r = withVariant("ASSO_PIGLIA_TUTTO", ctx => runInContext(`
    const s = { cards: [], next: 40, plays: 10, giro: 1, over: false,
                hands: [[{s:0,n:7}, null, null], [null, null, {s:3,n:10}]],
                tavola: [{s:1,n:4},{s:2,n:3}],
                prese: [[], []], scope: [0, 0], ultimaPresa: null,
                mazziere: ALTO, deveGiocare: BASSO };
    const out = gioca(s, BASSO, 0, [0, 1]);
    ({ scopa: out.scopa, scope: s.scope });
  `, ctx));
  assert.equal(r.scopa, true, "a seven taking 4 and 3 is a scopa, variant or not");
  assert.deepEqual(r.scope, [1, 0]);
});

test("emptying the table without capturing is not a scopa", () => {
  // It cannot happen — a card laid down is on the table — but the assertion
  // says the scopa is the capture's, not the empty table's.
  const s = rigged({ tavola: [], hands: [[card(0, 7), null, null], avanzo()] });
  const r = gioca(s, BASSO, 0, []);
  assert.equal(r.scopa, false);
  assert.deepEqual(s.scope, [0, 0]);
});

test("a sweep with the last card of the deal is not a scopa", () => {
  // §2.3, SCOPA_ULTIMA = false. Play 36 is the dealer's, and the dealer is
  // ALTO here.
  const s = rigged({
    plays: 35, mazziere: ALTO, deveGiocare: ALTO, ultimaPresa: BASSO,
    tavola: [card(1, 4)],
    hands: [[null, null, null], [null, null, card(0, 4)]]
  });
  const r = gioca(s, ALTO, 2, [0]);
  assert.equal(r.ultima, true);
  assert.equal(r.scopa, false, "the last card of the deal cannot sweep");
  assert.deepEqual(s.scope, [0, 0]);
  assert.equal(s.over, true);
  // The capture still happened, it is only the point that does not.
  assert.equal(s.prese[ALTO].length, 2);
});

test("the same sweep one play earlier is a scopa", () => {
  // The pair to the test above: without it, "no scopa on the last play" would
  // also pass an engine that never scores a scopa at all.
  const s = rigged({
    plays: 34, mazziere: ALTO, deveGiocare: ALTO, ultimaPresa: BASSO,
    tavola: [card(1, 4)],
    hands: [[null, null, card(2, 5)], [null, null, card(0, 4)]]
  });
  const r = gioca(s, ALTO, 2, [0]);
  assert.equal(r.ultima, false);
  assert.equal(r.scopa, true);
  assert.deepEqual(s.scope, [0, 1]);
});

test("the leftovers go to whoever captured last, and are not a scopa", () => {
  const s = rigged({
    plays: 35, mazziere: ALTO, deveGiocare: ALTO, ultimaPresa: BASSO,
    tavola: [card(1, 4), card(2, 9), card(3, 8)],
    hands: [[null, null, null], [null, null, card(0, 2)]]
  });
  const r = gioca(s, ALTO, 2, []);           // takes nothing, so it is laid down
  assert.equal(r.ultima, true);
  assert.equal(s.tavola.length, 0, "the table is cleared at the end of the deal");
  assert.equal(r.resto.length, 4, "the three left plus the one just laid");
  // To BASSO, who captured last — not to ALTO, who made the last play.
  assert.equal(s.prese[BASSO].length, 4);
  assert.equal(s.prese[ALTO].length, 0);
  assert.deepEqual(s.scope, [0, 0], "the leftovers are not a scopa");
});

/* --- the score -------------------------------------------------------------- */

// A pile holding exactly the cards named, and enough filler to reach `total`
// without disturbing the point under test. Filler is drawn from the suits the
// test is not looking at.
function pile(cards, total, fillerSuit = 3){
  const out = cards.slice();
  let n = 1;
  while (out.length < total){
    const c = card(fillerSuit, ((n++ % 10) + 1));
    out.push(c);
  }
  return out;
}

const scored = (a, b, scope = [0, 0]) => scoreDeal({ prese: [a, b], scope });

test("carte goes to more than twenty cards, and twenty-all to nobody", () => {
  assert.equal(scored(pile([], 21), pile([], 19)).carte, BASSO);
  assert.equal(scored(pile([], 19), pile([], 21)).carte, ALTO);
  assert.equal(scored(pile([], 20), pile([], 20)).carte, null);
});

test("denari goes to more than five, and five-all to nobody", () => {
  const d = n => Array.from({ length: n }, (_, i) => card(DENARI, i + 1));
  assert.equal(scored(d(6), d(0)).denari, BASSO);
  assert.equal(scored(d(0), d(6)).denari, ALTO);
  // Five each: the two halves of the suit.
  const lower = [1,2,3,4,5].map(n => card(DENARI, n));
  const upper = [6,7,8,9,10].map(n => card(DENARI, n));
  assert.equal(scored(lower, upper).denari, null);
});

test("the settebello goes to whoever took it", () => {
  assert.equal(scored([card(DENARI, 7)], []).settebello, BASSO);
  assert.equal(scored([], [card(DENARI, 7)]).settebello, ALTO);
  assert.equal(scored([card(1, 7)], [card(DENARI, 6)]).settebello, null,
    "a seven of another suit is not the settebello");
});

test("primiera is the best card of each suit, summed", () => {
  // 7 of every suit: 21 x 4. Against 6 of every suit: 18 x 4.
  const sevens = [0,1,2,3].map(s => card(s, 7));
  const sixes  = [0,1,2,3].map(s => card(s, 6));
  assert.equal(primieraTotale(sevens), 84);
  assert.equal(primieraTotale(sixes), 72);
  assert.equal(scored(sevens, sixes).primiera, BASSO);
  assert.equal(scored(sixes, sevens).primiera, ALTO);
});

test("primiera takes the best of each suit, not the first or the last", () => {
  // The piles above hold one card per suit, where "best", "worst" and "last
  // seen" are the same number — so they pin the sum and not the rule §2.4
  // spends its longest sentence on. Two cards in every suit is what tells the
  // three apart: best gives 84, lowest or last-seen gives 48.
  const both = [];
  for (const s of [0, 1, 2, 3]){ both.push(card(s, 2)); both.push(card(s, 7)); }
  assert.equal(primieraTotale(both), 84, "21 x 4, the sevens");
  // And with the order reversed, so "last seen" cannot pass by luck either.
  const reversed = [];
  for (const s of [0, 1, 2, 3]){ reversed.push(card(s, 7)); reversed.push(card(s, 2)); }
  assert.equal(primieraTotale(reversed), 84);

  // The rule decides a real deal: BASSO holds every seven and every two,
  // ALTO holds every six. Best-of-suit gives BASSO the point at 84 to 72;
  // lowest-of-suit would give it to ALTO at 48 to 72.
  const sixes = [0,1,2,3].map(s => card(s, 6));
  assert.equal(scored(both, sixes).primiera, BASSO);
});

test("the primiera the score reports is the one primieraTotale computes", () => {
  // scoreDeal could read the right totals and award the wrong player. Stated
  // separately, both ways round, against totals asserted above.
  const strong = [];
  for (const s of [0, 1, 2, 3]){ strong.push(card(s, 3)); strong.push(card(s, 7)); }
  const weak = [0,1,2,3].map(s => card(s, 8));            // 10 x 4 = 40
  assert.equal(primieraTotale(strong), 84);
  assert.equal(primieraTotale(weak), 40);
  assert.equal(scored(strong, weak).primiera, BASSO);
  assert.equal(scored(weak, strong).primiera, ALTO);
});

test("an equal primiera goes to nobody", () => {
  const a = [0,1,2,3].map(s => card(s, 7));
  const b = [0,1,2,3].map(s => card(s, 7));
  assert.equal(scored(a, b).primiera, null);
  // Equal totals reached by different cards, so this is not just the same
  // hand twice: 21+18+16+15 = 70 both ways, dealt differently.
  const c = [card(0, 7), card(1, 6), card(2, 1), card(3, 5)];
  const d = [card(0, 6), card(1, 7), card(2, 5), card(3, 1)];
  assert.equal(primieraTotale(c), primieraTotale(d));
  assert.equal(scored(c, d).primiera, null);
});

test("a player missing a suit cannot take the primiera", () => {
  // Three suits of sevens — 63 — against four suits of figures — 40. The
  // bigger sum loses, because the point needs all four suits.
  const three = [card(0, 7), card(1, 7), card(2, 7)];
  const four  = [0,1,2,3].map(s => card(s, 8));
  assert.equal(primieraTotale(three), null);
  assert.equal(primieraTotale(four), 40);
  assert.equal(scored(three, four).primiera, ALTO);
  assert.equal(scored(four, three).primiera, BASSO);
});

test("if neither has all four suits, the primiera is nobody's", () => {
  const a = [card(0, 7), card(1, 7)];
  const b = [card(2, 7), card(3, 7)];
  assert.equal(scored(a, b).primiera, null);
});

test("the totals are the four points plus the scope", () => {
  // BASSO takes carte, denari, settebello and primiera, and two scope.
  const a = pile([card(DENARI, 7), ...[0,1,2,3].map(s => card(s, 6)),
                  ...[1,2,3,4,5,6].map(n => card(DENARI, n))], 21, 3);
  const b = pile([card(1, 8)], 19, 2);
  const r = scoreDeal({ prese: [a, b], scope: [2, 1] });
  assert.equal(r.carte, BASSO);
  assert.equal(r.denari, BASSO);
  assert.equal(r.settebello, BASSO);
  assert.equal(r.primiera, BASSO);
  assert.deepEqual(r.punti, [4 + 2, 0 + 1]);
  assert.deepEqual(r.scope, [2, 1]);
});

test("a point given to nobody is given to nobody, not to both", () => {
  const even = pile([], 20, 2);
  const r = scoreDeal({ prese: [even, pile([], 20, 2)], scope: [0, 0] });
  assert.equal(r.carte, null);
  assert.deepEqual(r.punti, [0, 0], "a tied point is nobody's, not everybody's");
});

test("vincitore reads the totals, and a draw is a draw", () => {
  // Deliberately not "ask who won, then check the points went to them", which
  // is one of the three tests §4 says could not fail. The piles are built to a
  // score worked out by hand, and vincitore has to agree with it.
  const sevens = [0,1,2,3].map(s => card(s, 7));
  const win = { prese: [pile(sevens.concat([card(DENARI, 7)]), 21, 0), pile([], 19, 1)], scope: [0, 0] };
  assert.deepEqual(scoreDeal(win).punti, [4, 0]);
  assert.equal(vincitore(win), BASSO);

  const lose = { prese: [pile([], 19, 1), pile(sevens.concat([card(DENARI, 7)]), 21, 0)], scope: [0, 0] };
  assert.deepEqual(scoreDeal(lose).punti, [0, 4]);
  assert.equal(vincitore(lose), ALTO);

  // §2.4's common draw: two points each, no scope. Worked out card by card,
  // because the first draft of this test guessed at 2-2 and was really 2-1 —
  // and a draw test that is not a draw asserts nothing about draws.
  //
  //   BASSO: the settebello, and a seven of every suit — so all four suits,
  //          primiera 84, and four denari in all.
  //   ALTO:  six denari and coppe filler — carte 21 to 19, denari 6 to 4, and
  //          no spade or bastoni at all, so no primiera.
  const bassoPile = pile([card(DENARI, 7), card(1, 7), card(2, 7), card(3, 7),
                          card(DENARI, 1), card(DENARI, 2), card(DENARI, 3)], 19, 3);
  const altoPile  = pile([4, 5, 6, 8, 9, 10].map(n => card(DENARI, n)), 21, 1);
  const half = { prese: [bassoPile, altoPile], scope: [0, 0] };
  const r = scoreDeal(half);
  assert.equal(r.settebello, BASSO);
  assert.equal(r.primiera, BASSO, "ALTO holds no spade and no bastoni");
  assert.equal(r.carte, ALTO, "21 to 19");
  assert.equal(r.denari, ALTO, "6 to 4");
  assert.deepEqual(r.punti, [2, 2]);
  assert.equal(vincitore(half), null);
});

test("scope alone can decide a deal", () => {
  const even = () => pile([], 20, 2);
  const s = { prese: [even(), even()], scope: [1, 0] };
  assert.deepEqual(scoreDeal(s).punti, [1, 0]);
  assert.equal(vincitore(s), BASSO);
});

/* --- the variants this game does not play ----------------------------------- */

// §0 decision 4 says each is a named constant so that a change is one line.
// A constant nothing reads would not make that true, so each branch is run
// here with the constant flipped, in its own context. If a branch is ever
// deleted, these fail — which is the only thing that keeps the constants from
// being decoration.
// The result crosses out of its vm realm, where an Array is a different Array
// and deepStrictEqual compares prototypes. Round-tripping it is what makes the
// comparison about the values.
const plain = v => JSON.parse(JSON.stringify(v));

function withVariant(name, body){
  const re = new RegExp(`(const ${name}\\s*=\\s*)(true|false)`);
  const found = TEXT.match(re);
  assert.ok(found, `${name} is not a boolean constant this test can flip`);
  const flipped = TEXT.replace(re, (_, lhs, was) => lhs + (was === "true" ? "false" : "true"));
  assert.notEqual(flipped, TEXT, `${name} did not flip`);
  const ctx = createContext({});
  runInContext(flipped, ctx);
  return plain(body(ctx));
}

test("plain Scopa is what is played: the variants are all off", () => {
  assert.equal(globalThis.ASSO_PIGLIA_TUTTO, false);
  assert.equal(globalThis.NAPOLA, false);
  assert.equal(globalThis.RE_BELLO, false);
  // And the rules that ARE played are on.
  assert.equal(globalThis.PRESA_OBBLIGATORIA, true);
  assert.equal(globalThis.SINGLE_BEFORE_SUM, true);
  assert.equal(globalThis.SCOPA_ULTIMA, false);
  assert.equal(REDEAL_RE, 3);
});

test("single before sum is one constant away too", () => {
  // The rule this game plays, asserted above; this is the branch behind the
  // constant. With it off, the same table offers the sum as well as the
  // single — which is also what keeps the "a one-card sum" break from being
  // uncatchable, since sums are only ever reached when no single matches.
  const tavola = [{ s: 1, n: 7 }, { s: 2, n: 4 }, { s: 3, n: 3 }];
  assert.deepEqual(prese(tavola, card(0, 7)), [[0]], "on: only the seven");
  const got = withVariant("SINGLE_BEFORE_SUM", ctx =>
    runInContext("prese([{s:1,n:7},{s:2,n:4},{s:3,n:3}], {s:0,n:7})", ctx));
  assert.deepEqual(got, [[0], [1, 2]], "off: the seven and the four-and-three");
});

test("asso piglia tutto is one constant away", () => {
  const tavola = [card(1, 4), card(2, 3), card(3, 9)];
  assert.deepEqual(prese(tavola, card(0, 1)), [], "off: an asso takes nothing here");
  const got = withVariant("ASSO_PIGLIA_TUTTO", ctx =>
    runInContext("prese([{s:1,n:4},{s:2,n:3},{s:3,n:9}], {s:0,n:1})", ctx));
  assert.deepEqual(got, [[0, 1, 2]], "on: the asso takes the table");
});

test("asso piglia tutto sweeps the table without scoring a scopa for it", () => {
  // The variant's sweep is the rule, not an achievement: scoring it would hand
  // out about four free points a deal, which is not a Scopa anybody plays. The
  // engine reads `perAsso` for exactly this, and it is only reachable with the
  // constant on — so the assertion has to turn it on to see it.
  const r = withVariant("ASSO_PIGLIA_TUTTO", ctx => runInContext(`
    const s = { cards: [], next: 40, plays: 10, giro: 1, over: false,
                hands: [[{s:0,n:1}, null, null], [null, null, {s:3,n:10}]],
                tavola: [{s:1,n:4},{s:2,n:3},{s:3,n:9}],
                prese: [[], []], scope: [0, 0], ultimaPresa: null,
                mazziere: ALTO, deveGiocare: BASSO };
    const out = gioca(s, BASSO, 0, [0, 1, 2]);
    ({ scopa: out.scopa, scope: s.scope, taken: s.prese[BASSO].length,
       tavola: s.tavola.length });
  `, ctx));
  assert.equal(r.taken, 4, "the asso and the whole table");
  assert.equal(r.tavola, 0, "which does empty it");
  assert.equal(r.scopa, false, "and that is not a scopa");
  assert.deepEqual(r.scope, [0, 0]);
});

test("napola is one constant away", () => {
  const napola = [1, 2, 3].map(n => card(DENARI, n));
  assert.equal(scored(napola, []).napola, undefined, "off: not scored");
  const r = withVariant("NAPOLA", ctx => {
    ctx.PILE = napola;
    return runInContext("scoreDeal({ prese: [PILE, []], scope: [0, 0] })", ctx);
  });
  assert.equal(r.napola, BASSO, "on: scored");
});

test("re bello is one constant away", () => {
  assert.equal(scored([card(DENARI, 10)], []).reBello, undefined, "off: not scored");
  const r = withVariant("RE_BELLO", ctx =>
    runInContext("scoreDeal({ prese: [[{s:0,n:10}], []], scope: [0, 0] })", ctx));
  assert.equal(r.reBello, BASSO, "on: scored");
});

/* --- ten thousand deals ----------------------------------------------------- */

// A legal player that makes no judgements: a random card, and a random one of
// its captures. It exists to drive the rules over every position a deal can
// reach, not to play well.
function randomLegal(s, rng){
  const who = s.deveGiocare;
  const slots = [];
  for (let i = 0; i < s.hands[who].length; i++) if (s.hands[who][i]) slots.push(i);
  const slot = slots[Math.floor(rng() * slots.length)];
  const opts = prese(s.tavola, s.hands[who][slot]);
  const presa = opts.length ? opts[Math.floor(rng() * opts.length)] : [];
  return { who, slot, presa };
}

test("ten thousand deals obey the rules, and every card is accounted for", () => {
  const DEALS = 10000;
  let biggestTable = 0, biggestSeed = 0;
  let scopeTotal = 0, draws = 0;

  for (let seed = 1; seed <= DEALS; seed++){
    const rng = rngSeed(seed);
    const s = newDeal({}, rng);

    // The shadow ledger. §4 iteration 1: a test that checks a total checks
    // that the books balance, not that the entries are in the right accounts.
    // "Forty cards end in the two piles" passes an engine that credits a
    // capture to the wrong player, so the owner of every card is recorded here
    // independently, from what gioca was ASKED to do rather than what it did.
    const ledger = new Map();
    const own = (who, c) => {
      const k = `${c.s}-${c.n}`;
      assert.ok(!ledger.has(k), `seed ${seed}: ${k} was captured twice`);
      ledger.set(k, who);
    };

    while (!s.over){
      const { who, slot, presa } = randomLegal(s, rng);
      const played = s.hands[who][slot];
      const caught = presa.map(i => s.tavola[i]);
      const before = s.plays;

      const r = gioca(s, who, slot, presa);

      assert.equal(s.plays, before + 1, `seed ${seed}: a play that did not count`);
      if (presa.length){
        own(who, played);
        for (const c of caught) own(who, c);
        assert.equal(s.ultimaPresa, who);
      }
      // §2.3: a scopa is never scored on the last card of the deal.
      if (r.ultima) assert.equal(r.scopa, false, `seed ${seed}: a scopa on play 36`);
      if (r.scopa) assert.ok(s.tavola.length === 0 || r.ultima);
      for (const c of r.resto) own(s.ultimaPresa, c);

      if (s.tavola.length > biggestTable){
        biggestTable = s.tavola.length; biggestSeed = seed;
      }
    }

    assert.equal(s.plays, 36, `seed ${seed}: not thirty-six plays`);
    assert.equal(s.tavola.length, 0, `seed ${seed}: cards left on the table`);
    assert.equal(s.prese[BASSO].length + s.prese[ALTO].length, 40,
      `seed ${seed}: ${s.prese[BASSO].length + s.prese[ALTO].length} cards in the piles`);

    // The entries, against the ledger: every card in a pile is in the pile the
    // ledger says, and every card is in exactly one.
    assert.equal(ledger.size, 40, `seed ${seed}: the ledger lost a card`);
    for (const who of [BASSO, ALTO])
      for (const c of s.prese[who])
        assert.equal(ledger.get(`${c.s}-${c.n}`), who,
          `seed ${seed}: ${c.s}-${c.n} is in the wrong pile`);

    const r = scoreDeal(s);
    // Every point is given at most once: each of the four is one player or
    // nobody, and the totals are exactly those plus the scope.
    let awarded = 0;
    for (const p of [r.carte, r.denari, r.settebello, r.primiera]){
      assert.ok(p === BASSO || p === ALTO || p === null, `seed ${seed}: a point went somewhere else`);
      if (p !== null) awarded++;
    }
    assert.equal(r.punti[BASSO] + r.punti[ALTO], awarded + r.scope[BASSO] + r.scope[ALTO],
      `seed ${seed}: the totals do not match the points awarded`);
    // The settebello is exactly one card, so that point is never nobody's in a
    // finished deal — unlike the other three, which can tie.
    assert.notEqual(r.settebello, null, `seed ${seed}: nobody took the settebello`);

    scopeTotal += r.scope[BASSO] + r.scope[ALTO];
    if (vincitore(s) === null) draws++;
  }

  // §3.7: thirteen is the bound the rules allow. Printed so that the number
  // the check renders and the number a real deal reaches can be compared, and
  // asserted so that a fourteenth would fail here rather than on a phone.
  console.log(`      largest table in ${DEALS} deals: ${biggestTable} (seed ${biggestSeed})`);
  console.log(`      scope in ${DEALS} deals: ${scopeTotal}; draws: ${draws}`);
  assert.ok(biggestTable <= 13, `a table of ${biggestTable} — §3.7's bound of thirteen is wrong`);

  // Random-legal play makes scope and draws both common. If either went to
  // zero the loop above would still pass every assertion while testing far
  // less than it looks like it does.
  assert.ok(scopeTotal > 0, "no scopa in ten thousand deals");
  assert.ok(draws > 0, "no draw in ten thousand deals");
});
