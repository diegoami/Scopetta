> Shared by both tools, through AGENTS.md and CLAUDE.md.

# Scopetta — principles shared by both agents

Read by OpenCode through [`AGENTS.md`](AGENTS.md) and by Claude Code through
[`CLAUDE.md`](CLAUDE.md). These principles and habits are the same for both; the
cross-model review and the verification gates are in `AGENTS.md`.

These are the habits that keep a change honest. Each is here because a review or
a mutation harness found something green and wrong without it.

## One source of truth

| Idea | Owning file |
|---|---|
| the working principles and habits | `PRINCIPLES.md` |
| the review process | `AGENTS.md` |
| the verification gates (commands, run counts, CI schedule) | `AGENTS.md` |
| the project's own rules (budget, frozen engine, conventions, check rationale) | `CLAUDE.md` |

**The table is authoritative.** A non-owning file **links** to an idea and does
not restate it, so an idea lives in one place and cannot drift. If the table does
not settle a sentence that spans two owners, the fallback order is `AGENTS.md`
for process and gates, this file for principles, `CLAUDE.md` for project rules. A
contradiction found between the files is filed as a `defect` issue and fixed in
the change that found it.

## What counts as non-trivial

A change is **non-trivial** if it can change:

- **(a)** the observable behaviour of the game or any tool;
- **(b)** what any check measures or asserts;
- **(c)** the **design or process a builder must follow** — including
  `AGENTS.md`, `CLAUDE.md`, `PRINCIPLES.md`, `.claude/**`, and `PLAN.md`,
  `SPEC.md`, `ANDROID.md`, `RULES.md`, `REGOLE.md` where they state design; or
- **(d)** player-facing copy.

Anything that meets none of (a)–(d) is **trivial**. As a **conservative floor** —
the checklist a builder uses instead of tracing imports — a diff touching
`public/**`, `tools/**`, `.claude/**`, `.github/**`, `mobile/**`, `netlify.toml`,
`package.json`, `package-lock.json`, or the three harness files is non-trivial
whether or not the author believes the test is met.

Triviality skips **only the design-issue stage** (`AGENTS.md`); it never skips
the verification gates or the review of a file whose behaviour changed. A pure
typo in a design document is trivial; a change to what that document says a
builder must do is (c).

## Reproduce before you act

Every finding from a reviewer, and every claim you are about to publish, is
reproduced first: run the command, break the code, watch the check go red on the
assertion written for it. An unreproduced finding is a hypothesis; an
unreproduced claim is a remembered number, and a measured number and a
remembered one look the same in a comment.

## Say what a passing check would have caught

For every check that passes, say what it would have caught had the code been
wrong. A check whose subject it never renders is decoration — **an assertion only
sees the states the check puts the page in**, and adding the state is the harder
half of adding the assertion.

## A threshold from one measurement is a coin toss

A limit calibrated from a single run, or on the seeds it was tuned on, is not a
measurement. Hold it against a second range, a spread of real fonts, a second
browser, and say where it came from and how it was obtained.

## Flag out-of-scope defects, do not fix them silently

A defect found while doing something else is filed — a `defect` issue — not
swept into the change. A silent fix hides the defect from the next reader, who
would have found it the same way, and leaves no assertion behind for it.

## Show diffs, not whole files

Prefer targeted reads and diffs to reprinting a file — search first, then read
the range you need, and show changes as a diff (`git diff -- <path>`,
`git show HEAD:<path>`) rather than reprinting a file. Make edits with focused
replacements instead of rewriting a file to change a few lines. The reviewer
reads the diff; a wall of unchanged lines is noise around the four that matter.

## Read this much, and no more

Normally inspect: `public/index.html`, `public/engine.js`, `tools/*`, the root
`*.md`, `.github/workflows/*`, `.claude/skills/*`.

Normally ignore: `node_modules/`, `.git/`, `public/decks/`, `public/fonts/`,
`public/icons/`, `assets/`, `mobile/android/` (open files in it individually),
and any binary. Read `package-lock.json` only when dependencies are the task.

Ignoring a path here does not mean it should be deleted or gitignored.

## Keep command output short

Prefer the repository's own commands over ad-hoc exploration, and cap their
output. On PowerShell:

```powershell
npm run check 2>&1 | Select-Object -Last 40
npm test 2>&1 | Select-Object -Last 20
git diff --stat
gh pr view <n> --json title,state --jq .
```

On bash, `| tail -40` instead of `Select-Object -Last 40`. Use `node --check
<file>` for a syntax check instead of running a script, and scope file searches
to source directories rather than searching from the repository root.

## Sessions and handoff

Start a fresh session after a completed logical unit — a merged PR, a finished
fix, a documentation pass — or when a thread has grown long. Carry forward a
short handoff:

- **Completed:** what is now true (and any verification that ran).
- **Files / decisions:** the paths touched and the decisions made, with reasons.
- **Next:** the next task, or "nothing open".

Durable facts belong in the repository (the docs, the PR body), not in the
conversation.
