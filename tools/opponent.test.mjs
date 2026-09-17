// The trap suite and the golden test, on node --test. No dependencies.
//
// A win rate hides a stupid habit, so §3.4 names positions the opponent has to
// get right whatever its weights are. Each one here carries its own
// **real-choice check**: a position with one legal play asserts nothing, and
// §4 iteration 2 records that four of Tressette's trap tests, over three
// iterations, were written against positions where the bug they named could
// not appear. `realChoice` is called by every trap, so a new one gets it
// whether or not anyone remembers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInThisContext } from "node:vm";
import { fileURLToPath } from "node:url";

const SOURCE = process.env.SCOPETTA_ENGINE
  || fileURLToPath(new URL("../public/engine.js", import.meta.url));
runInThisContext(readFileSync(SOURCE, "utf8"));

const { BASSO, ALTO, DENARI, rngSeed, newDeal, gioca, scoreDeal,
        WEIGHT_KEYS, rollProfiles, compGioca, mosse, CODA_FROM,
        tempoShare, fuori } = globalThis;

const FRANCO = rollProfiles(rngSeed(1)).Franco;
const card = (s, n) => ({ s, n });

// A position built by hand. `giro` defaults to 0 — the formula's branch — and
// a trap that means to test the search says `giro: 5`.
//
// Five, not CODA_FROM: the sixth round is a fact about Scopa — six rounds of
// three — and a trap that builds its position out of the constant it is
// testing moves with it. These three traps were written that way first, and
// tools/break.mjs caught it: moving CODA_FROM to 6 moved the traps to round 6
// as well, so they went on searching and passed a search that never ran.
function position(over){
  return Object.assign({
    cards: [], next: 40,
    hands: [[null, null, null], [null, null, null]],
    tavola: [], prese: [[], []], scope: [0, 0],
    ultimaPresa: null, mazziere: ALTO, deveGiocare: BASSO,
    giro: 0, plays: 4, over: false
  }, over);
}

// The check §4 insists on: the position must actually offer a choice, or the
// assertion below it is about nothing. Returns the plays so a trap can also
// say what the alternatives were.
function realChoice(state){
  const m = mosse(state, state.deveGiocare);
  assert.ok(m.length > 1,
    `this position offers ${m.length} legal play(s) — a trap needs a real choice`);
  return m;
}

const played = (state, m) => state.hands[state.deveGiocare][m.slot];

/* --- the traps §3.4 names ---------------------------------------------------- */

test("with two sevens on the table, it takes the settebello", () => {
  // §3.4's first trap. Single before sum leaves exactly two captures, and only
  // one of them is a point.
  //
  // **The pile is not empty, and that is the whole test.** `worth`'s primiera
  // term is per suit, so with nothing taken yet the settebello and a seven of
  // any other suit are worth the same on that term and the denari weight
  // decides — the trap passes without the settebello term existing. Take one
  // decent denaro first and the settebello's primiera gain collapses while the
  // seven of bastoni keeps its whole 21: 4.2 against 9.4, and the engine
  // declines the point. Written with an empty pile, this trap was decoration,
  // and it was the argument for removing SETTEBELLO_BONUS.
  const s = position({
    tavola: [card(1, 7), card(DENARI, 7)],
    hands: [[card(2, 7), null, null], [card(3, 10), card(3, 9), null]],
    prese: [[card(DENARI, 6)], []]
  });
  const choices = realChoice(s);
  assert.equal(choices.length, 2, "both sevens are on offer");
  const m = compGioca(s, FRANCO);
  assert.deepEqual(m.presa, [1], "it took the seven of coppe instead of the settebello");
});

test("offered 4+3 or 5+2 for a seven, it takes the pair with the denaro", () => {
  // §3.4's second trap: the same two cards either way, so only the suits can
  // decide it.
  const s = position({
    tavola: [card(DENARI, 4), card(1, 3), card(2, 5), card(3, 2)],
    hands: [[card(1, 7), null, null], [card(3, 10), card(3, 9), null]]
  });
  const choices = realChoice(s);
  assert.equal(choices.length, 2, "4+3 and 5+2, and nothing else");
  const m = compGioca(s, FRANCO);
  assert.deepEqual(m.presa, [0, 1], "it left the denaro on the table");
});

test("offered the same card in two suits, it takes the denaro", () => {
  // Nothing named the denari term: §3.4's 4+3 / 5+2 trap does not, because
  // 4+3 and 5+2 have the same primiera sum, so dropping DENARI_WEIGHT leaves
  // them tied and the tie-break picks the card the trap expects anyway.
  //
  // Two fives, same value, same primiera, differing only in suit — and the
  // denaro is in the *higher* index on purpose, so a tie would find the other
  // one and the assertion means something.
  const s = position({
    tavola: [card(2, 5), card(DENARI, 5)],
    hands: [[card(1, 5), null, null], [card(3, 10), card(3, 9), null]]
  });
  const choices = realChoice(s);
  assert.equal(choices.length, 2, "both fives are on offer");
  assert.deepEqual(choices.map(m => m.presa), [[0], [1]], "and the denaro is the second");
  const m = compGioca(s, FRANCO);
  assert.deepEqual(m.presa, [1], "it took the five of spade and left the denaro");
});

test("it lays the card that leaves the table hardest to sweep", () => {
  // §3.4's third trap. Neither card captures, so only what it leaves can
  // decide: laying the 2 leaves a table of 8, inside the risk term's 1..10
  // window, and laying the 5 leaves 11, outside it.
  //
  // §3.4 tells this story as a counting one — "three 8s still out and no 3s" —
  // and with an empty pile nothing is counted at all: every 8 and every 3 is
  // still in `fuori`. The assertion is real and it does catch the risk term
  // going missing, but it passes on the window rather than on the count, and
  // the comment used to claim otherwise.
  const s = position({
    tavola: [card(1, 6)],
    hands: [[card(2, 5), card(3, 2), null], [card(0, 10), card(0, 9), card(0, 8)]],
    // Everything else accounted for, so the three 8s and no 3s are really out.
    prese: [[], []]
  });
  const choices = realChoice(s);
  assert.ok(choices.every(m => m.presa.length === 0), "neither card takes anything");
  const m = compGioca(s, FRANCO);
  assert.equal(played(s, m).n, 5, "it laid the 2 and left a table one card sweeps");
});

test("it takes the scopa when the alternative is worth less", () => {
  // §3.4's fourth trap, and the one that checks the formula still finds a
  // scopa now that SCOPA_BONUS has been measured out of it: a sweep takes
  // every card on the table, so it wins on the captured term alone and leaves
  // nothing for the gift term to subtract. The trap asserts only that — the
  // weights are free to decide the close cases.
  const s = position({
    tavola: [card(1, 1), card(2, 2), card(3, 4)],
    hands: [[card(1, 7), card(2, 3), null], [card(0, 10), card(0, 9), null]]
  });
  const choices = realChoice(s);
  // The 7 takes 1+2+4 and sweeps; the 3 takes 1+2 and leaves the 4.
  assert.equal(choices.length, 2);
  const m = compGioca(s, FRANCO);
  assert.equal(played(s, m).n, 7, "it passed up a sweep");
  assert.equal(m.presa.length, 3, "and took the whole table");
});

test("on the 35th play it takes a worthless card, for the leftovers", () => {
  // §3.4's fifth trap, and the search's rather than the formula's: taking one
  // card nobody wants is worth the whole table on the play after it. `giro` is
  // CODA_FROM, so this is the branch that plays the position out.
  const s = position({
    giro: 5, plays: 34,
    tavola: [card(3, 9), card(3, 8), card(1, 10)],
    hands: [[card(2, 9), card(0, 2), null], [card(1, 5), null, null]],
    ultimaPresa: ALTO,
    prese: [[], []]
  });
  const choices = realChoice(s);
  assert.ok(choices.some(m => m.presa.length), "there is a capture available");
  assert.ok(choices.some(m => !m.presa.length), "and a card that takes nothing");
  const m = compGioca(s, FRANCO);
  assert.ok(m.presa.length,
    "it laid a card and handed the last capture, and the leftovers, to the opponent");
});

test("the deal's last card can sweep, and the score shows no scopa for it", () => {
  // §3.4's sixth trap: the last card of the deal sweeps and scores nothing.
  //
  // Note it is the formula answering, not the search — at the 36th play the
  // opponent's hand is empty, so `theirCards > 0` fails and `compGioca` falls
  // through. The assertion is on `gioca` and `scoreDeal` and holds either way;
  // the label used to say the search, which was wrong.
  const s = position({
    giro: 5, plays: 35, deveGiocare: ALTO, mazziere: ALTO,
    tavola: [card(1, 4)],
    hands: [[null, null, null], [card(0, 4), null, null]],
    ultimaPresa: BASSO
  });
  const m = compGioca(s, FRANCO);
  assert.ok(m, "it has a play");
  const r = gioca(s, ALTO, m.slot, m.presa);
  assert.equal(r.ultima, true);
  assert.equal(r.scopa, false);
  assert.deepEqual(scoreDeal(s).scope, [0, 0], "the last card scored a scopa");
});

test("§3.4's own ending: it lays the five, which only playing it out finds", () => {
  // The position PLAN.md §3.4 found by brute force over random endings, and the
  // one that says why the formula cannot do the sixth round. Two cards each,
  // they play last, and neither of my cards takes anything, so both lays score
  // exactly zero — the table sums to 33, which is outside the risk term's
  // window, and `fuori` is their two cards, so every pHold on the table is 0
  // and the gift term vanishes too. The formula ties to the lower slot and
  // plays the six; only the search finds the five.
  //
  //   Lay the 6: they lay the 2, my 5 takes nothing, their 3 takes the asso and
  //   the 2 — the last capture, and the leftovers with it. Eight cards to none.
  //   Lay the 5: whichever card they lay, my 6 takes the asso and the 5, their
  //   last card takes nothing, and the eight cards are mine.
  //
  // **All forty cards are accounted for, and that is the point.** Written with
  // empty piles this trap tests nothing at all: `fuori` is then 34 cards rather
  // than 2, `compGioca`'s guard refuses the search, and the formula answers in
  // both configurations — its gift terms no longer tie, so it picks the five
  // for the wrong reason and the trap passes with the search switched off. It
  // was written that way first, and the conclusion drawn was that §3.4 was
  // wrong about its own engine. §3.4 was right; the reconstruction was not.
  const rest = [];
  const used = new Set([[1,10],[2,7],[3,9],[1,1],[0,6],[1,5],[2,2],[3,3]]
    .map(([a, b]) => a * 16 + b));
  for (let su = 0; su < 4; su++)
    for (let n = 1; n <= 10; n++)
      if (!used.has(su * 16 + n)) rest.push(card(su, n));

  const build = () => position({
    giro: 5, plays: 32, deveGiocare: BASSO, mazziere: ALTO, ultimaPresa: BASSO,
    tavola: [card(1, 10), card(2, 7), card(3, 9), card(1, 1)],
    hands: [[card(DENARI, 6), card(1, 5), null], [card(2, 2), card(3, 3), null]],
    prese: [rest.slice(0, 15).map(c => ({ ...c })), rest.slice(15).map(c => ({ ...c }))]
  });

  const s = build();
  assert.equal(s.prese[BASSO].length + s.prese[ALTO].length + s.tavola.length + 4, 40,
    "the sixth round forces every card to be somewhere");
  const choices = realChoice(s);
  assert.equal(choices.length, 2, "two cards, neither of which takes anything");
  assert.ok(choices.every(m => m.presa.length === 0), "and no capture on offer");
  assert.equal(s.hands[BASSO][0].n, 6, "the six is in the lower slot, where a tie finds it");

  const m = compGioca(s, FRANCO);
  assert.equal(m.slot, 1, "it laid the six — the play the formula makes and the search refuses");

  // Played out with the real rules rather than asserted about.
  const run = first => {
    const st = build();
    gioca(st, BASSO, first.slot, first.presa);
    while (!st.over){
      const mm = compGioca(st, FRANCO);
      gioca(st, st.deveGiocare, mm.slot, mm.presa);
    }
    return st.prese[BASSO].length;
  };
  const five = run({ slot: 1, presa: [] });
  const six  = run({ slot: 0, presa: [] });
  assert.ok(five - six >= 8, `laying the five won ${five - six} cards more, not the eight §3.4 counts`);
});

test("the search declines a capture the formula takes, and wins four more cards", () => {
  // A second ending, found the way §3.4 found its own — by brute force over
  // real endings, comparing the engine against itself with CODA_FROM moved past
  // the sixth round. Seed 84 at the 33rd play, reached in ordinary play.
  //
  // The formula plays the 6 of bastoni and takes the 6 of denari: a capture,
  // and it looks free. The search lays the re instead and declines it, because
  // taking the 6 hands them the last capture and the leftovers with it.
  const s = position({
    giro: 5, plays: 32, deveGiocare: BASSO, mazziere: ALTO,
    ultimaPresa: BASSO, scope: [0, 1],
    tavola: [card(1, 9), card(1, 8), card(0, 6), card(1, 5)],
    hands: [[null, card(3, 10), card(3, 6)], [null, card(2, 9), card(2, 7)]],
    prese: [
      [card(0, 2), card(1, 2), card(2, 8), card(3, 8), card(0, 7), card(3, 7),
       card(1, 7), card(0, 5), card(2, 2), card(0, 10), card(2, 10), card(3, 4),
       card(1, 4), card(2, 3), card(0, 3), card(1, 6), card(2, 6), card(2, 1), card(1, 1)],
      [card(3, 3), card(1, 3), card(2, 5), card(3, 5), card(1, 10), card(0, 8),
       card(3, 2), card(3, 9), card(0, 9), card(0, 4), card(2, 4), card(0, 1), card(3, 1)]
    ]
  });

  const choices = realChoice(s);
  assert.ok(choices.some(m => m.presa.length), "the capture the formula wants is on offer");
  assert.equal(s.prese[BASSO].length + s.prese[ALTO].length + s.tavola.length
             + s.hands[BASSO].filter(c => c).length + s.hands[ALTO].filter(c => c).length,
    40, "the position is a real one: forty cards accounted for");

  const m = compGioca(s, FRANCO);
  assert.equal(m.slot, 1, "it took the six instead of laying the re");
  assert.deepEqual(m.presa, [], "and it captured, where the search declines");

  // Played out with the real rules rather than asserted about: the choice is
  // worth four cards, which is what makes it worth searching for.
  const run = first => {
    const st = position({
      giro: 5, plays: 32, deveGiocare: BASSO, mazziere: ALTO,
      ultimaPresa: BASSO, scope: s.scope.slice(),
      tavola: s.tavola.map(c => ({ ...c })),
      hands: [s.hands[BASSO].map(c => c && { ...c }), s.hands[ALTO].map(c => c && { ...c })],
      prese: [s.prese[BASSO].map(c => ({ ...c })), s.prese[ALTO].map(c => ({ ...c }))]
    });
    gioca(st, BASSO, first.slot, first.presa);
    while (!st.over){
      const mm = compGioca(st, FRANCO);
      gioca(st, st.deveGiocare, mm.slot, mm.presa);
    }
    return st.prese[BASSO].length;
  };
  const laying = run({ slot: 1, presa: [] });
  const taking = run({ slot: 2, presa: [2] });
  assert.equal(laying, 25);
  assert.equal(taking, 21);
  assert.ok(laying - taking >= 4, `the choice was worth ${laying - taking} cards, not four`);
});

test("the search plays for its own points, not theirs", () => {
  // Found the same way: the engine against itself with the leaf's sign flipped.
  // Seed 1 at the 32nd play, the opponent to move. Taking the 2 and the 6 with
  // the 8 scores it a second point; taking the re with its own re scores one.
  // A search reading the leaf backwards prefers the re.
  const s = position({
    giro: 5, plays: 31, deveGiocare: ALTO, mazziere: ALTO,
    ultimaPresa: ALTO, scope: [0, 0],
    tavola: [card(1, 10), card(1, 2), card(2, 3), card(0, 6)],
    hands: [[null, card(1, 9), card(1, 5)], [card(1, 8), card(3, 10), card(3, 9)]],
    prese: [
      [card(2, 7), card(1, 7), card(2, 8), card(3, 8), card(0, 4), card(2, 4), card(3, 7),
       card(0, 7), card(3, 5), card(1, 1), card(3, 4), card(0, 3), card(3, 3)],
      [card(0, 8), card(3, 2), card(2, 6), card(0, 1), card(2, 1), card(2, 10), card(0, 10),
       card(1, 4), card(1, 3), card(3, 1), card(0, 5), card(2, 5), card(0, 2), card(2, 2),
       card(0, 9), card(2, 9), card(1, 6), card(3, 6)]
    ]
  });
  realChoice(s);
  const m = compGioca(s, FRANCO);
  assert.deepEqual([m.slot, m.presa], [0, [1, 3]],
    "it played for the wrong side of the score");
});

test("the search expects the opponent to play against it, not to help", () => {
  // And once more, against a search that takes the maximum at every node
  // instead of alternating — which is a search that assumes the opponent will
  // hand it the deal. Seed 4 at the 33rd play: taking the asso with the asso
  // is worth two points; laying the 9 and hoping is worth none.
  const s = position({
    giro: 5, plays: 32, deveGiocare: BASSO, mazziere: ALTO,
    ultimaPresa: BASSO, scope: [0, 1],
    tavola: [card(0, 1), card(2, 3), card(2, 7)],
    hands: [[null, card(3, 9), card(3, 1)], [card(2, 10), null, card(2, 5)]],
    prese: [
      [card(3, 8), card(0, 3), card(3, 5), card(1, 5), card(0, 5), card(2, 1), card(1, 1),
       card(0, 4), card(2, 4), card(0, 9), card(1, 7), card(2, 2), card(1, 10), card(0, 8),
       card(1, 2), card(3, 6), card(1, 6), card(1, 4), card(3, 4)],
      [card(0, 2), card(3, 2), card(2, 9), card(1, 9), card(2, 6), card(0, 6), card(1, 3),
       card(3, 3), card(3, 7), card(0, 7), card(3, 10), card(0, 10), card(1, 8), card(2, 8)]
    ]
  });
  realChoice(s);
  const m = compGioca(s, FRANCO);
  assert.deepEqual([m.slot, m.presa], [2, [0]],
    "it assumed the opponent would cooperate");
});

test("the tempo term guesses at nothing it cannot see", () => {
  // §3.4: the engine gives the opponent nothing a human could not count. The
  // tempo term guesses at their hand, and it must not guess past the end of a
  // round: with one card each left, the next round is dealt before my next
  // turn, and what I would hold then is in a deck the engine may not read.
  // Without the guard, `gioca` deals that round inside the hypothetical — from
  // the real deck.
  const closing = position({
    giro: 2, plays: 16,
    tavola: [card(1, 6), card(2, 4)],
    hands: [[card(3, 5), null, null], [null, null, card(0, 9)]],
    prese: [[card(DENARI, 2)], [card(1, 3)]]
  });
  assert.equal(closing.hands[BASSO].filter(c => c).length, 1);
  assert.equal(closing.hands[ALTO].filter(c => c).length, 1);
  assert.equal(
    tempoShare(closing, BASSO, mosse(closing, BASSO)[0], fuori(closing, BASSO), FRANCO),
    0, "it guessed past a round boundary");

  // And with room left in the round it does answer, so the zero above is the
  // guard rather than a term that never fires. Taken from real play — seed 1 at
  // the eighth play — rather than invented, because the first invented position
  // here never fired and would have made the assertion above vacuous.
  const open = position({
    giro: 1, plays: 7, deveGiocare: ALTO, mazziere: ALTO, ultimaPresa: BASSO,
    tavola: [card(DENARI, 10), card(2, 4)],
    hands: [[card(1, 3), null, card(3, 1)], [card(2, 10), card(2, 9), card(2, 2)]],
    prese: [new Array(4).fill(card(1, 8)), new Array(5).fill(card(3, 8))]
  });
  const shares = mosse(open, ALTO)
    .map(m => tempoShare(open, ALTO, m, fuori(open, ALTO), FRANCO));
  assert.ok(shares.some(v => v > 0),
    `the term never fires even with a round to play: ${JSON.stringify(shares)}`);
  assert.ok(shares.some(v => v === 0), "and it does not fire for every play alike");
});

/* --- the search is the search ------------------------------------------------ */

test("every profile plays the sixth round alike", () => {
  // §3.4: the search reads no weight, which is why those decisions are not in
  // the denominator when the roster is measured for difference. Stated here so
  // that a weight leaking into the search would fail rather than quietly
  // shrink iteration 5's numbers.
  // Built from the key list rather than a fixed array, so adding or removing a
  // weight cannot silently leave one undefined — which it did the first time
  // a weight came back.
  const wild = {};
  WEIGHT_KEYS.forEach((k, i) => { wild[k] = [99, -40, 17, 0, 250, -7, 31][i % 7]; });
  let searched = 0;
  for (let seed = 1; seed <= 60; seed++){
    const s = newDeal({}, rngSeed(seed));
    while (!s.over){
      const a = compGioca(s, FRANCO);
      if (s.giro >= CODA_FROM){
        const b = compGioca(s, wild);
        searched++;
        assert.deepEqual([a.slot, a.presa], [b.slot, b.presa],
          `seed ${seed}, play ${s.plays + 1}: the search read a weight`);
      }
      gioca(s, s.deveGiocare, a.slot, a.presa);
    }
  }
  assert.ok(searched > 200, `only ${searched} searched decisions — the case barely came up`);
});

test("it never offers a play the rules refuse", () => {
  // The opponent's output goes straight into gioca, which throws on anything
  // illegal — so this is 100 whole deals asserting that it never does.
  for (let seed = 1; seed <= 100; seed++){
    const s = newDeal({}, rngSeed(seed));
    while (!s.over){
      const m = compGioca(s, FRANCO);
      assert.ok(m, `seed ${seed}: compGioca returned nothing at play ${s.plays + 1}`);
      gioca(s, s.deveGiocare, m.slot, m.presa);   // throws if it is not legal
    }
    assert.equal(s.plays, 36);
  }
});

/* --- the golden fixture ------------------------------------------------------ */

// §4: seeds 1..20, both seats compGioca, the sequence of plays and captures
// frozen. Re-recorded only by
//   node tools/selfplay.mjs --golden > tools/golden.json
// and from v1.0 a change to the formula invalidates it, which is the whole
// reason §3.4's contract says change a weight, not the formula.
test("the golden fixture still plays out exactly as recorded", () => {
  const golden = JSON.parse(
    readFileSync(fileURLToPath(new URL("./golden.json", import.meta.url)), "utf8"));

  assert.deepEqual(golden.weights, FRANCO,
    "the fixture was recorded against different weights — re-record it deliberately or not at all");
  assert.equal(golden.codaFrom, CODA_FROM, "the fixture was recorded with a different CODA_FROM");
  assert.equal(golden.deals.length, 20);

  for (const want of golden.deals){
    const s = newDeal({}, rngSeed(want.seed));
    const plays = [];
    while (!s.over){
      const who = s.deveGiocare;
      const m = compGioca(s, FRANCO);
      const c = s.hands[who][m.slot];
      plays.push(`${who}:${c.s}-${c.n}:${m.presa.join(".")}`);
      gioca(s, who, m.slot, m.presa);
    }
    // The plays, not just the score: two different deals can score alike, and
    // §4's point is that the fixture freezes what was played.
    assert.deepEqual(plays, want.plays, `seed ${want.seed}: the plays have changed`);
    const r = scoreDeal(s);
    assert.deepEqual(r.punti, want.punti, `seed ${want.seed}: the score has changed`);
    assert.deepEqual(r.scope, want.scope);
    assert.equal(r.settebello, want.settebello);
    assert.equal(r.primiera, want.primiera);
    assert.equal(s.mazziere, want.mazziere);
  }
});

test("the fixture is not trivially satisfiable", () => {
  // A fixture that froze an empty list, or one deal, or all draws would pass
  // the test above while asserting nothing worth having.
  const golden = JSON.parse(
    readFileSync(fileURLToPath(new URL("./golden.json", import.meta.url)), "utf8"));
  assert.equal(golden.deals.length, 20);
  for (const d of golden.deals) assert.equal(d.plays.length, 36, `seed ${d.seed}`);
  assert.ok(golden.deals.some(d => d.scope[0] + d.scope[1] > 0), "no scopa in twenty deals");
  assert.ok(golden.deals.some(d => d.punti[0] !== d.punti[1]), "every recorded deal was a draw");
  assert.ok(new Set(golden.deals.map(d => d.plays.join(""))).size === 20,
    "two recorded deals played out identically");
});
