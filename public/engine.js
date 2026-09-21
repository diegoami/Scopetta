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

   The rules are §2's; the opponent below them is §3.4's, one formula over five
   weights for five rounds and an exact search in the sixth.
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

/* --- what the player to move knows ------------------------------------------ */

// §3.4. Every card not in my hand, not on the table and in neither pile: the
// deck and their hand together. There is no `seen` list in this game because
// there is nothing to remember — everything but the deck and the other hand is
// face up, so what the opponent has not seen is derived rather than tracked,
// and the engine gives it nothing a human could not count.
function fuori(state, me){
  const known = new Set();
  const mark = c => known.add(c.s * 16 + c.n);
  for (const c of state.hands[me]) if (c) mark(c);
  for (const c of state.tavola) mark(c);
  for (const c of state.prese[BASSO]) mark(c);
  for (const c of state.prese[ALTO]) mark(c);

  const out = [];
  for (let s = 0; s < 4; s++)
    for (let n = 1; n <= 10; n++)
      if (!known.has(s * 16 + n)) out.push({ s, n });
  return out;
}

// §3.4. The chance they hold at least one card of value `v`, hypergeometric and
// exact: 1 − C(U − k, h) / C(U, h), where U is how many cards are unseen, k how
// many of them have that value, and h how many they hold.
//
// As a running product rather than three factorials: the ratio is
// (U−k)(U−k−1)…/(U)(U−1)…, h terms, which never leaves the range of a double.
//
// This sharpens on its own as the deal goes — in the first round U is 33, in
// the sixth it is h and the answer is 0 or 1 — which is why §3.4 has no `late`
// factor. Tressette needed one because a control card's certainty grew as the
// tallone emptied; here this term already is that certainty.
function pHold(U, k, h){
  if (k <= 0 || h <= 0) return 0;
  if (U - k < h) return 1;
  let ratio = 1;
  for (let i = 0; i < h; i++) ratio *= (U - k - i) / (U - i);
  return 1 - ratio;
}

/* --- the opponent ----------------------------------------------------------- */

// §3.4. **Six.** The plan proposed seven and said the ladder would decide. It
// decided one of them: SCOPA_BONUS could not move a play at any magnitude —
// 0.04% of decisions over 6,000 deals, and 0.01% at a value of 1000 — so it is
// gone, and that is a measurement rather than an argument. Restoring it at 8 or
// 25 and comparing paired on the same deals gives -0.03% and +0.03% of score
// rate, z = -1.41 and +0.47: nothing.
//
// SETTEBELLO_BONUS was cut with it and has been put back, which is the more
// useful half of the story. The ladder said 0.41%, under §4's 1% bar, and the
// reason given for cutting it was that "the settebello is already the highest
// card `worth` knows". That was false. `bestMine` is per suit, so once a decent
// denaro is in the pile the settebello's primiera gain collapses while a seven
// of a bare suit keeps its whole 21: with a 6 of denari taken, worth(7 denari)
// is 4.2 and worth(7 bastoni) is 9.4, and the engine declined the settebello in
// §3.4's own first trap. In self-play the settebello was capturable in 652
// positions with a real choice and declined in 44 of them, 6.75%.
//
// **So §4's 1% rule has an exception, and it is worth writing down**: the rule
// is a proxy for "cannot change the outcome", and the proxy fails when a point
// is concentrated in a single card. Few plays, high stakes each. Measured
// paired on the same deals against the same opponent, restoring the term is
// worth +0.40% and +0.62% of score rate on two held-out ranges (z = 2.69 and
// 3.40) and +1.33% and +1.27% on the settebello point itself (z = 6.37, 6.04).
// An unpaired comparison cannot see it: two vectors differing on 0.1% of plays
// differ on about 1.3% of deals, so the noise is shared and cancels only under
// pairing.
//
// Discola had twelve weights and Tressette eleven because their formulas had
// that many live terms. Six is what this one has.
const WEIGHT_KEYS = [
  "CARTE_WEIGHT",        // a card is a card, toward the carte point
  "DENARI_WEIGHT",       // a denaro is worth more, toward the denari point
  "SETTEBELLO_BONUS",    // the settebello is a point on its own, and one card
  "PRIMIERA_WEIGHT",     // a high card in a suit I am weak in, toward primiera
  "SCOPA_RISK_PENALTY",  // leaving a table they can sweep, by the chance of it
  "GIFT_FACTOR",         // leaving cards they can pair, by worth and by chance
  "TEMPO_BONUS",         // keeping a sweep alive for my next turn (§4's tempo question)
];

// How many hands to guess at for the tempo term. Six: the gain is already
// there at six and barely moves at sixteen (+1.47/+1.97 against +1.63/+2.28),
// and six is what fits the page's budget.
const TEMPO_SAMPLES = 6;

function weights(values){
  const P = {};
  WEIGHT_KEYS.forEach((k, i) => { P[k] = values[i]; });
  return P;
}

// The roster: §0 decision 5, and iteration 5's measurement. Three fixed
// vectors, one name each, and Piero rolled once per session. Values are in
// WEIGHT_KEYS order:
//   CARTE, DENARI, SETTEBELLO, PRIMIERA, SCOPA_RISK, GIFT, TEMPO
//
// The plan guessed the two risk terms would make four corners. They do not:
// GIFT_FACTOR=0 is 55.8% against greedy-take, under §3.4's 57.7 floor, and the
// risk corners leave Graziano 1.78% from Piero — two names, one player. What
// separates players and keeps them strong is the two value weights and the
// cautious corner. The measurement is in PLAN.md §3.4 and the iteration's PR.
const FRANCO_WEIGHTS = weights([1, 2, 6, 0.4, 6, 0.5, 5]);

// Graziano is the value-hunter: carte and denari both priced high, so he plays
// to take and does not much mind what he leaves. 60.2% / 78.8% against
// greedy-take / random-legal on seeds 20001+, 7.1% of the decisions the weights
// make away from Franco.
const GRAZIANO_WEIGHTS = weights([4, 8, 6, 0.4, 6, 0.5, 5]);

// Valerio plays the card count and treats a denaro like any other card
// (DENARI 0). The settebello is still a point on its own and keeps its bonus, so
// what he ignores is the denari POINT, not the card. 59.4% / 78.8% on seeds
// 20001+, 8.4% away from Franco.
const VALERIO_WEIGHTS = weights([1, 0, 6, 0.4, 6, 0.5, 5]);

// Piero is rolled once per session, as Discola's was — a house tradition, not a
// Delphi accident. His corner is the cautious one, the opposite of Graziano's
// value-hunting: he leaves nothing cheap, weights a high card in a suit he is
// weak in, and fears a sweepable table. The bands hold the corner; the three
// values are drawn, and the other four stay Franco's so that every roll is a
// strong player and none lands on Franco, Graziano or Valerio.
const PIERO_STANCE = {
  GIFT_FACTOR: [1.7, 2.5],
  PRIMIERA_WEIGHT: [1.5, 2.1],
  SCOPA_RISK_PENALTY: [22, 30],
};
function rollPiero(rng){
  const P = { ...FRANCO_WEIGHTS };
  for (const k in PIERO_STANCE){
    const [a, b] = PIERO_STANCE[k];
    P[k] = a + (b - a) * rng();
  }
  return P;
}

function rollProfiles(rng){
  return { Franco: FRANCO_WEIGHTS, Graziano: GRAZIANO_WEIGHTS,
           Valerio: VALERIO_WEIGHTS, Piero: rollPiero(rng) };
}

// §3.4, the one quantity every term is built from. `mine` is my captured pile:
// primiera is scored from what has been taken, so a card's primiera worth is
// only what it adds to the best I already hold in its suit — and a card of a
// suit I hold none of is worth its whole primiera value, because without one I
// cannot take the point at all.
function worth(c, bestMine, P){
  let w = P.CARTE_WEIGHT;
  if (c.s === DENARI) w += P.DENARI_WEIGHT;
  // The settebello is a whole point living in one card, and the terms above do
  // not cover it: `bestMine` is per suit, so its primiera gain vanishes as soon
  // as any decent denaro is in the pile. See WEIGHT_KEYS.
  if (isSettebello(c)) w += P.SETTEBELLO_BONUS;
  const gain = primiera(c.n) - bestMine[c.s];
  if (gain > 0) w += gain * P.PRIMIERA_WEIGHT;
  return w;
}

function bestPrimieraHeld(pile){
  const best = [0, 0, 0, 0];
  for (const c of pile) if (primiera(c.n) > best[c.s]) best[c.s] = primiera(c.n);
  return best;
}

// Every legal play in this position, as {slot, presa} — each card in hand times
// each of its captures, or the card laid down. The order is the order ties are
// broken in: lowest slot first, and within a slot the captures in prese()'s
// own order. §3.4.
function mosse(state, who){
  const out = [];
  const hand = state.hands[who];
  for (let slot = 0; slot < hand.length; slot++){
    if (!hand[slot]) continue;
    const opts = prese(state.tavola, hand[slot]);
    if (opts.length) for (const presa of opts) out.push({ slot, presa });
    else out.push({ slot, presa: [] });
  }
  return out;
}

// §3.4. Score one play: what it takes, then what it leaves.
function valutaMossa(state, who, mossa, P, ctx){
  const card = state.hands[who][mossa.slot];
  let score = 0;

  const taking = new Set(mossa.presa);
  if (mossa.presa.length){
    score += worth(card, ctx.bestMine, P);
    for (const i of mossa.presa) score += worth(state.tavola[i], ctx.bestMine, P);
    // No scopa bonus: a sweep takes every card on the table, so it already
    // scores the most this term can give and leaves nothing for the gift term
    // below to take away. It wins on its own. Measured — see WEIGHT_KEYS.
  }

  // The table this play leaves behind. A card laid down is part of it, which is
  // why laying the settebello costs its whole gift without a rule saying "do
  // not lay the settebello"; a capture removes its cards from it, which is why
  // taking the settebello is worth both the capture and the gift it stops being.
  const resta = [];
  for (let i = 0; i < state.tavola.length; i++)
    if (!taking.has(i)) resta.push(state.tavola[i]);
  if (!mossa.presa.length) resta.push(card);

  // Their hand after this play: they hold `h`, drawn from the `U` I cannot see.
  // My own played card leaves my hand, so it is no longer hidden from me — but
  // it was never in `fuori` to begin with.
  const U = ctx.fuoriCount, h = ctx.theirCards;

  const somma = resta.reduce((a, c) => a + valore(c.n), 0);
  if (somma > 0 && somma <= 10)
    score -= P.SCOPA_RISK_PENALTY * pHold(U, ctx.outstanding[somma], h);

  // The gift term approximates their capture by a pair, not by a sum: a sum
  // needs two or more of their three cards to be exactly the right ones, and
  // that is the search's business rather than the formula's.
  for (const c of resta)
    score -= P.GIFT_FACTOR * worth(c, ctx.bestMine, P) * pHold(U, ctx.outstanding[valore(c.n)], h);

  return score;
}

// §4's tempo question, answered yes and built. "Does the opponent lay low cards
// into a table it could have swept next turn had it waited?" — measured, it
// gave up such a chance in about half the positions that offered one, and a
// term that prices them is worth +1.5% to +2.3% of score rate on two held-out
// ranges (z = 3.0 and 4.2), paired on the same deals.
//
// **It may not look at their hand.** §3.4's whole knowledge section exists
// because the engine gives the opponent nothing a human could not count, and a
// 2-ply term that copies the state and replies with their real cards is
// cheating. Measured, that cheat is worth +1.9% to +3.4% — so the cheat is
// where most of the apparent gain lives, and a term built on it would have
// looked better and been illegitimate.
//
// The honest version guesses. It draws TEMPO_SAMPLES plausible hands from
// `fuori`, plays each out one ply — my play, their reply by this same formula —
// and scores the fraction of them in which I am left holding a sweep. A cheaper
// proxy with no opponent model at all, "does a card I still hold sweep what
// this play leaves", is worth nothing measurable (z = -0.15 to +0.86): the gain
// comes from the reply, not from the table.
//
// The samples are a deterministic spread rather than a random draw, because the
// golden fixture freezes the play and a fixture that depends on an rng the page
// does not share is not a fixture.
function tempoShare(state, me, mossa, hidden, P){
  const h = state.hands[altro(me)].filter(c => c).length;
  const mine = state.hands[me].filter(c => c).length;
  if (!h || hidden.length < h) return 0;

  // If this play and their reply end the round, my next turn begins with three
  // cards I cannot know, so the question has no answer and the honest one is
  // "no information" rather than a guess at cards the engine may not see. It
  // also keeps `gioca` from dealing a round inside a hypothetical, which it
  // would otherwise do — correctly, and from a deck the engine must not read.
  if (mine <= 1 && h <= 1) return 0;

  let hits = 0;
  for (let k = 0; k < TEMPO_SAMPLES; k++){
    const pick = [], used = new Set();
    for (let j = 0; j < h; j++){
      let idx = (k * 7 + j * 13 + 3) % hidden.length;
      while (used.has(idx)) idx = (idx + 1) % hidden.length;
      used.add(idx); pick.push(hidden[idx]);
    }
    const st = cloneState(state);
    st.hands[altro(me)] = ordina(pick.map(c => ({ ...c })));
    gioca(st, me, mossa.slot, mossa.presa);
    if (st.over || st.deveGiocare === me) continue;
    const reply = compGioca(st, P, 1);  // depth 1: their reply prices no tempo
    if (!reply) continue;
    gioca(st, st.deveGiocare, reply.slot, reply.presa);
    if (st.over || st.deveGiocare !== me || !st.tavola.length) continue;
    if (mosse(st, me).some(x => x.presa.length === st.tavola.length)) hits++;
  }
  return hits / TEMPO_SAMPLES;
}

/* --- the sixth round, played out exactly ------------------------------------ */

// §3.4. From this round on the deck is empty and `fuori` is their hand exactly,
// so there is nothing left to guess: the position is enumerated and played to
// the end of the deal with the real `gioca`, and the leaf is scored with the
// real `scoreDeal`. That is what lets it know that taking one worthless card on
// the 35th play is worth the whole table on the 36th.
//
// All four opponents play these six cards alike, which is also why those
// decisions are not in the denominator when the roster is measured for
// difference: there is nothing there for a weight to change.
const CODA_FROM = 5;

function cloneState(state){
  return {
    cards: state.cards, next: state.next,
    hands: [state.hands[BASSO].slice(), state.hands[ALTO].slice()],
    tavola: state.tavola.slice(),
    prese: [state.prese[BASSO].slice(), state.prese[ALTO].slice()],
    scope: state.scope.slice(),
    ultimaPresa: state.ultimaPresa, mazziere: state.mazziere,
    deveGiocare: state.deveGiocare, giro: state.giro, plays: state.plays,
    over: state.over
  };
}

// My points minus theirs at the end of the deal, playing both sides perfectly.
function codaValore(state, me){
  if (state.over){
    const { punti } = scoreDeal(state);
    return punti[me] - punti[altro(me)];
  }
  const who = state.deveGiocare;
  let best = null;
  for (const m of mosse(state, who)){
    const next = cloneState(state);
    gioca(next, who, m.slot, m.presa);
    const v = codaValore(next, me);
    if (best === null || (who === me ? v > best : v < best)) best = v;
  }
  // Unreachable while a player to move has a card, and a deal that is not over
  // always has one. It returns rather than throwing because the search is not
  // the place to discover it.
  return best === null ? 0 : best;
}

function coda(state, me){
  let best = null, bestValue = -Infinity;
  for (const m of mosse(state, me)){
    const next = cloneState(state);
    gioca(next, me, m.slot, m.presa);
    const v = codaValore(next, me);
    // Ties to the lowest slot and then to the first capture, which is the order
    // mosse() returns them in. Do not "optimise" this by taking >= : the golden
    // fixture freezes which card gets played.
    if (v > bestValue){ bestValue = v; best = m; }
  }
  return best;
}

/* --- the play ---------------------------------------------------------------- */

// §3.4. Two branches. For five rounds, score every legal play with the
// profile's weights and make the highest. In the sixth, where nothing is
// hidden, play it out exactly.
function compGioca(state, P, depth = 0){
  const me = state.deveGiocare;
  const hidden = fuori(state, me);
  const theirCards = state.hands[altro(me)].filter(c => c).length;

  // The search, when the position really is deducible. It refuses what it
  // cannot deduce: if `fuori` is not the size of their hand there is still a
  // deck, and the formula answers instead. As in Tressette.
  if (state.giro >= CODA_FROM && hidden.length === theirCards && theirCards > 0){
    const known = cloneState(state);
    // Their hand, deduced. Slots do not matter to the search — it enumerates
    // every card — but the array has to be the shape gioca expects.
    known.hands[altro(me)] = ordina(hidden.slice());
    const m = coda(known, me);
    if (m) return { slot: m.slot, presa: m.presa };
  }

  const outstanding = new Array(11).fill(0);
  for (const c of hidden) outstanding[valore(c.n)]++;

  const ctx = {
    bestMine: bestPrimieraHeld(state.prese[me]),
    fuoriCount: hidden.length,
    theirCards,
    outstanding
  };

  let best = null, bestScore = -Infinity;
  for (const m of mosse(state, me)){
    let score = valutaMossa(state, me, m, P, ctx);
    // The tempo term, at the root only: inside a guess the opponent answers
    // without pricing tempo of its own, which is what stops this recursing.
    if (depth === 0 && P.TEMPO_BONUS)
      score += P.TEMPO_BONUS * tempoShare(state, me, m, hidden, P);
    if (score > bestScore){ bestScore = score; best = m; }
  }
  return best ? { slot: best.slot, presa: best.presa } : null;
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
  scoreDeal, vincitore, primieraTotale,
  WEIGHT_KEYS, weights, rollProfiles, compGioca, TEMPO_SAMPLES, tempoShare,
  fuori, pHold, worth, bestPrimieraHeld, mosse, valutaMossa, CODA_FROM, coda
});
