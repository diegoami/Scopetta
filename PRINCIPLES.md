# Working on Scopetta — principles shared by both agents

> Read by OpenCode through [`AGENTS.md`](AGENTS.md) and by Claude Code through
> [`CLAUDE.md`](CLAUDE.md). These principles are the same for both; the
> cross-model review is OpenCode's alone and lives in `AGENTS.md`, and the
> verification gates are in `AGENTS.md` too.

These are the habits that keep a change honest. Each is here because a review or
a mutation harness found something green and wrong without it.

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

Prefer targeted reads and diffs to reprinting a file, and make focused
replacements rather than rewriting. The reviewer reads the diff; a wall of
unchanged lines is noise around the four that matter.
