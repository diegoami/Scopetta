// Headless Scopa: profile against profile, profile against baselines, and the
// measurements §4 iteration 2 asks for before the formula freezes.
//
//   node tools/selfplay.mjs --probe              the questions §4 asks
//   node tools/selfplay.mjs --ladder KEY 1,2,3   what one weight costs and buys
//   node tools/selfplay.mjs --ladder-all         every weight across its range
//   node tools/selfplay.mjs --try KEY=V,KEY=V    a whole candidate at once
//   node tools/selfplay.mjs --differ 200         how often two profiles differ
//   node tools/selfplay.mjs --tempo 400          the tempo question
//   node tools/selfplay.mjs --fifth 200          what the fifth round would cost
//   node tools/selfplay.mjs --golden > tools/golden.json
//
// Forked from Tressette's at dec1c74 — the mirrored seeds, the noise floor, the
// shape of the ladder — and changed where Scopa is a different game. No
// dependencies; it runs the same engine.js the page runs.
//
// SEED_FROM=5001 picks a different range, which is how a figure gets measured
// on seeds no tuning ever saw.

import { readFileSync } from "node:fs";
import { runInThisContext } from "node:vm";
import { fileURLToPath } from "node:url";

const ENGINE = fileURLToPath(new URL("../public/engine.js", import.meta.url));
runInThisContext(readFileSync(ENGINE, "utf8"));

const { BASSO, ALTO, altro, valore, primiera, isSettebello, DENARI,
        rngSeed, newDeal, prese, gioca, scoreDeal,
        WEIGHT_KEYS, weights, rollProfiles, compGioca,
        fuori, mosse, CODA_FROM, ordina } = globalThis;

const PROFILES = rollProfiles(rngSeed(1));
const FRANCO = PROFILES.Franco;

/* ---- the players ----------------------------------------------------------- */

const randomLegal = (state, rng) => {
  const m = mosse(state, state.deveGiocare);
  return m[Math.floor(rng() * m.length)];
};

// §3.4's baseline: make a scopa if it can, else the capture with the most
// cards, ties to the most denari, else lay the card of least worth. It never
// looks at what it leaves behind, which is the habit a real opponent has to
// beat.
const greedyTake = state => {
  const who = state.deveGiocare;
  const all = mosse(state, who);
  const takes = all.filter(m => m.presa.length);
  if (!takes.length){
    // Lay the least valuable card: fewest denari, then lowest primiera.
    let best = all[0], bestKey = Infinity;
    for (const m of all){
      const c = state.hands[who][m.slot];
      const key = (c.s === DENARI ? 100 : 0) + (isSettebello(c) ? 1000 : 0) + primiera(c.n);
      if (key < bestKey){ bestKey = key; best = m; }
    }
    return best;
  }
  let best = takes[0], bestKey = null;
  for (const m of takes){
    const cards = state.hands[who][m.slot];
    const caught = m.presa.map(i => state.tavola[i]);
    const scopa = m.presa.length === state.tavola.length ? 1 : 0;
    const denari = caught.filter(c => c.s === DENARI).length + (cards.s === DENARI ? 1 : 0);
    const key = [scopa, m.presa.length, denari];
    if (bestKey === null || key[0] > bestKey[0]
        || (key[0] === bestKey[0] && key[1] > bestKey[1])
        || (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] > bestKey[2])){
      bestKey = key; best = m;
    }
  }
  return best;
};

const profile = P => state => compGioca(state, P);

const PLAYERS = {
  random: randomLegal,
  greedy: greedyTake,
  franco: profile(FRANCO),
};

/* ---- one deal -------------------------------------------------------------- */

// `watch` is called before every play, with the state and whose turn it is, so
// a measurement can look at the position the player is about to decide from.
function playDeal(seed, basso, alto, watch){
  const rng = rngSeed(seed);
  const s = newDeal({}, rng);
  while (!s.over){
    const who = s.deveGiocare;
    if (watch) watch(s, who);
    const m = (who === BASSO ? basso : alto)(s, rng);
    gioca(s, who, m.slot, m.presa);
  }
  return scoreDeal(s).punti;
}

const SEED_FROM = Number(process.env.SEED_FROM ?? 1);

// Mirrored seeds: every deal is played twice, once from each seat, so the
// advantage of leading is shared out rather than measured.
function match(n, a, b, watch){
  let wins = 0, losses = 0, draws = 0, points = 0, deals = 0;
  for (let seed = SEED_FROM; seed < SEED_FROM + n; seed++){
    for (const aIsBasso of [true, false]){
      const punti = aIsBasso
        ? playDeal(seed, PLAYERS[a], PLAYERS[b], watch)
        : playDeal(seed, PLAYERS[b], PLAYERS[a], watch);
      const mine = aIsBasso ? punti[BASSO] : punti[ALTO];
      const theirs = aIsBasso ? punti[ALTO] : punti[BASSO];
      points += mine; deals++;
      if (mine > theirs) wins++; else if (mine < theirs) losses++; else draws++;
    }
  }
  return { a, b, deals, wins, losses, draws, points };
}

// The noise floor: how far a rate can wander on this many deals before it means
// anything. A draw is common in Scopa — §2.4 — so the headline number is the
// score rate, wins plus half the draws, which is what a win rate means when a
// third of deals are drawn.
const floor95 = (p, n) => 1.96 * Math.sqrt(p * (1 - p) / n);
const scoreRate = r => (r.wins + r.draws / 2) / r.deals;

function report(r){
  const rate = scoreRate(r);
  console.log(
    `${r.a} vs ${r.b}`.padEnd(20) +
    `${(100 * rate).toFixed(1)}%`.padStart(7) + ` ± ${(100 * floor95(rate, r.deals)).toFixed(1)}` +
    `   won ${r.wins} lost ${r.losses} drew ${r.draws}` +
    `   ${(r.points / r.deals).toFixed(2)} points/deal   ${r.deals} deals`);
  return rate;
}

/* ---- the decisions the weights actually make -------------------------------- */

// The denominator §3.4 insists on. A position counts only if the weights could
// have changed the play: more than one legal play, and before the search takes
// over. Tressette's first metric counted its searched tricks and printed every
// difference 1.45 times too small.
//
// "More than one legal play" is not "more than one card" in this game: one card
// with two captures is a decision too, and counting cards alone would understate
// every difference the same way Tressette's did.
const isDecision = (state, who) =>
  state.giro < CODA_FROM && mosse(state, who).length > 1;

const sameMove = (a, b) =>
  a && b && a.slot === b.slot && a.presa.length === b.presa.length
  && a.presa.every((x, i) => x === b.presa[i]);

/* ---- what each weight costs, and what it buys -------------------------------- */

function ladder(key, values, n){
  console.log(`\n${key}, from Franco's ${FRANCO[key]}, ${n} seeds mirrored\n`);
  console.log("  value   vs greedy   differs from Franco");
  const rows = [];
  for (const v of values){
    const P = { ...FRANCO, [key]: v };
    PLAYERS.__try = profile(P);
    let differs = 0, decisions = 0;
    const watch = (state, who) => {
      if (!isDecision(state, who)) return;
      decisions++;
      if (!sameMove(compGioca(state, P), compGioca(state, FRANCO))) differs++;
    };
    const r = match(n, "__try", "greedy", watch);
    const rate = scoreRate(r);
    const pct = decisions ? 100 * differs / decisions : 0;
    rows.push({ v, rate, pct, differs, decisions });
    console.log(`  ${String(v).padStart(6)}   ${(100 * rate).toFixed(1)}%`.padEnd(21) +
                `${pct.toFixed(2)}%  (${differs} of ${decisions})`);
  }
  return rows;
}

// Every weight across a range around Franco's value, including any set to zero
// — which is the hole Tressette's ladder had, and the reason its roster was
// wrong for an iteration.
const RANGES = {
  CARTE_WEIGHT:       [0, 0.5, 1, 2, 4],
  DENARI_WEIGHT:      [0, 1, 2, 4, 8],
  PRIMIERA_WEIGHT:    [0, 0.2, 0.4, 0.8, 1.6],
  SCOPA_RISK_PENALTY: [0, 3, 6, 12, 24],
  GIFT_FACTOR:        [0, 0.25, 0.5, 1, 2],
};

function ladderAll(n){
  const summary = [];
  for (const key of WEIGHT_KEYS){
    const rows = ladder(key, RANGES[key], n);
    const most = rows.reduce((a, b) => (b.pct > a.pct ? b : a));
    summary.push({ key, most });
  }
  console.log(`\n  the most any value of each weight moves, over the decisions the weights make\n`);
  console.log("  weight                 moves   at value   vs greedy there");
  for (const { key, most } of summary)
    console.log(`  ${key.padEnd(20)} ${most.pct.toFixed(2)}%`.padEnd(32) +
                `${String(most.v).padStart(6)}     ${(100 * most.rate).toFixed(1)}%`);
  console.log(`\n  §4: under 1% at any value and the weight goes, before the settings sheet shows it.`);
  const dead = summary.filter(s => s.most.pct < 1);
  console.log(`  under 1%: ${dead.length ? dead.map(s => s.key).join(", ") : "none"}`);
}

function tryCandidate(spec, n){
  const P = { ...FRANCO };
  for (const pair of spec.split(",")){
    const [k, v] = pair.split("=");
    if (!WEIGHT_KEYS.includes(k)) throw new Error(`no such weight: ${k}`);
    P[k] = Number(v);
  }
  PLAYERS.__try = profile(P);
  console.log(`\n${spec}, ${n} seeds mirrored, from seed ${SEED_FROM}\n`);
  report(match(n, "__try", "greedy"));
  report(match(n, "__try", "random"));
  let differs = 0, decisions = 0;
  match(Math.min(n, 200), "__try", "greedy", (state, who) => {
    if (!isDecision(state, who)) return;
    decisions++;
    if (!sameMove(compGioca(state, P), compGioca(state, FRANCO))) differs++;
  });
  console.log(`  differs from Franco in ${(100 * differs / decisions).toFixed(2)}% of ${decisions} decisions`);
}

/* ---- the questions §4 asks before the freeze --------------------------------- */

function probe(n){
  console.log(`\nprobe, ${n} seeds mirrored, from seed ${SEED_FROM}\n`);
  report(match(n, "franco", "greedy"));
  report(match(n, "franco", "random"));
  report(match(n, "greedy", "random"));
  console.log("\n  the noise floor: two identical players, mirrored\n");
  PLAYERS.__same = profile({ ...FRANCO });
  report(match(n, "__same", "franco"));
}

// §4's tempo question: does the opponent lay low cards into a table it could
// have swept next turn had it waited? Counted as: it laid a card when some
// other legal play was a capture it declined, and on its next turn the table
// held a sweep it could no longer reach.
function tempo(n){
  let laidWithTakeAvailable = 0, lays = 0, decisions = 0;
  const watch = (state, who) => {
    if (state.giro >= CODA_FROM) return;
    const all = mosse(state, who);
    if (all.length < 2) return;
    decisions++;
    const m = compGioca(state, FRANCO);
    if (!m || m.presa.length) return;
    lays++;
    if (all.some(x => x.presa.length)) laidWithTakeAvailable++;
  };
  match(n, "franco", "greedy", watch);
  console.log(`\ntempo, ${n} seeds mirrored\n`);
  console.log(`  decisions with a real choice: ${decisions}`);
  console.log(`  Franco laid a card: ${lays} (${(100 * lays / decisions).toFixed(1)}%)`);
  console.log(`  of those, a capture was available and declined: ${laidWithTakeAvailable}` +
              ` (${(100 * laidWithTakeAvailable / Math.max(1, lays)).toFixed(1)}% of lays)`);
  console.log(`\n  A capture declined is only a defect if what it leaves is worse, so the`);
  console.log(`  question §4 actually asks is what the play leaves. That is the table below:`);
  console.log(`  how often the very next play sweeps what this one left behind.\n`);

  // The measurement the risk term exists for: a play is punished when the
  // opponent answers it with a scopa. Counted for each player against the same
  // adversary, so the two numbers can be compared.
  for (const [who, other] of [["franco", "greedy"], ["greedy", "franco"]]){
    let left = 0, swept = 0;
    for (let seed = SEED_FROM; seed < SEED_FROM + n; seed++){
      for (const firstIsA of [true, false]){
        const rng = rngSeed(seed);
        const st = newDeal({}, rng);
        while (!st.over){
          const w = st.deveGiocare;
          const mine = firstIsA ? (w === BASSO) : (w === ALTO);
          const m = (mine ? PLAYERS[who] : PLAYERS[other])(st, rng);
          gioca(st, w, m.slot, m.presa);
          if (mine && !st.over && st.tavola.length){
            left++;
            const reply = mosse(st, st.deveGiocare);
            if (reply.some(x => x.presa.length === st.tavola.length)) swept++;
          }
        }
      }
    }
    console.log(`  ${who.padEnd(8)} left a table the reply could sweep: ` +
                `${swept} of ${left}  (${(100 * swept / left).toFixed(2)}%)`);
  }
  console.log(`\n  A 2-ply term is the candidate only if the first number is not already`);
  console.log(`  well under the second — the 1-ply risk term is what makes the difference.`);
}

/* ---- what the fifth round would cost ----------------------------------------- */

// §3.4's named next move: the fifth round, where `fuori` is nine cards and their
// hand is three of them. Timed here rather than guessed at, worst case over the
// first decision of the round, against the 70ms budget Tressette set — because
// a hang once a deal is not a trade this game makes.
function combinations(arr, k){
  const out = [];
  const pick = (from, chosen) => {
    if (chosen.length === k){ out.push(chosen.slice()); return; }
    for (let i = from; i < arr.length; i++){ chosen.push(arr[i]); pick(i + 1, chosen); chosen.pop(); }
  };
  pick(0, []);
  return out;
}

function fifthCost(n, sample){
  const times = [];
  for (let seed = SEED_FROM; seed < SEED_FROM + n; seed++){
    const rng = rngSeed(seed);
    const s = newDeal({}, rng);
    let timed = false;
    while (!s.over){
      const who = s.deveGiocare;
      if (!timed && s.giro === 4){
        const hidden = fuori(s, who);
        const theirs = s.hands[altro(who)].filter(c => c).length;
        let hands = combinations(hidden, theirs);
        if (sample && hands.length > sample){
          const step = hands.length / sample;
          hands = Array.from({ length: sample }, (_, i) => hands[Math.floor(i * step)]);
        }
        const t = process.hrtime.bigint();
        // One determinisation is: assume that hand, then play the position out
        // exactly as the sixth-round search does. The remaining deck order is
        // what it is in this line, which is the cheap half of §3.4's estimate.
        for (const h of hands){
          const known = {
            cards: s.cards, next: s.next,
            hands: who === BASSO ? [s.hands[BASSO].slice(), ordina(h.slice())]
                                 : [ordina(h.slice()), s.hands[ALTO].slice()],
            tavola: s.tavola.slice(),
            prese: [s.prese[BASSO].slice(), s.prese[ALTO].slice()],
            scope: s.scope.slice(), ultimaPresa: s.ultimaPresa,
            mazziere: s.mazziere, deveGiocare: who, giro: s.giro,
            plays: s.plays, over: false
          };
          for (const m of mosse(known, who)) void m;
          globalThis.coda(known, who);
        }
        times.push(Number(process.hrtime.bigint() - t) / 1e6);
        timed = true;
      }
      const m = compGioca(s, FRANCO);
      gioca(s, who, m.slot, m.presa);
    }
  }
  times.sort((a, b) => a - b);
  const worst = times[times.length - 1];
  const median = times[Math.floor(times.length / 2)];
  console.log(`  ${sample ? `sample of ${sample}` : "every hand"}`.padEnd(20) +
              `worst ${worst.toFixed(1)}ms   median ${median.toFixed(1)}ms   over ${times.length} deals`);
  return worst;
}

function fifth(n){
  console.log(`\nthe fifth round, first decision of the round, ${n} deals\n`);
  const all = fifthCost(n, 0);
  const fifty = fifthCost(n, 50);
  console.log(`\n  §3.4's budget is a worst case near 70ms.`);
  console.log(`  every hand: ${all <= 70 ? "FITS" : "does not fit"}   sample of fifty: ${fifty <= 70 ? "FITS" : "does not fit"}`);
  console.log(`  CODA_FROM stays at ${CODA_FROM} unless one of these fits and the weights are re-laddered with it.`);
}

/* ---- do two profiles play differently? --------------------------------------- */

function differ(n, spec){
  const P = { ...FRANCO };
  for (const pair of spec.split(",")){ const [k, v] = pair.split("="); P[k] = Number(v); }
  let differs = 0, decisions = 0;
  match(n, "franco", "greedy", (state, who) => {
    if (!isDecision(state, who)) return;
    decisions++;
    if (!sameMove(compGioca(state, P), compGioca(state, FRANCO))) differs++;
  });
  console.log(`\n${spec} differs from Franco in ${(100 * differs / decisions).toFixed(2)}%` +
              ` of ${decisions} decisions, over ${n} seeds mirrored`);
}

/* ---- tuning ------------------------------------------------------------------ */

// Coordinate ascent against greedy-take: take each weight in turn, try every
// value in its range, keep the best, and go round again until nothing moves.
// It tunes on whatever SEED_FROM names, and the figures that matter are then
// measured somewhere else — §4 is explicit that a number measured on the seeds
// it was tuned on is not a measurement of anything.
function tune(n){
  let P = { ...FRANCO };
  console.log(`\ntuning against greedy-take on ${n} seeds from ${SEED_FROM}, mirrored\n`);
  const rateOf = Q => { PLAYERS.__try = profile(Q); return scoreRate(match(n, "__try", "greedy")); };
  let best = rateOf(P);
  console.log(`  start ${(100 * best).toFixed(2)}%   ${WEIGHT_KEYS.map(k => `${k}=${P[k]}`).join(" ")}`);

  for (let pass = 1; pass <= 4; pass++){
    let moved = false;
    for (const key of WEIGHT_KEYS){
      for (const v of RANGES[key]){
        if (v === P[key]) continue;
        const Q = { ...P, [key]: v };
        const r = rateOf(Q);
        if (r > best + 1e-9){ best = r; P = Q; moved = true; }
      }
    }
    console.log(`  pass ${pass}  ${(100 * best).toFixed(2)}%   ${WEIGHT_KEYS.map(k => `${k}=${P[k]}`).join(" ")}`);
    if (!moved) break;
  }
  console.log(`\n  verify elsewhere:\n    SEED_FROM=5001 node tools/selfplay.mjs --try ${WEIGHT_KEYS.map(k => `${k}=${P[k]}`).join(",")} 1500`);
  return P;
}

/* ---- the golden fixture ------------------------------------------------------ */

// Seeds 1..20, both seats compGioca with Franco's weights, every play frozen.
// Re-recorded only by `node tools/selfplay.mjs --golden > tools/golden.json`,
// and a change to the formula or to rngSeed invalidates it — which is the whole
// reason §3.4's contract says change a weight, not the formula, from v1.0.
function goldenFixture(){
  const deals = [];
  for (let seed = 1; seed <= 20; seed++){
    const rng = rngSeed(seed);
    const s = newDeal({}, rng);
    const plays = [];
    while (!s.over){
      const who = s.deveGiocare;
      const m = compGioca(s, FRANCO);
      const card = s.hands[who][m.slot];
      plays.push(`${who}:${card.s}-${card.n}:${m.presa.join(".")}`);
      gioca(s, who, m.slot, m.presa);
    }
    const r = scoreDeal(s);
    deals.push({ seed, mazziere: s.mazziere, plays,
                 punti: r.punti, scope: r.scope,
                 carte: r.carte, denari: r.denari,
                 settebello: r.settebello, primiera: r.primiera });
  }
  return { weights: FRANCO, codaFrom: CODA_FROM, deals };
}

/* ---- run --------------------------------------------------------------------- */

const argv = process.argv.slice(2);
const n = i => Number(argv[i] ?? 0);

if (argv[0] === "--probe") probe(n(1) || 1000);
else if (argv[0] === "--ladder") ladder(argv[1], argv[2].split(",").map(Number), n(3) || 500);
else if (argv[0] === "--ladder-all") ladderAll(n(1) || 500);
else if (argv[0] === "--try") tryCandidate(argv[1], n(2) || 1000);
else if (argv[0] === "--differ") differ(n(2) || 200, argv[1]);
else if (argv[0] === "--tempo") tempo(n(1) || 400);
else if (argv[0] === "--fifth") fifth(n(1) || 200);
else if (argv[0] === "--tune") tune(n(1) || 400);
else if (argv[0] === "--golden") console.log(JSON.stringify(goldenFixture(), null, 1));
else {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8")
    .split("\n").slice(0, 18).join("\n"));
  process.exit(2);
}
