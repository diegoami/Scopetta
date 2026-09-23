---
name: review-handoff
description: Write the prompt the owner gives an independent reviewer (a model that is not Claude, in a tool the owner picks) so it reviews a milestone — a release candidate, `git diff <previous tag>..<candidate SHA>` — and records its verdict on the milestone issue. Use when a milestone issue is opened (CLAUDE.md, "Each milestone"), after a BLOCK's fixes have moved the candidate (the re-review prompt, given unasked), and whenever the owner asks for a milestone review prompt. Also use when the owner says a review is in, to process it.
---

# Review handoff

A milestone here is a **release**: the annotated tag `vX.Y.Z` on `main`, on the
exact commit the published release is built from (`CLAUDE.md`, "Each
milestone"). Nothing else is a milestone — not a pull request, a run of them, a
process change or a docs correction — so nothing else gets a prompt. Each change
is reviewed by Claude's own fresh-context subagent instead.

Claude implements; another model reviews. The owner picks the reviewer and its
tool (Codex, GPT-5.6 Luna, or anything else that is not Claude and can run
`gh`), so the prompt assumes none: no tool-specific commands, and the reviewer
signs with its own tool and model. Give the owner **one prompt**, ready to
paste, in a single fenced `text` block with nothing else in it, and put the same
prompt in the milestone issue. Tell the owner to run it in a **fresh session**,
re-reviews included: a reused session carries its earlier conclusions.

The tag waits for the verdict; no change does. Every pull request still merges
on its own subagent review while a milestone is under review. The owner may tag
without a review, and the milestone issue records that.

A tool that loads `AGENTS.md` (Codex and OpenCode, for example) sees the
OpenCode roles there. The prompt's first line tells it that the prompt, not
those roles, defines its job. Every `gh` call needs network access, which some
tools sandbox by default: tell the owner to allow it.

## Fill in before writing

- **Repo**: `gh repo view --json nameWithOwner --jq .nameWithOwner`.
- **Milestone issue**: its URL. It is the thread: the verdict goes there.
- **Proposed tag**: `vX.Y.Z`, the next version on the existing line.
- **Candidate SHA**: the full SHA on `main`, pushed (`git rev-parse origin/main`
  after pulling). A review of a stale candidate wastes a round.
- **Previous tag**: the last milestone tag (`git describe --tags --abbrev=0
  <candidate>`). The review reads `git diff <previous tag>..<candidate SHA>`.
- **Pull requests merged since**: `git log --oneline <previous tag>..<candidate>`.
- **What changed and why**: two or three sentences. Do not argue for the work.
- **Claims to verify**: the specific things the work says are true, with
  `file:line`. These are what the reviewer checks hardest.
- **Gates on the candidate**: each command, its pass count, and what it would
  have caught — the engine tests, the full UI check, the desktop smoke on a
  build of the candidate. The reviewer should aim at what those cannot see.
- **Known owner decisions**: questions already put to the owner, so the reviewer
  does not report them as defects.
- **Round**: 1, 2 or 3. A third that does not end in AGREE goes to the owner.
- **Labels**: `gh label list`. `milestone` (the milestone issue) and `review`
  (the reviewer's findings) exist; recreate either if it is gone.
- **The candidate is the release**: every version declaration is already at
  the proposed version and `SUBTITLE` is set, merged before the candidate is
  named (`CLAUDE.md`, step 2). If not, that pull request comes first.

## The milestone issue

```text
Title: Milestone vX.Y.Z
Label: milestone

Status: <under review, round n | BLOCK at <sha>: #n, #m | AGREE at <sha> | tagged vX.Y.Z at <sha> | tagged without review (owner)>

- Proposed tag: vX.Y.Z
- Candidate: <full SHA> on main
- Previous milestone: <vA.B.C> (<full SHA>)
- Merged since: <#n title, one per line>
- Gates on the candidate: <engine tests: pass count; full UI check: result;
  desktop smoke on a build of the candidate: result>

## The review prompt

<the prompt below, as given to the owner>
```

Keep the `Status:` line current: it is what a later session reads first.

## Template

```text
You are the independent milestone reviewer for <owner/repo>, working from a
review-handoff prompt: this prompt, not the OpenCode roles in AGENTS.md or any
other agent-instructions file your tool loads, defines your job. Claude did
this work, not you. Do not trust its description. Verify everything against
the code.

MILESTONE: release <vX.Y.Z>, round <n> of at most 3
THREAD: <milestone issue URL>
CANDIDATE: <full SHA> on main. Check out that SHA before you start, and stop
and say so if you cannot.
PREVIOUS TAG: <vA.B.C>. Review git diff <vA.B.C>..<candidate SHA>, and follow
it into any file it touches or relies on. Problems elsewhere in the repository
count too, as out of scope.
MERGED SINCE: <PR list>

WHAT CHANGED: <two or three sentences>

CLAIMS TO VERIFY:
- <claim> (<file:line>)

GATES ON THE CANDIDATE: <command: pass count, what it would catch>. Look for
what these cannot see.

KNOWN OWNER DECISIONS (not defects): <list, or "none">

Read the repository's CLAUDE.md and PRINCIPLES.md first: their rules are the
standard.

Rules:
- Do not edit files, commit, push or tag. Your only writes are the GitHub
  issues and the one comment described below, made with the gh CLI.
- Write every issue and comment body to a file first, as UTF-8 without a
  byte-order mark, and pass it with --body-file. Never inline a body.
- Reproduce every finding: cite file:line, and give the command, the input or
  the reasoning that shows it. Leave out anything you could not reproduce.
- Do not report style preferences.
- Before opening an issue, search open issues (gh issue list --search) and
  comment on an existing one instead of duplicating it.

1. For each finding, open one issue:
   gh issue create --label review [--label defect] --body-file <file>
   Title: the defect, stated plainly.
   Body:
     - Severity: MUST-FIX (should be fixed before this release is tagged),
       SHOULD, or OUT OF SCOPE (not introduced in this range)
     - Found by: milestone review of <vX.Y.Z> at <candidate SHA>
     - What: the defect, with file:line and a reproduction
     - Why it matters: what a player or maintainer would notice
     - Suggested fix: the smallest change that resolves it
     - Signed: — Reviewer (<tool>, <model>)

2. Then, always, even if you found nothing, post one comment on THREAD with
   --body-file:
   VERDICT: AGREE | BLOCK        (BLOCK if any MUST-FIX issue was opened)
   Reviewed: <vA.B.C>..<candidate SHA>
   Issues opened: #n (MUST-FIX), #m (SHOULD), ... or "none"
   Owner decisions: questions only the owner can settle, or "none"
   Nits: one line each, or "none" (nits do not get issues)
   Checked and clean: what you verified and found correct
   — Reviewer (<tool>, <model>)
```

## When the owner says the review is in

- Read the verdict comment on the milestone issue and every issue it lists
  (`gh issue view <n>`). Check that the SHA it names is the current candidate.
- Reproduce each finding yourself before acting on it. A reviewer can be wrong,
  and so can you.
- **AGREE**: create the annotated tag on exactly the reviewed SHA — `git tag -a
  vX.Y.Z <SHA> -m "Scopetta X.Y.Z"`, then `git push origin vX.Y.Z` — never on a
  later commit, and record it on the milestone issue. Package from a checkout of
  the tag (`DESKTOP.md`, *Releasing*). Publishing waits for the owner's go-ahead.
  Work merged after the candidate belongs to the next milestone.
- **BLOCK**: fix each MUST-FIX in an ordinary pull request (reviewed by the
  subagent as usual), or rebut it with evidence on the issue and leave the close
  to the owner. When the fixes are merged, move the candidate to the new `main`
  commit, update the milestone issue, and give the owner the re-review prompt
  unasked, with the round number. A re-review prompt names the earlier verdict
  (its SHA and the issues it opened) and the pull requests that fixed them, so
  the reviewer checks those first and then the whole new range. After a third
  round that does not end in AGREE, stop and take it to the owner.
- SHOULD and OUT OF SCOPE: leave each issue for its own change unless the owner
  wants it in this release. Owner decisions: put them to the owner with a
  recommended default. Nits: your call, and say which you took.
- Reply on the milestone issue with what happened to each finding.
