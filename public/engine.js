/* ===========================================================================
   Scopetta — the rules, as §2 of PLAN.md states them.

   Functions over a plain state object — not pure ones, and the plan's phrase
   for it is loose: `newDeal`, `distribuisci` and `gioca` all mutate `state`,
   as Discola's did and as their own comments say. What is true, and is what
   the phrase is reaching for, is that nothing here reaches outside that
   object. Nothing touches `document`, `window`, timers or `Math.random`: the
   page loads this file with
   <script src="engine.js"> and Node runs the same text with
   vm.runInThisContext, which is what lets the tests, the self-play harness and
   the golden fixture run the code the page runs.

   Randomness always arrives as an argument. `rng` is any () => [0,1).

   Naming follows Discola's Pascal-flavoured Italian so the three games read
   alike. Where this game differs the difference is the comment.

   The opponent is iteration 2's and is not in this file yet.
   =========================================================================== */

/* --- cards ------------------------------------------------------------------ */

// Sprite-sheet order: row per suit, column n-1 for card number n. The same
// sheets as Tressette, which took them from Discola, so the same order. This
// order is also the hand sort's, per §2.2.
const SUITS = ["denari", "coppe", "spade", "bastoni"];
const DENARI = 0;

const BASSO = 0; // the human player, at the bottom of the table
const ALTO  = 1; // the opponent, at the top

const altro = who => (who === BASSO ? ALTO : BASSO);

// §2.1. A card takes by its number, and nothing here reorders the deck: the
// asso is 1 and the re is 10. Scopa has no trump and no rank table, which is
// the whole of why Tressette's RANGHI has no counterpart here.
function valore(n){ return n; }

// §2.1. The primiera scale, which is not the capture scale and not an
// ordering anyone would guess: the sette is worth most, then the sei, then
// the asso, and the three figures are worth least and alike.
const PRIMIERA = { 1: 16, 2: 12, 3: 13, 4: 14, 5: 15, 6: 18, 7: 21, 8: 10, 9: 10, 10: 10 };
function primiera(n){ return PRIMIERA[n]; }

// The settebello is a card, not a rule, but every other module asks the same
// question about it.
const isSettebello = c => c.s === DENARI && c.n === 7;

// 40 cards, suit-major.
function buildDeck(){
  const cards = [];
  for (let s = 0; s < 4; s++)
    for (let n = 1; n <= 10; n++)
      cards.push({ s, n });
  return cards;
}

// §2.2. Fisher-Yates, which is uniform, over an injected rng, which is what
// makes a fixture reproducible. Tressette's note applies unchanged: Discola
// kept the 1997 original's 200 + Random(100) swaps because that was the
// artefact, and there is no artefact here.
function mescola(cards, rng){
  for (let i = cards.length - 1; i > 0; i--){
    const j = Math.floor(rng() * (i + 1));
    const t = cards[i]; cards[i] = cards[j]; cards[j] = t;
  }
  return cards;
}

// A seeded generator, so the tests, the harness and the golden fixture all
// draw from the same stream when given the same seed. It lives here rather
// than in the harness because a fixture recorded against one generator and
// replayed against another is not a fixture. mulberry32, forked from
// Tressette with its warm-up.
function rngSeed(seed){
  let a = seed >>> 0;
  const next = function(){
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Eight thrown away first. mulberry32's first output is correlated with a
  // small seed — for seeds 1 to 6 it is 0.627, 0.734, 0.720, 0.924, 0.690,
  // 0.526, all on the same side of a half — and anything that reads the first
  // value to make a structural decision inherits that. In Tressette, Piero's
  // stance did: six consecutive seeds drew the same one. Warming the
  // generator is cheaper than remembering which draw is safe to use.
  //
  // Changing this changes every deal every seed produces, and so every figure
  // in PLAN.md that cites a seed. See CLAUDE.md.
  for (let i = 0; i < 8; i++) next();
  return next;
}

/* --- the house rules -------------------------------------------------------- */

// §0 decision 4 and §2: the variable points of Scopa, named, so that changing
// one is changing one line. Each of these is read by a branch below — a
// constant nothing consults would not make a change one line, it would only
// look as though it had.

// §2.3. A card that can take must take. It does not force the choice of which
// card to play: the player may play a different card that takes nothing.
const PRESA_OBBLIGATORIA = true;

// §2.3. A single card of equal value is taken before any sum, so a 7 played
// onto 7, 4 and 3 takes the 7.
const SINGLE_BEFORE_SUM = true;

// §2.3. A sweep with the last card of the deal is not a scopa.
const SCOPA_ULTIMA = false;

// §2.2. Three or four re among the four cards turned up is a redeal: with
// three on the table and one in the deck, at most one can ever be paired, so
// no scopa is possible all deal.
const REDEAL_RE = 3;

// §0 decision 4: the variants this game does not play. Each is read where the
// rule would attach, so that turning one on is turning one constant on.
//
// Not listed here: scopa d'assi. PLAN.md names it among the variants left out
// but never says what it does, and the house rule differs from table to table
// — in some it is another name for asso piglia tutto, in others a scopa
// scored for an asso played to an empty table. A constant guessing between
// them would be worse than no constant, so it is a gap, recorded in §5 of
// PLAN.md rather than invented here.
const ASSO_PIGLIA_TUTTO = false; // an asso sweeps the table instead of capturing by value
const NAPOLA           = false; // asso, due and tre of denari together score extra
const RE_BELLO         = false; // the re di denari is a point of its own

/* --- a deal ----------------------------------------------------------------- */

// §2.2. Suit in the sprite sheets' order, and within a suit by value, highest
// first — the way the house sorts a hand. Sorts in place and returns the same
// array.
//
// This is called when a hand is dealt and at no other time. A card played
// leaves a hole and nothing closes it, because a card that moves under the
// thumb between one glance and the next is a misplay. It is also why the sort
// belongs to iteration 1 rather than to the page: ties in the opponent's
// scoring go to the lowest slot, so the order of a hand is part of what the
// golden fixture freezes, and a sort added after the fixture was recorded
// would change plays nobody chose to change.
function ordina(hand){
  hand.sort((a, b) => (a.s - b.s) || (b.n - a.n));
  return hand;
}

// Three each and, on the first round only, four to the table.
function daiCarte(state, quante, allaTavola){
  for (const who of [BASSO, ALTO]){
    const hand = [];
    for (let i = 0; i < quante; i++) hand.push(state.cards[state.next++]);
    state.hands[who] = ordina(hand);
  }
  for (let i = 0; i < allaTavola; i++) state.tavola.push(state.cards[state.next++]);
}

// §2.2. Shuffle, three each and four up, redealing while the table shows three
// re or more. `state` is mutated, as in Discola, and returned for convenience.
function newDeal(state, rng){
  // Whoever did not deal the last one deals this one. On a cold start the
  // opponent deals, because the non-dealer plays first and §2.2 says you lead
  // the first deal — the same way round as Discola and Tressette.
  state.mazziere = state.mazziere === undefined || state.mazziere === null
    ? ALTO : altro(state.mazziere);

  // The redeal is a reshuffle from the same rng, so a seed still names one
  // deal — it names the whole sequence of shuffles the seed produces, and the
  // deal that survives the rule is the one it names.
  for (;;){
    state.cards = mescola(buildDeck(), rng);
    state.next = 0;
    state.tavola = [];
    state.hands = [null, null];
    daiCarte(state, 3, 4);
    if (state.tavola.filter(c => c.n === 10).length < REDEAL_RE) break;
  }

  state.prese = [[], []];
  state.scope = [0, 0];
  state.ultimaPresa = null;
  state.giro = 0;
  state.plays = 0;
  state.over = false;
  state.dealt = true;
  state.selected = null;
  state.scelta = 0;
  state.deveGiocare = altro(state.mazziere);
  return state;
}

// §2.2. The next round of three each, dealt when both hands are empty and the
// deck still holds cards. Nothing more goes to the table after the deal.
function distribuisci(state){
  if (state.next >= state.cards.length) throw new Error("the deck is empty");
  daiCarte(state, 3, 0);
  state.giro++;
  // The non-dealer plays first in every round, which is what makes the dealer
  // play the last card of the round and of the deal.
  state.deveGiocare = altro(state.mazziere);
  return state;
}

/* --- what a card can take --------------------------------------------------- */

// §2.3. Every legal capture for `card` against `tavola`, as a list of index
// sets. Empty means the card takes nothing and is laid down.
//
// Single before sum: if any card on the table has the same value, the capture
// is one of those and no sum is offered — a 7 onto 7, 4 and 3 takes the 7.
// Otherwise every set of two or more summing to the value is offered, and the
// choice is the player's.
//
// The sets come out in the table's own order — lexicographic by index, so the
// set containing the earliest card comes first. §3.7 shows the first of them
// as the proposal, and "first" has to mean something the table itself decides
// rather than an opinion about which capture is best.
function prese(tavola, card){
  const v = valore(card.n);

  // §0 decision 4: off, and read here so that turning it on is one line. An
  // asso takes the whole table and there is no other capture to choose from.
  if (ASSO_PIGLIA_TUTTO && card.n === 1 && tavola.length)
    return [tavola.map((_, i) => i)];

  const singles = [];
  for (let i = 0; i < tavola.length; i++)
    if (valore(tavola[i].n) === v) singles.push([i]);
  if (SINGLE_BEFORE_SUM && singles.length) return singles;

  const sums = [];
  const take = (from, chosen, left) => {
    if (left === 0){
      if (chosen.length >= 2) sums.push(chosen.slice());
      return;
    }
    for (let i = from; i < tavola.length; i++){
      const w = valore(tavola[i].n);
      if (w > left) continue;          // no card is worth 0, so this only prunes
      chosen.push(i);
      take(i + 1, chosen, left - w);
      chosen.pop();
    }
  };
  take(0, [], v);

  // Without SINGLE_BEFORE_SUM a single equal card is just a one-card sum, and
  // the recursion above skips those, so they are put back here.
  return SINGLE_BEFORE_SUM ? sums : singles.concat(sums);
}

const sameSet = (a, b) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/* --- a play ----------------------------------------------------------------- */

// §2.3. Play the card in `slot`, taking `presa` — one of the index sets that
// prese() returned for it, or empty to lay the card down. Throws on an
// illegal play, because every caller here is code: the page offers only what
// the rules allow and the harness asks prese() first, so an illegal play is a
// bug rather than a player's mistake.
//
// Returns what the table has to show for it: the cards captured, whether it
// was a scopa, and the leftovers if this was the last play of the deal.
function gioca(state, who, slot, presa){
  if (state.over) throw new Error("the deal is over");
  if (who !== state.deveGiocare) throw new Error("not this player's turn");

  const card = state.hands[who][slot];
  if (!card) throw new Error(`slot ${slot} holds no card`);

  const options = prese(state.tavola, card);
  const chosen = presa ? presa.slice().sort((a, b) => a - b) : [];

  if (options.length === 0){
    if (chosen.length) throw new Error("this card takes nothing");
  } else if (chosen.length === 0){
    // §2.3. The compulsion is on the card, not on the choice of card: having
    // played one that can take, the player takes.
    if (PRESA_OBBLIGATORIA) throw new Error("this card must take");
  } else if (!options.some(set => sameSet(set, chosen))){
    // Not "does it sum correctly" — it has to be one of the captures the rules
    // actually offer, or single-before-sum could be walked around by naming a
    // sum that adds up.
    throw new Error("that is not one of this card's captures");
  }

  state.hands[who][slot] = null;
  state.plays++;
  const ultima = state.plays === 36;

  let taken = [];
  let scopa = false;
  if (chosen.length){
    // Descending, so each splice leaves the lower indices where they were.
    for (const i of chosen.slice().sort((a, b) => b - a))
      taken.unshift(state.tavola.splice(i, 1)[0]);
    state.prese[who].push(card, ...taken);
    state.ultimaPresa = who;
    // §2.3. A sweep is a point, except with the last card of the deal — and
    // except when it was an asso under ASSO_PIGLIA_TUTTO, where the sweep is
    // the variant's whole point rather than an achievement. Scoring it would
    // hand out about four free points a deal, which is not the rule anybody
    // plays. Off by default, so this reads as `true` in the game as played.
    const perAsso = ASSO_PIGLIA_TUTTO && card.n === 1;
    if (state.tavola.length === 0 && (SCOPA_ULTIMA || !ultima) && !perAsso){
      state.scope[who]++;
      scopa = true;
    }
  } else {
    state.tavola.push(card);
  }

  let resto = [], nuovoGiro = false;
  if (ultima){
    // §2.3. Whatever is left goes to whoever captured last. That is not a
    // scopa, and if nobody ever captured it stays on the table — which the
    // rules of a 36-play deal cannot actually produce, but a rule that reads
    // "give it to null" would be a silent way to lose cards.
    if (state.ultimaPresa !== null && state.tavola.length){
      resto = state.tavola.splice(0, state.tavola.length);
      state.prese[state.ultimaPresa].push(...resto);
    }
    state.over = true;
    state.deveGiocare = null;
  } else if (state.hands[BASSO].every(c => !c) && state.hands[ALTO].every(c => !c)){
    // The next round is dealt here rather than left to the caller. A deal
    // sitting with two empty hands and nobody dealing is a state this engine
    // can reach and nothing detects, and §3.5's flow has the same step in it.
    //
    // It is reported, because the page needs to know. Both hands are empty for
    // a beat between rounds — §4 iteration 3 names that as one of the states
    // the check has to put the page in — and after this call the state no
    // longer shows it. `nuovoGiro` is how the page knows to draw the beat
    // before the new hand, without inferring it from `plays % 6`.
    distribuisci(state);
    nuovoGiro = true;
  } else {
    state.deveGiocare = altro(who);
  }

  return { card, presa: taken, scopa, ultima, resto, nuovoGiro };
}

/* --- the score -------------------------------------------------------------- */

const conta = (pile, f) => pile.reduce((n, c) => n + (f(c) ? 1 : 0), 0);

// More than half takes the point; an even split gives it to nobody. §2.4.
function piuDi(a, b){
  if (a === b) return null;
  return a > b ? BASSO : ALTO;
}

// §2.4. The best card of each suit by primiera value, summed. A player holding
// no card of some suit cannot take the point at all — and if neither holds all
// four, nobody does.
function primieraTotale(pile){
  const best = [0, 0, 0, 0];
  for (const c of pile)
    if (primiera(c.n) > best[c.s]) best[c.s] = primiera(c.n);
  if (best.some(v => v === 0)) return null;      // a suit missing: no point
  return best.reduce((a, b) => a + b, 0);
}

function puntoPrimiera(piles){
  const totals = piles.map(primieraTotale);
  if (totals[BASSO] === null && totals[ALTO] === null) return null;
  if (totals[ALTO] === null) return BASSO;
  if (totals[BASSO] === null) return ALTO;
  return piuDi(totals[BASSO], totals[ALTO]);
}

// §2.4. Four points and the scope. Each of the four goes to one player or to
// nobody; a tie in carte, denari or primiera is nobody's.
function scoreDeal(state){
  const piles = state.prese;

  const carte      = piuDi(piles[BASSO].length, piles[ALTO].length);
  const denari     = piuDi(conta(piles[BASSO], c => c.s === DENARI),
                           conta(piles[ALTO],  c => c.s === DENARI));
  const settebello = piles[BASSO].some(isSettebello) ? BASSO
                   : piles[ALTO].some(isSettebello)  ? ALTO : null;
  const primieraP  = puntoPrimiera(piles);

  const punti = [0, 0];
  for (const p of [carte, denari, settebello, primieraP])
    if (p !== null) punti[p]++;
  punti[BASSO] += state.scope[BASSO];
  punti[ALTO]  += state.scope[ALTO];

  const out = { carte, denari, settebello, primiera: primieraP,
                scope: state.scope.slice(), punti };

  // §0 decision 4: off, and read here so that turning it on is one line.
  if (NAPOLA){
    for (const who of [BASSO, ALTO])
      if ([1, 2, 3].every(n => piles[who].some(c => c.s === DENARI && c.n === n))){
        out.napola = who;
        punti[who] += 3;
      }
  }
  if (RE_BELLO){
    const re = piles[BASSO].some(c => c.s === DENARI && c.n === 10) ? BASSO
             : piles[ALTO].some(c => c.s === DENARI && c.n === 10)  ? ALTO : null;
    if (re !== null){ out.reBello = re; punti[re]++; }
  }
  return out;
}

// §2.5. The higher total wins. Unlike Tressette's eleven, this total can tie —
// two points each and no scope is a common draw — and a draw is recorded, as
// Discola records 60-60.
function vincitore(state){
  const { punti } = scoreDeal(state);
  if (punti[BASSO] === punti[ALTO]) return null;
  return punti[BASSO] > punti[ALTO] ? BASSO : ALTO;
}

/* --- the surface ------------------------------------------------------------ */

// The page gets these from the classic script; Node's vm.runInThisContext does
// not hand out const bindings, so name them once, here, for both.
Object.assign(globalThis, {
  SUITS, DENARI, BASSO, ALTO, altro,
  valore, primiera, isSettebello, buildDeck, mescola, rngSeed,
  PRESA_OBBLIGATORIA, SINGLE_BEFORE_SUM, SCOPA_ULTIMA, REDEAL_RE,
  ASSO_PIGLIA_TUTTO, NAPOLA, RE_BELLO,
  ordina, newDeal, distribuisci, prese, gioca,
  scoreDeal, vincitore, primieraTotale
});
