// Headless Scopa: profile against profile, profile against baselines, and the
// measurements §4 iteration 2 asks for before the formula freezes.
//
//   node tools/selfplay.mjs --probe              the questions §4 asks
//   node tools/selfplay.mjs --ladder KEY 1,2,3   what one weight costs and buys
//   node tools/selfplay.mjs --ladder-all         every weight across its range
//   node tools/selfplay.mjs --try KEY=V,KEY=V    a whole candidate at once
//   node tools/selfplay.mjs --differ 200         how often two profiles differ
//   node tools/selfplay.mjs --piero 12 400      Piero's rolls, and what each is
//   node tools/selfplay.mjs --tempo 400          the tempo question
//   node tools/selfplay.mjs --paired KEY=V       what one change is worth, paired
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
// anything. A draw is common in Scopa — §2.4, and measured at about one deal in
// eight — so the headline number is the score rate, wins plus half the draws.
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
  // Validated, because `--ladder SCOPA_BONUS 0,1000` used to print "from
  // Franco's undefined" and a confident 0.00%: a silent fake confirmation for
  // anyone re-auditing a weight that had been removed.
  if (!WEIGHT_KEYS.includes(key)) throw new Error(`no such weight: ${key}`);
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
  SETTEBELLO_BONUS:   [0, 3, 6, 12, 25],
  PRIMIERA_WEIGHT:    [0, 0.2, 0.4, 0.8, 1.6],
  SCOPA_RISK_PENALTY: [0, 3, 6, 12, 24],
  GIFT_FACTOR:        [0, 0.25, 0.5, 1, 2],
  TEMPO_BONUS:        [0, 2, 5, 12, 25],
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
  console.log(`\n  §4: under 1% at any value is the bar — but it is a question, not a verdict.`);
  const dead = summary.filter(s => s.most.pct < 1);
  console.log(`  under 1%: ${dead.length ? dead.map(s => s.key).join(", ") : "none"}`);
  if (dead.length){
    console.log(`\n  Before deleting one, ask what its plays decide. SETTEBELLO_BONUS sits under`);
    console.log(`  the bar and is kept on purpose: it moves few plays because one card carries`);
    console.log(`  a whole point, and \`--paired KEY=0\` says it is worth half of one. §3.4.`);
  }
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
  // §4 asks: "does the opponent lay low cards into a table it could have swept
  // next turn had it waited?" That is about tempo Franco *forfeits*, and the
  // first version of this function measured two adjacent things instead — what
  // it declines, and what it gives away. Both are worth knowing and are printed
  // below, but neither is the question, and the question was being closed on
  // them.
  //
  // Measured directly: at every decision with a real choice, try each legal
  // play, let the opponent answer it with greedy-take, and ask whether Franco
  // would then hold a sweep. If some play would have left it one and the play
  // it made did not, it gave the tempo up.
  let decisions = 0, chances = 0, took = 0, gave = 0;
  let lays = 0, laidWithTake = 0;

  const sweepAvailable = st => {
    const who = st.deveGiocare;
    return st.tavola.length > 0 &&
      mosse(st, who).some(x => x.presa.length === st.tavola.length);
  };

  const watch = (state, who) => {
    if (state.giro >= CODA_FROM) return;
    const all = mosse(state, who);
    if (all.length < 2) return;
    decisions++;

    const chosen = compGioca(state, FRANCO);
    if (!chosen) return;
    if (!chosen.presa.length){
      lays++;
      if (all.some(x => x.presa.length)) laidWithTake++;
    }

    // Would this play leave me a sweep after their reply?
    const leavesSweep = play => {
      const st = JSON.parse(JSON.stringify(state));
      try {
        gioca(st, who, play.slot, play.presa);
        if (st.over || st.deveGiocare === who) return false;
        const reply = greedyTake(st);
        gioca(st, st.deveGiocare, reply.slot, reply.presa);
        if (st.over || st.deveGiocare !== who) return false;
        return sweepAvailable(st);
      } catch { return false; }
    };

    const any = all.filter(leavesSweep);
    if (!any.length) return;
    chances++;
    if (any.some(x => x.slot === chosen.slot && x.presa.join() === chosen.presa.join())) took++;
    else gave++;
  };

  match(n, "franco", "greedy", watch);

  console.log(`\ntempo, ${n} seeds mirrored\n`);
  console.log(`  decisions with a real choice: ${decisions}`);
  console.log(`\n  §4's question — tempo forfeited:\n`);
  console.log(`  some play would have left Franco a sweep next turn: ${chances}` +
              ` (${(100 * chances / decisions).toFixed(2)}%)`);
  console.log(`    it chose one of them: ${took}`);
  console.log(`    it gave the tempo up: ${gave}` +
              `  (${(100 * gave / decisions).toFixed(2)}% of decisions,` +
              ` ${(100 * gave / Math.max(1, chances)).toFixed(1)}% of the chances)`);
  console.log(`\n  This assumes a greedy reply and that a sweep is always worth having,`);
  console.log(`  so it is an upper bound on what a 2-ply term could recover, not a defect count.`);

  console.log(`\n  and the two adjacent numbers, which are not the question:\n`);
  console.log(`  Franco laid a card: ${lays} (${(100 * lays / decisions).toFixed(1)}%),` +
              ` of which a capture was available and declined: ${laidWithTake}` +
              ` (${(100 * laidWithTake / Math.max(1, lays)).toFixed(1)}%)`);

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
            if (mosse(st, st.deveGiocare).some(x => x.presa.length === st.tavola.length)) swept++;
          }
        }
      }
    }
    console.log(`  ${who.padEnd(8)} left a table the reply could sweep: ` +
                `${swept} of ${left}  (${(100 * swept / left).toFixed(2)}%)`);
  }
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

/* ---- do the roster's players play differently? ------------------------------- */

// The pairwise difference table §4 iteration 5 asks for: how often every pair of
// the roster chooses a different play, over the decisions the weights actually
// make and driven by each profile in turn. A different driver matters because
// one driver's positions are one player's positions, and asking every question
// about Franco's hands flatters the pairs that play like Franco.
//
//   node tools/selfplay.mjs --differ 200
function differ(n){
  const P4 = rollProfiles(rngSeed(1));
  const names = Object.keys(P4);
  const pairs = names.flatMap((a, i) => names.slice(i + 1).map(b => [a, b]));
  const count = Object.fromEntries(pairs.map(p => [p.join(" vs "), 0]));
  let decisions = 0;

  for (let seed = SEED_FROM; seed < SEED_FROM + n; seed++){
    const rng = rngSeed(seed);
    const s = newDeal({}, rng);
    const driver = P4[names[seed % names.length]];
    while (!s.over){
      const who = s.deveGiocare;
      if (isDecision(s, who)){
        decisions++;
        const chose = Object.fromEntries(names.map(k => [k, compGioca(s, P4[k])]));
        for (const [a, b] of pairs) if (!sameMove(chose[a], chose[b])) count[`${a} vs ${b}`]++;
      }
      const m = compGioca(s, driver);
      gioca(s, who, m.slot, m.presa);
    }
  }
  console.log(`\nthe roster's pairwise difference, ${n} seeds from ${SEED_FROM}, ${decisions} decisions\n`);
  for (const [pair, c] of Object.entries(count))
    console.log(`  ${pair.padEnd(24)} ${(100 * c / decisions).toFixed(1)}%`);
}

/* ---- paired comparison -------------------------------------------------------- */

// Two vectors on the *same* deals against the *same* opponent, differenced deal
// by deal. Iteration 2's review showed why this matters: two vectors that
// differ on 0.1% of plays differ on about 1.3% of deals, so almost all the
// noise is shared and cancels here while an unpaired ±1.8 band cannot see the
// effect at all. It is also the test that proved the tuning bought nothing — it
// is not a test that finds differences wherever it looks.
//
//   node tools/selfplay.mjs --paired TEMPO_BONUS=0 1500
//
// reports what the OVERRIDE is worth relative to Franco, positive meaning
// Franco is better.
function paired(spec, n){
  const Q = { ...FRANCO };
  for (const pair of spec.split(",")){
    const [k, v] = pair.split("=");
    if (!WEIGHT_KEYS.includes(k)) throw new Error(`no such weight: ${k}`);
    Q[k] = Number(v);
  }
  const outcome = (P, seed, asBasso) => {
    const rng = rngSeed(seed);
    const st = newDeal({}, rng);
    while (!st.over){
      const who = st.deveGiocare;
      const mine = asBasso ? who === BASSO : who === ALTO;
      const m = mine ? compGioca(st, P) : greedyTake(st, rng);
      gioca(st, who, m.slot, m.presa);
    }
    const p = scoreDeal(st).punti, me = asBasso ? BASSO : ALTO;
    return p[me] > p[1 - me] ? 1 : p[me] === p[1 - me] ? 0.5 : 0;
  };
  const diffs = [];
  let a = 0, b = 0;
  for (let seed = SEED_FROM; seed < SEED_FROM + n; seed++)
    for (const asBasso of [true, false]){
      const x = outcome(FRANCO, seed, asBasso), y = outcome(Q, seed, asBasso);
      a += x; b += y; diffs.push(x - y);
    }
  const m = diffs.length, mean = diffs.reduce((x, y) => x + y, 0) / m;
  const sd = Math.sqrt(diffs.reduce((x, y) => x + (y - mean) ** 2, 0) / (m - 1));
  const se = sd / Math.sqrt(m);
  console.log(`\npaired, ${spec}, ${n} seeds from ${SEED_FROM}, mirrored\n`);
  console.log(`  Franco ${(100 * a / m).toFixed(2)}%   ${spec} ${(100 * b / m).toFixed(2)}%`);
  console.log(`  Franco − it: ${(100 * mean >= 0 ? "+" : "")}${(100 * mean).toFixed(2)}%` +
              ` ± ${(100 * 1.96 * se).toFixed(2)}   z = ${(mean / se).toFixed(2)}   over ${m} deals`);
  console.log(`\n  |z| under about 2 is nothing. Positive means Franco is the better vector.`);
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

/* ---- Piero's rolls ----------------------------------------------------------- */

// Piero is rolled once a session from bands that are supposed to hold his
// corner. A band is a claim about plays, so it is measured: what each roll is
// worth against the baselines, and how far it is from every fixed player.
//
//   node tools/selfplay.mjs --piero 12 400
function piero(rolls, n){
  const fixed = rollProfiles(rngSeed(1));
  const names = ["Franco", "Graziano", "Valerio"];
  console.log(`\nPiero rolled ${rolls} times, ${n} seeds from ${SEED_FROM}, mirrored\n`);
  for (let i = 0; i < rolls; i++){
    const P = rollProfiles(rngSeed(20000 + i)).Piero;
    PLAYERS.__try = profile(P);
    const g = match(n, "__try", "greedy");
    const r = match(n, "__try", "random");
    const diff = {}; let decisions = 0;
    match(Math.min(n, 200), "franco", "greedy", (state, who) => {
      if (!isDecision(state, who)) return;
      decisions++;
      const mine = compGioca(state, P);
      for (const nm of names)
        if (!sameMove(mine, compGioca(state, fixed[nm]))) diff[nm] = (diff[nm] || 0) + 1;
    });
    const away = names.map(nm => `${nm} ${(100 * (diff[nm] || 0) / decisions).toFixed(1)}%`).join("  ");
    console.log(`  session ${String(i).padStart(2)}  GIFT ${P.GIFT_FACTOR.toFixed(2)} PRIMIERA ${P.PRIMIERA_WEIGHT.toFixed(2)} SCOPA_RISK ${P.SCOPA_RISK_PENALTY.toFixed(1)}` +
      `  vs greedy ${(100 * scoreRate(g)).toFixed(1)}%  vs random ${(100 * scoreRate(r)).toFixed(1)}%` +
      `  away (${decisions} decisions): ${away}`);
  }
}

/* ---- the golden fixture ------------------------------------------------------ */

// Twenty deals per fixed player, and every weight of the whole roster frozen —
// Piero's rolled three included. Re-recorded only by
// `node tools/selfplay.mjs --golden > tools/golden.json`, and a change to the
// formula or to rngSeed invalidates it — which is the whole reason §3.4's
// contract says change a weight, not the formula, from v1.0.
function goldenFixture(){
  const recorded = ["Franco", "Graziano", "Valerio"];
  const deals = [];
  for (const who of recorded){
    const P = PROFILES[who];
    for (let seed = 1; seed <= 20; seed++){
      const rng = rngSeed(seed);
      const s = newDeal({}, rng);
      const plays = [];
      while (!s.over){
        const seat = s.deveGiocare;
        const m = compGioca(s, P);
        const c = s.hands[seat][m.slot];
        plays.push(`${seat}:${c.s}-${c.n}:${m.presa.join(".")}`);
        gioca(s, seat, m.slot, m.presa);
      }
      const r = scoreDeal(s);
      deals.push({ who, seed, mazziere: s.mazziere, plays,
                   punti: r.punti, scope: r.scope,
                   carte: r.carte, denari: r.denari,
                   settebello: r.settebello, primiera: r.primiera });
    }
  }
  return { profiles: PROFILES, codaFrom: CODA_FROM, deals };
}

/* ---- run --------------------------------------------------------------------- */

const argv = process.argv.slice(2);
const n = i => Number(argv[i] ?? 0);

if (argv[0] === "--probe") probe(n(1) || 1000);
else if (argv[0] === "--ladder") ladder(argv[1], argv[2].split(",").map(Number), n(3) || 500);
else if (argv[0] === "--ladder-all") ladderAll(n(1) || 500);
else if (argv[0] === "--try") tryCandidate(argv[1], n(2) || 1000);
else if (argv[0] === "--differ") differ(n(1) || 200);
else if (argv[0] === "--tempo") tempo(n(1) || 400);
else if (argv[0] === "--fifth") fifth(n(1) || 200);
else if (argv[0] === "--paired") paired(argv[1], n(2) || 1500);
else if (argv[0] === "--tune") tune(n(1) || 400);
else if (argv[0] === "--piero") piero(n(1) || 12, n(2) || 400);
else if (argv[0] === "--golden") console.log(JSON.stringify(goldenFixture(), null, 1));
else {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8")
    .split("\n").slice(0, 18).join("\n"));
  process.exit(2);
}
