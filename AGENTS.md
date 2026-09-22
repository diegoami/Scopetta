> Guidance for OpenCode. Claude Code uses CLAUDE.md. Shared principles: PRINCIPLES.md.

# Scopetta — guidance for OpenCode

Read [`PRINCIPLES.md`](PRINCIPLES.md) first: it holds the shared principles, the
**ownership map** that says where each idea lives, and the test for what counts
as a **non-trivial** change. This file holds what only OpenCode can do — the
cross-model review — and the verification gates.

## A change to this file is itself reviewed

`AGENTS.md`, `CLAUDE.md` and `PRINCIPLES.md` are part of the design a builder
follows, so a change to any of them **that changes what a builder must do or how
the process works** is non-trivial: it takes both stages below, to a signed AGREE
on each, before it merges. A pure typo is trivial and takes neither. **The
process reviews its own amendment.**

## The cross-model review

Every non-trivial change is reviewed by an independent agent from a **different
model family than the implementer**, at **high reasoning effort**, in a **fresh
context**, invoked as a subagent with an explicit model id:

| role | model |
|---|---|
| implementer | DeepSeek V4.1 Flash — `opencode/deepseek-v4.1-flash` |
| reviewer | GPT-5.6 Luna, high effort — `opencode/gpt-5.6-luna#high` |

**The invariant is a different model family; the ids above are the current
assignment**, not the rule. Whoever changes an assignment updates the table in
the same change. **Each stage starts with a new reviewer session**; a re-review
after fixes may continue that session (see AGREE, below). The implementer never
shares its context with the reviewer.

### The verdict goes on GitHub, signed

A review that lives only in a conversation is one the owner cannot see and the
next session cannot read. **The reviewer posts its verdict where the work is** —
on the **design issue** with `gh issue comment <n>`, on the **pull request** with
`gh pr review <n> --comment --body-file <file>` (or `gh pr comment <n>`) — and
the implementer answers in a comment there.

**The signature's exact convention:** the verdict's final line is
`— <reviewer display name> (<model id with variant>), reviewer` — today,
`— GPT-5.6 Luna (opencode/gpt-5.6-luna#high), reviewer`. Display name **and**
model id are required, and the convention generalises when the assignment
changes; it must not stay `GPT-5.6 Luna` after a reviewer change. It is
**human-readable attribution under the owner's GitHub account, not cryptographic
provenance**. The verdict is a **comment**, not `gh pr review --approve` —
GitHub forbids approving your own pull request under one account.

### Two stages

1. **Design.** A non-trivial change starts as a **GitHub issue** holding the
   proposal. The reviewer's verdict is **posted and signed on that issue**, and
   the stage ends on an explicit **AGREE** in a comment there.
2. **Implementation.** The **pull request** is reviewed the same way, to an
   explicit **AGREE** posted and signed on the PR. The PR **links the design
   issue and states the revision the AGREE was given on**, and its body carries
   `Closes #<design issue>` when a design issue exists, and `Closes #<defect
   issue>` when it fixes a defect, so both records close themselves; nothing is
   closed by hand. **When one issue is both the design and the defect record, one
   `Closes` line is enough.**

**The defect path.** A `defect` issue is the record, not automatically a design
proposal. A fix takes the design stage **unless all four** hold: it is limited to
correcting the recorded defect; it changes no product behaviour beyond that
defect; it changes no check's *design*; it changes no process. Adding or
adjusting the assertion **that catches the recorded defect** is part of the fix,
not check design; changing **what a check measures** is check design.

**What a BLOCK may require.** Every required change in a BLOCK must be
**necessary to the change as proposed** — directly required for its stated aim,
its correctness, or its verification — not merely useful, preferred, or unrelated
cleanup. A requirement that is really a **separate concern** is **filed as its
own issue and linked**, not swallowed; the reviewer may require the split. If the
required changes would turn the change into a different, larger one, the
implementer may **withdraw and re-scope** it with the owner rather than let it
grow: **the withdrawal and the re-scope are recorded** on the issue, and any
AGREE already given is invalidated under § *AGREE, materiality, re-review*.

### A BLOCK is not overridden

A BLOCK stands wherever it is posted. The implementer either satisfies it or
takes it to the owner — on the **design issue** for a design BLOCK, on the
**pull request** for an implementation BLOCK — and it is never merged around.
"The check is green" and "the assertion I wrote saw the defect it was written
for" are different claims, and only the second counts.

### Owner decisions are not the reviewer's

Keep the reviewer's requirements separate from the owner's decisions. A decision
that is the owner's — a name, an `appId`, a licence, a scope, a default — is
**recorded on the design issue or PR**, with a recommended default and the
reason, and marked as an owner decision so a later session can tell it from a
reviewer requirement. Conversation is not a record. The **implementer opens the
design issue**; if they lack permission, the owner opens it and the implementer
still presents the proposal.

A required change that is **the owner's to decide** is not the reviewer's to fix.
The reviewer requires that it be **decided and recorded** using the convention
above — the recommended default, the reason, and the owner-decision mark. The
reviewer checks that the record **addresses the BLOCK** and is consistent with
the proposal, and **may not reject it merely for differing from the reviewer's
preference**. If the owner **rejects the proposal** rather than deciding a value,
the issue is **withdrawn or re-scoped**; it receives no AGREE and is not merged
around.

### Reviewer unavailable, fallback, waiver

Failed, cancelled or unavailable review is **no review and no AGREE**. **Retry**,
or select another reviewer from a **different model family** — the model id and
who selected it are recorded on the issue or PR, and that reviewer becomes the
designated reviewer for the stage. A **waiver is an implementation-review
exception only**; bypassing the **design** stage is an explicit owner amendment
of the process, recorded on the issue or PR. A waiver is never called AGREE and
never silently overrides "a BLOCK is not overridden".

### AGREE, materiality, re-review

Only the designated reviewer issues the signed verdict, and it covers the
**current revision**: the verdict marker is a comment ending with an explicit
`AGREE` or `BLOCK`. **Any change after an AGREE invalidates it and requires a
fresh signed verdict, except** edits limited to commit messages, whitespace, or a
typo that changes no behaviour, no assertion and no process text. **This issue's
body is the proposal**: a **non-material edit** — one that changes no behaviour,
no assertion and no process text, by the same test — needs no re-review, while a
**material edit to the body always does**. **A comment exists only to record a
verdict, a finding, an answer or a recording**: a comment that **changes the
proposal or records an owner decision the reviewer required** is material and
triggers re-review; a comment that merely records an answer within the proposal
does not. A verdict that refers to an obsolete revision is re-reviewed against
the current one. A stage's **initial** verdict comes from a **new reviewer
session**; a **re-review after fixes may continue that session**, because the
separation the gate protects is from the **implementer's** context, and the
reviewer re-reads the current revision. A fallback reviewer is the designated
reviewer for its stage.

## The verification gates

A red gate does not merge. CI (`.github/workflows/check.yml`) runs the first two
on every pull request and on every push to `main`, so a pull request branch does
not run twice.

```sh
node --test "tools/**/*.test.mjs"   # rules, opponent, roster, release decisions
node tools/check_ui.mjs             # the UI check (~25 min)
node tools/break_ui.mjs             # after adding, changing or removing an assertion
node tools/break.mjs                # after adding, changing or removing a rule test
```

**The unit is a push's tip.** Several commits in one push are measured once, at
the tip; the tip that lands must be green. The **engine tests** run on every
push.

**The full UI check** runs on the tip of a push whose **measured-input tree**
changed since the last tree measured green on this branch, or since the merge
base if none. The **measured-input tree** is the transitive runtime inputs of
`node tools/check_ui.mjs` — what it imports and opens (`tools/golden.json`,
`tools/serve.mjs` where it imports them, the `public/**` it loads), and its
browser/playwright and workflow configuration (`.github/workflows/check.yml`,
`package.json`, `package-lock.json`). The conservative floor in `PRINCIPLES.md`
is the checklist a builder uses instead of tracing imports. If a push changes an
input and then reverts it, the tip's tree equals the green one and there is **no
re-run**; a push that changes no measured input runs the engine tests only,
however many commits it has.

**A rebase or a hand-resolved conflict always re-runs the full UI check**, even
if the measured-input list is unchanged: the resolution is new content that was
never measured. This is the one exception to "no measured-input change, no
re-run", and it is why "never for a doc-only push" and this exception do not
conflict.

**Local vs CI.** This rule governs the **local** run before a push. The **PR's CI
jobs** are the **merge gate**. The merge produces a commit whose CI runs on
`main`; a red `main` run is **fixed forward**, not a merge gate.

### Assertion removal and retuned thresholds

- Adding, changing or **removing** an assertion or rule test runs the break
  harness, and the break must trip **the assertion written for that defect**.
- **Removing** an assertion requires either a replacement that catches the same
  defect, or a recorded reason plus a mutation run on the PR naming which
  remaining assertion covers the defect and showing it fire. If no historical
  commit is available for a threshold retune, the **stand-in must be a
  deliberately broken equivalent that trips the named assertion**, not merely a
  note.
- **Retuning a threshold** re-verifies it against the commit that introduced the
  bug it names; a retune justified by one seed, one range or one machine is a
  coin toss (`PRINCIPLES.md`), so the PR says which **second** measurement was
  used.

## The project's own rules

The card-size budget, the frozen engine, the conventions for player text and the
card art, and the rationale behind the checks are in
[`CLAUDE.md`](CLAUDE.md), which both tools read for those facts. This file is the
one Claude Code does not run a review process from.
