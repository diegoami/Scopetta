# Scopetta — guidance for OpenCode

> Guidance for OpenCode. Claude Code uses [`CLAUDE.md`](CLAUDE.md); the
> principles both tools share are in [`PRINCIPLES.md`](PRINCIPLES.md).

Read [`PRINCIPLES.md`](PRINCIPLES.md) first — it holds the habits that keep a
change honest, and they apply to this tool too. This file holds what only
OpenCode can do: the cross-model review. Claude Code cannot spawn another model
family as a subagent, so that mechanism is deliberately not in its file.

## The cross-model review

Every change is reviewed by an independent agent from a **different model family
than the implementer**, at **high reasoning effort**, in a **fresh context**,
invoked as a subagent with an explicit model id:

| role | model |
|---|---|
| implementer | DeepSeek V4.1 Flash — `opencode/deepseek-v4.1-flash` |
| reviewer | GPT-5.6 Luna, high effort — `opencode/gpt-5.6-luna#high` |

The reviewer is spawned with the `subagent` tool and that model id, from a fresh
context. The implementer cannot see its own diff; a reviewer that shares its
context cannot either.

### The verdict goes on GitHub, signed

A review that lives only in a conversation is one the owner cannot see and the
next session cannot read. **The reviewer posts its verdict where the work is,
and signs it** — on the **design issue** with `gh issue comment <n>`, and on the
**pull request** with `gh pr review <n> --comment --body-file <file>` (or
`gh pr comment <n>`). The signature is conventionally `— GPT-5.6 Luna, reviewer`,
so a reader can tell it from the implementer's own comments. The implementer
answers in a comment there too.

### Two stages

1. **Design.** A non-trivial change starts as a **GitHub issue** holding the
   proposal. The reviewer's design verdict is **posted and signed on that
   issue**, and the stage ends on an explicit **AGREE** in a comment there.
2. **Implementation.** The **pull request** is reviewed the same way: findings
   are posted on the PR, the implementer fixes them in the same PR, and the
   reviewer looks once more — until an explicit **AGREE**, posted and signed on
   the PR.

### A BLOCK is not overridden

A finding the implementer disagrees with goes to the owner, in the pull request;
it is not merged around. "The check is green" and "the assertion I wrote saw the
defect it was written for" are different claims, and only the second counts.

### Owner decisions are not the reviewer's

Keep the reviewer's requirements separate from the owner's decisions. A decision
that is the owner's — a name, an `appId`, a licence, a scope, a default — is put
to the human **with a recommended default and the reason**, not argued out of
the reviewer. Reviews propose; the owner decides.

## The verification gates

A red gate does not merge. CI runs the first two on every pull request.

```sh
node --test "tools/**/*.test.mjs"   # rules, opponent, roster, release decisions
node tools/check_ui.mjs             # the UI check (~25 min, twelve passes)
node tools/break_ui.mjs             # after adding or changing an assertion
node tools/break.mjs                # after adding or changing a rule test
```

**How many times the full suite runs before a push.**

- The tests and the UI check run to green **once, on the exact commit being
  pushed** — not on a parent, and not before a rebase.
- `break_ui.mjs` (or `break.mjs`) runs after any assertion or rule test is added
  or changed, and the break must trip **the assertion written for it**, not
  merely something.
- A hand-resolved conflict, or a rebase, re-runs the full UI check: the merged
  page is not the page that was measured.
- A push that touches only prose may skip the UI check. A push that touches
  `public/`, `tools/`, or any colour, size or copy may not.

The project's own rules — the card-size budget, the frozen engine, the
conventions for player text and the card art — are in
[`CLAUDE.md`](CLAUDE.md), which both tools read for those facts. This file is
the one Claude Code does not act on.
