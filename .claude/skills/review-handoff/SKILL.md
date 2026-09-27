---
name: review-handoff
description: Prepare a release for its independent review - open the milestone issue with everything the reviewer needs, and give the owner the one command that starts the review on a model of their choice. Use when a release is called or proposed, for the re-review after a BLOCK, and whenever the owner asks for a review. Also use when the owner says a review is in, to process it.
---

# Review handoff

Only a release gets this review (`AGENTS.md`, *Releases*). A PR or a proposal
doesn't: say how it was verified instead. A milestone here is a release: the
annotated tag `vX.Y.Z` on `main`, on the exact commit the published release is
built from.

The reviewer's job is written once, in `.opencode/agents/release-reviewer.md`.
It starts with no context and reads everything from the milestone issue, so
the issue has to carry everything it needs.

## Before the issue

The candidate is already the release: an ordinary PR has bumped every version
declaration to the proposed version (`tools/release.test.mjs` holds all seven,
and `versionCode` only goes up) and set `SUBTITLE` in
`tools/publish_release.mjs`. If not, that PR comes first.

## Open the milestone issue

Title `Milestone vX.Y.Z`, label `milestone`, body passed with `--body-file`:

- **Tag**: `vX.Y.Z`, the next in the existing scheme unless the owner says
  otherwise.
- **Candidate**: the full SHA of `origin/main` after a fetch.
- **Previous milestone**: `git describe --tags --abbrev=0`.
- **Merged since**: every PR between the two, number and title.
- **Implementer**: the tool and model that did the work.
- **Gates on the candidate**: each command, its pass count, what it would have
  caught, and CI's result for that SHA — the engine tests, the full UI check,
  and `tools/smoke_desktop.mjs` on a build of the candidate.
- **What changed**: two or three sentences across the range. Do not argue for it.
- **Claims to verify**: what the release claims is true, with `file:line`.
- **Known owner decisions**: settled questions, so they aren't reported as
  defects, or "none".
- **Review**: `pending`, then `AGREE at <sha>`, `BLOCK at <sha>: #n` or
  `tagged without review (owner)`. Keep it current.

Make sure the `review` label exists (`gh label list`).

## Give the owner the command

Pick a reviewer model that implemented none of the release. Then, from the main
checkout, start it in a fresh session:

```sh
opencode run -m <provider/model> --command review-release <issue number>
```

In the TUI, use `/new`, pick the model with `/models`, then run
`/review-release <issue number>`. Neither the command nor the agent sets a
model, so the one picked here is the one used. With another tool, tell it:
"Follow `.opencode/agents/release-reviewer.md` for milestone issue #n."

For a re-review, first move **Candidate** to the new `main` commit, and add the
round, the earlier verdict's SHA and the findings to recheck (with the PRs that
fixed them) to the issue. Then give the same command again, in a fresh session.

## When the review is in

- Read the verdict and every issue it lists. Check that the SHA is the current
  candidate, and update the issue's `Review:` line.
- Reproduce each finding before acting on it. MUST-FIX: fix it in a PR
  (`Fixes #n`), or rebut it on the issue and leave the close to the owner.
  SHOULD: recommend whether it goes in before the tag. OUT OF SCOPE: leave it.
  Owner decisions go to the owner with a recommended default. Nits are your
  call: say which you took.
- Reply on the milestone issue with what happened to each finding.
- **BLOCK**: once the fixes merge, rerun the gates on the new candidate and
  start the re-review without being asked. After a third round without
  AGREE, the owner decides.
- **AGREE**: package, smoke, tag and publish from the reviewed SHA
  (`DESKTOP.md` §Releasing, `ANDROID.md` §4).
