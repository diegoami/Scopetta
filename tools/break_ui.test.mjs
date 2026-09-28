// The break harness's verdict, against a stand-in for the check whose exit
// code the test controls — so it runs in the engine job, with no browser.
//
// The review of #91 found the harness reporting a break as caught because the
// line naming its assertion was printed, while the check that printed it
// exited 0: a check that counts no failure is a check that passed, whatever it
// printed, and the harness had stopped asking. These pin both halves of the
// verdict — the line AND the failed exit — and that the check is told which
// line to stop on.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HARNESS = fileURLToPath(new URL("./break_ui.mjs", import.meta.url));
const BREAK = "the toast never shows";
const LINE = "the toast did not show";      // the line the check prints for it
const WANT = "did not show";                // its EXPECT, which names that line

// The unbroken page is clean, as it has to be before any break means anything.
// On a broken page it prints the break's own assertion, in the check's
// report format, then exits as FAKE_EXIT says — or, with "if told", fails
// only when STOP_AFTER names the break's assertion.
const FAKE = `
import { basename, dirname } from "node:path";
if (basename(dirname(process.argv[2])) === "base") process.exit(0);
console.log("  FAIL  a case");
console.log("        ${LINE}");
const told = process.env.STOP_AFTER === "${WANT}";
process.exit(process.env.FAKE_EXIT === "if told" ? (told ? 1 : 0) : Number(process.env.FAKE_EXIT));
`;

const harness = exit => {
  const dir = mkdtempSync(join(tmpdir(), "scopetta-fake-check-"));
  try {
    const check = join(dir, "check.mjs");
    writeFileSync(check, FAKE);
    const r = spawnSync(process.execPath, [HARNESS, BREAK], {
      encoding: "utf8",
      env: { ...process.env, CHECK_UI: check, FAKE_EXIT: String(exit), JOBS: "1" },
    });
    return { status: r.status, out: r.stdout + r.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("a check that prints the assertion and exits 0 is clean: the break survived", () => {
  const r = harness(0);
  assert.match(r.out, new RegExp(`^SURVIVED ${BREAK}$`, "m"), r.out);
  assert.doesNotMatch(r.out, /^caught/m, r.out);
  assert.equal(r.status, 1, "a survivor fails the harness");
});

test("a check that prints the assertion and fails caught the break", () => {
  const r = harness(1);
  assert.match(r.out, new RegExp(`^caught   ${BREAK}  →  ${LINE}$`, "m"), r.out);
  assert.equal(r.status, 0, r.out);
});

test("the check is told to stop on the assertion written for the break", () => {
  // STOP_AFTER is the break's EXPECT, a substring of the line, which is what
  // the harness itself matches on. The stand-in fails only when told exactly
  // that, so a caught break is the proof it was.
  const r = harness("if told");
  assert.match(r.out, new RegExp(`^caught   ${BREAK}  →  ${LINE}$`, "m"), r.out);
});
