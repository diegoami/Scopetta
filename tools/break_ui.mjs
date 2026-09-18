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
// prints. §3.7's six rows are all represented.
const EXPECT = {
  "the table row loses its step floor": "steps",
  "the table row spills past its own box": "spills",
  "the middle row lands on the hands": "land on a hand",
  "the say line collapses when it is empty": "say line",
  "--chrome is hard-coded instead of derived": "below the fold",
  // Wrapping in landscape does not overlap a hand, it costs a fourth card row
  // against a budget that paid for three — so the seat goes below the fold, and
  // that is the assertion that should see it. The expectation here was wrong,
  // not the check.
  "the table row wraps in landscape too": "below the fold",
  "the toast joins the flow": "in the flow",
  "the toast is given a strip too short for it": "clips its own text",
  "the proposal marks every card on the table": "the table marks",
  "the say line names the card instead of the capture": "does not say what the tap does",
  "tapping a table card does not switch the proposal": "did not change the proposal",
  "the pile badge stops counting": "badges say",
  "the scopa marks stop counting": "scopa marks",
  "the middle draws a card the engine does not hold": "the middle shows",
  "the leftovers are left on the table": "still shows",
  "a played card keeps its face": "shows a card",
};

// A break that cannot change what the page does, with how that was measured.
// Marking one equivalent is a claim, so it carries its evidence; and a mutant
// claimed equivalent that IS caught means the claim was wrong, which is red.
const EQUIVALENT = {
  "the table row grows the table instead of overlapping":
    "`width: 100%` on .tavola-row already bounds it, so the grid column rule is " +
    "belt-and-braces: at 360x800 with thirteen cards both versions give the same " +
    "two rows, same 312px row, same 42px and 50px steps, same first and last edges.",
};

const BREAKS = [
  // --- §3.7 row 1: the table at 0, 4, 8 and 13 cards -----------------------
  ["the table row loses its step floor",
   "    min(var(--cw) + var(--gap), (100% - var(--cw)) / (max(var(--n, 2), 2) - 1))\n    - var(--cw));",
   "    min(var(--cw) + var(--gap), (100% - var(--cw)) / (max(var(--n, 2), 2) - 1)) * .18\n    - var(--cw));"],
  ["the table row spills past its own box",
   "  margin-left: calc(\n    min(var(--cw) + var(--gap), (100% - var(--cw)) / (max(var(--n, 2), 2) - 1))\n    - var(--cw));",
   "  margin-left: var(--gap);"],
  ["the table row grows the table instead of overlapping",
   "  grid-template-columns: minmax(0, 1fr);\n  gap: var(--step);",
   "  gap: var(--step);"],
  ["the middle row lands on the hands",
   ".middle{\n  display: grid;",
   ".middle{\n  margin-block: -42px;\n  display: grid;"],
  ["the table row wraps in landscape too",
   "  const portrait = window.matchMedia(\"(orientation: portrait)\").matches;",
   "  const portrait = true;"],

  // --- the budget ----------------------------------------------------------
  ["--chrome is hard-coded instead of derived",
   "  --chrome: calc(var(--topbar) + 2*var(--pad-block) + 2*var(--step)\n                 + 2*var(--tavola-pad) + var(--extra-gap) + var(--plates)\n                 + var(--say) + var(--slack));",
   "  --chrome: 150px;"],
  ["the say line collapses when it is empty",
   "  height: var(--say);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  overflow: hidden;\n}",
   "  height: auto;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  overflow: hidden;\n}"],

  // --- §3.7 row 3: the toast floats ---------------------------------------
  ["the toast joins the flow",
   ".table > .toast{\n  position: absolute;",
   ".table > .toast{\n  position: static;"],
  ["the toast is given a strip too short for it",
   "  max-width: calc(100% - 2 * var(--pad-inline));\n  margin: 0 auto;",
   "  max-width: 90px;\n  height: 1.2em;\n  overflow: hidden;\n  margin: 0 auto;"],

  // --- §3.7 row 2: the capture choice --------------------------------------
  ["the proposal marks every card on the table",
   "      b.dataset.take = String(take.has(idx));",
   "      b.dataset.take = \"true\";"],
  ["the say line names the card instead of the capture",
   "  el.selName.textContent = `Prendi ${lista} con il ${breve(card)}`;",
   "  el.selName.textContent = `Il ${breve(card)}`;"],
  ["tapping a table card does not switch the proposal",
   "  const found = opts.findIndex(set => set.includes(idx));\n  if (found < 0) return;\n  state.scelta = found;",
   "  const found = opts.findIndex(set => set.includes(idx));\n  if (found < 0) return;",
   ],

  // --- §3.7 row 4: the badges agree with the engine ------------------------
  ["the pile badge stops counting",
   "  badge.textContent = String(n);",
   "  if (n < 8) badge.textContent = String(n);"],
  ["the scopa marks stop counting",
   "  const s = state.scope ? state.scope[who] : 0;",
   "  const s = 0;"],
  ["the middle draws a card the engine does not hold",
   "  const cards = state.tavola || [];",
   "  const cards = (state.tavola || []).slice(0, 12);"],

  // --- §3.7 row 6: the last play -------------------------------------------
  ["the leftovers are left on the table",
   "function renderTavola(take){\n  const cards = state.tavola || [];",
   "function renderTavola(take){\n  const cards = state.over ? [{s:0,n:1}] : (state.tavola || []);"],

  // --- the hand ------------------------------------------------------------
  ["a played card keeps its face",
   "    const card = state.hands[BASSO] ? state.hands[BASSO][slot] : null;\n    faceOf(node, card);",
   "    const card = state.hands[BASSO] ? (state.hands[BASSO][slot] || {s:0,n:1}) : null;\n    faceOf(node, card);"],
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
  const hits = TEXT.split(find).length - 1;
  if (hits !== 1){
    invalid.push([name, `matched ${hits} times, want exactly 1`]);
    console.log(`INVALID  ${name} — matched ${hits} times`);
    continue;
  }
  const work = join(dir, name.replace(/[^a-z0-9]+/gi, "-"));
  cpSync(PUBLIC, work, { recursive: true });
  writeFileSync(join(work, "index.html"), TEXT.replace(find, replace));

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
