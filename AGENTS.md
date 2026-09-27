# Scopetta

A two-player Scopa game for the browser, the third of a series after
[Discola](https://github.com/diegoami/discola-web) and
[Tressette](https://github.com/diegoami/Tressette): one static page, no build
step, the 1997 card art, one opponent formula with a weight vector per name.

`PLAN.md` is the architecture and the plan, with the owner's decisions in its
§0, and `SPEC.md` describes what exists. Tressette is the reference for
everything the plan does not state, and Discola for everything Tressette does
not; clone both beside this repo if they are not already there.

This is the one instructions file, for every tool. `CLAUDE.md` only imports it.

## How work flows

- **Propose first, when it is more than a fix.** Open an issue with the
  problem, the findings with `file:line` references, the design and the open
  questions, and get the owner's agreement before implementing. A small fix or
  a documentation change goes straight to a PR.
- **Branch from a fresh `origin/main`** (`git fetch origin` first), open a PR
  that references the issue, and verify it with the gates green
  (*Verification*). The owner merges.
- **After the owner merges**: in the main checkout,
  `git switch main && git pull --ff-only`, then `git branch -d <branch>`.
  Delete the remote branch too, unless GitHub already did. Nothing depends on
  the local `main` being current, since every branch starts from a fresh
  `origin/main`.
- **Worktrees are ad hoc**: use one only to work in parallel with another
  session. Make it with
  `git worktree add --no-track -b <branch> ../Scopetta-work/<branch> origin/main`,
  and install the dependencies in it as CI does (`npm ci`, then
  `npx playwright-core install chromium`). Never link `node_modules`. On
  Windows, nested paths need `git config --global core.longpaths true`, which
  the owner sets. Remove the worktree after the merge.
- **No per-PR review.** The independent review runs once per release, below.

## Releases

A release is an annotated tag `vX.Y.Z` on `main`, on the exact commit the
published binaries are built from. Binaries go to `diegoami/scopetta-releases`,
the tag stays here, and `tools/publish_release.mjs` refuses anything else. This
project publishes no pre-releases. Nothing but a release is a milestone.

1. **The version bump is its own PR, first.** Before a candidate is named, an
   ordinary PR bumps every version declaration to the proposed version
   (`tools/release.test.mjs` holds all seven; `versionCode` only goes up) and
   sets `SUBTITLE` in `tools/publish_release.mjs`, so the tagged commit builds
   exactly what is published.
2. **Open the milestone issue**, labelled `milestone`, titled `Milestone
   vX.Y.Z`: the candidate (the full SHA of `origin/main` after a fetch), the
   previous tag, the PRs merged since, the gate results on the candidate — the
   engine tests, the full UI check, and `tools/smoke_desktop.mjs` on a build of
   the candidate — what changed, the claims to verify, and the known owner
   decisions. The `review-handoff` skill fills it in.
3. **Get an independent review before the tag.** A model that implemented none
   of the release reviews `<previous tag>..<candidate>` in a fresh session.
   The owner starts it from the main checkout with
   `opencode run -m <provider/model> --command review-release <issue>`, or, in
   the TUI, picks the model with `/models` and runs
   `/review-release <issue>`. Neither the command nor the agent sets a model,
   so the one picked here is the one used. The reviewer follows
   `.opencode/agents/release-reviewer.md`: it opens one issue per reproduced
   finding and posts one verdict comment, `AGREE` or `BLOCK`, on the milestone
   issue. On BLOCK, fix the MUST-FIX findings in ordinary PRs, move the
   candidate, and review again. Three rounds at most: a third that does not end
   in AGREE goes to the owner. The owner may also tag without a review, and the
   issue records it.
4. **Device or manual checks run on a build of the candidate SHA, before the
   tag.**
5. **After AGREE**, package from exactly the reviewed SHA, smoke the packaged
   build, and publish. The annotated tag goes on exactly the reviewed SHA,
   never a later commit, and the release is built from a clean checkout of the
   tag (`ANDROID.md` §4, `DESKTOP.md`). Publishing — `publish_release.mjs
   --confirm`, to `diegoami/scopetta-releases` — waits for the owner's
   go-ahead. Work merged after the candidate belongs to the next release.

When a review is in, reproduce each finding before acting on it. Then fix it in
a PR (`Fixes #n`) or rebut it on the issue with evidence.

## Principles

- Keep reviewer requirements separate from **owner decisions**, and put owner
  decisions to the human with a recommended default.
- Reproduce every finding before acting, and your own claims before publishing
  them. When a check fails, suspect your harness first.
- For each passing check, say what it would have caught had the code been wrong
  — never let implementer and reviewer share a blind spot.
- A passing test is not a working feature: assert what a person would notice.
- A threshold from one measurement is a coin toss.
- Flag out-of-scope defects rather than fixing them silently.
- Change the smallest thing: targeted reads and focused edits, and show diffs,
  not whole files.

## Verification

- Gates: `npm test` (the engine tests: rules, opponent, roster, release
  decisions); `npm run check` (the UI check, ~25 min); and, after adding,
  changing or removing an assertion or a rule test, `node tools/break_ui.mjs`
  or `node tools/break.mjs`. A red gate does not merge.
- The engine tests run on every push. The full UI check runs before a push
  whose diff touches `public/**`, `tools/check_ui.mjs`, `tools/golden.json`,
  `tools/serve.mjs`, `.github/workflows/check.yml`, `package.json` or
  `package-lock.json` — and always after a rebase or a hand-resolved conflict,
  whose resolution was never measured. CI runs both jobs on every PR and every
  push to `main`; **CI is the merge gate**.
- **After any UI change, run `node tools/check_ui.mjs`.** It is not optional,
  and not only when something looks wrong. Every UI defect this project shipped
  was invisible in the diff and threw no error. The `ui-check` skill says what
  the twelve passes cover, how to read a failure, and which defect each
  threshold was written for.
- **After any engine change, run `npm test`.** The tests are deterministic
  (seeded RNG) and cover what the UI check cannot see: the capture rules, the
  scoring of every point, the trap positions, the search, and the golden
  fixture's frozen deals. They live in `tools/engine.test.mjs` and
  `tools/opponent.test.mjs`. The golden fixture freezes the plays: a formula
  change moves them by accident and the test says so, and a weight change moves
  them deliberately and the fixture is re-recorded in the same commit —
  `node tools/selfplay.mjs --golden > tools/golden.json`.

### Removing an assertion, and retuning a threshold

- Adding, changing or **removing** an assertion or rule test runs the break
  harness, and the break must trip **the assertion written for that defect**.
  A new assertion is written against deliberately broken code first and watched
  to go red, because one written against working code encodes what the code
  happens to do rather than what it should.
- **Removing** an assertion requires either a replacement that catches the same
  defect, or a recorded reason plus a mutation run on the PR naming which
  remaining assertion covers the defect and showing it fire. If no historical
  commit is available for a threshold retune, the **stand-in must be a
  deliberately broken equivalent that trips the named assertion**, not merely a
  note.
- **Retuning a threshold** re-verifies it against the commit that introduced the
  bug it names; a retune justified by one seed, one range or one machine is a
  coin toss (*Principles*), so the PR says which **second** measurement was
  used.

## What to read

Normally inspect: `public/index.html`, `public/engine.js`, `tools/*`, the root
`*.md`, `.github/workflows/*`, `.claude/skills/*`, `.opencode/*`. Normally
ignore `node_modules/`, `.git/`, `public/decks/`, `public/fonts/`,
`public/icons/`, `assets/`, `dist-release/`, `mobile/android/` (open files in
it one at a time), `desktop/src-tauri/target/`, `desktop/src-tauri/icons/` and
any binary. Read `package-lock.json` and `desktop/src-tauri/Cargo.lock` only
when dependencies are the task. Ignoring a path here does not mean it should be
deleted or gitignored.

Never read or paste `mobile/android/keystore.properties` or `*.jks`.

## The card size is a budget, and it has two terms

Discola's budget was height alone. Tressette added a width term for a fan of
ten cards. Both terms are kept here, and `--cw` is the smaller of the two — but
the width term comes from somewhere else, because a Scopa hand is three whole
cards and needs no fan:

```
height:  (100dvh − --chrome) / --rows / --ratio
width:   (100vw − 2 × --pad-inline − 4 × --gap − --seat-extra) / 5
```

The width term is the widest seat row, which is the opponent's: their pile,
three cards and the deck, five card widths and four gaps — **and, in landscape,
the two name plates at the ends of that row**, which is `--seat-extra`.
`--rows` is 3 in landscape and 4 in portrait, where the middle stacks and the
plates stack with it, so `--seat-extra` is 0 there.

Leaving the plates out is what iteration 3 shipped. It did not make a card too
big in any visible way: it made the row need more width than the screen had,
`.table` grew to its content, and `overflow: hidden auto` clipped the deck and
the player's own name plate off the right edge — 88px of it at 800x680. **A
clipped table does not scroll sideways**, so the assertion watching for
sideways scroll had nothing to say. Ask the elements where they are.

**A term that is SHORT by less than `--slack` costs nothing and shows nowhere.**
`--slack` is 8px and exists so the budget never lands on exactly zero; `--plates`
was 8px short at every portrait viewport for exactly that reason and nothing
could see it. The inflated pass runs with `--slack: 0` now, which is what makes
the arithmetic assertable rather than merely comfortable. Three terms of
`--chrome` were hand-set constants when iteration 3 was written, one found per
review round.

Every term of the width budget is a token the thing it pays for also uses:
`--plate-w` is the plate's width and half of `--seat-extra`, so the two cannot
drift. Whether the text fits inside `--plate-w` is not an opinion either — the
check asserts `scrollWidth` against `clientWidth` on every plate at every
viewport, because a flex row's items can leave the box sideways while the box
measures exactly right.

`--chrome` is **derived** from the spacing tokens next to it — never hard-code
it. It was hand-estimated three times in Discola and wrong three times,
silently, because a card too tall for its row does not error, it just lands on
the hand below.

**Every term of `--chrome` is derived, including the ones that look like
constants.** Tressette's `--plates` was 76px, forked from Discola, against two
name plates that cost 120px on a 770px-wide screen, because their type is
expressed in vw — and the player's own plate hung below the fold while the
check said `pass`. A number in that block is a defect waiting for the screen
that disagrees with it.

Anything that takes vertical space on the table is in the budget, and is in the
flow whether or not it has something in it: the line that names the proposed
capture costs `--say` whether or not a card is raised, because a row that costs
nothing while empty moves every card below it the moment it fills. Anything
that cannot be budgeted floats over the table and out of the budget — here that
is the "Scopa!" toast, as it was Tressette's declarations.

## The middle row is a table, not a trick

This is the project's own way to fail silently, and it is the risk the plan
ranks first. The middle of the table is not two cards facing each other; it is
*the table*, holding four cards at the deal and anything from zero to thirteen
after that. Thirteen is the bound the rules allow and it is reachable in play,
so the check renders thirteen rather than the largest a random deal happened to
produce.

Thirteen cards do not sit side by side on a phone. Two rules, in this order:
the middle row **wraps** in portrait, the first `ceil(n/2)` cards above; and a
row past capacity is a **fan**, stepping by

```
min(--cw + --gap, (row width − --cw) / (n − 1))
```

so cards space out while they fit and overlap when they do not. Tressette's fan
assertions move to this row with it: the strip is never under `min(24px, .45 of
a card)`, the steps are even, the last card is whole, and the row stays inside
the table. A card too narrow to touch does not error — it just makes a capture
unreachable, and a misplay costs the deal.

**The step is not the strip, and only the strip plays the card.** Which card a
tap lands on is decided by paint order, and nothing about paint order moves a
box. Iteration 3 shipped three of these: a marked card, a hovered card and the
raised card in your hand were each painted above their neighbours — by
`z-index`, by a `transform`, by a lift of 40% of a card — and each took a strip
of another card away from the thumb, leaving 22px of a 74px step beside a
marked card at 1024x768 — under the floor — on the crowded twelve-card table a
capture can actually be chosen on. The steps were even, the cards were whole, the assertions
were green. So nothing in the table row may change its paint order, the lift is
capped at the space that exists above the hand, and the check measures the
strip by hit-testing the row a pixel at a time rather than by computing it.

**The say line is a label, and a label is short.** Naming one card with its
suit runs to 43 characters and the four-card capture the check renders to 81; the
budget pays for one line of `--t-tiny`, and anything longer is not a longer
line but a line cut in half by `.say`. Three rungs, shortest that fits: the
whole thing, then without the clause naming the raised card, then "Prendi le N
carte segnate" with the brass marks carrying which.

**A rung has to meet two conditions and only one of them is a count.** The
39-character cap is about readability — past 40 the check holds a string to the
floor it holds body copy to, and `--t-tiny` is 12.5px on a phone. Whether a
rung *fits* is a width, and a count is a bad proxy for one: a line holds 34
characters at 320px, 39 at 360 and 43 at 430, and "Prendi l'asso e il fante con
il cavallo" is 39 characters and 335px. `renderSay` sets each rung and reads
the rendered height back.

**And a box sized by its content will grow the box that holds it.** The plaque
is `width: max-content`, the seat centres its items, so `.say` took its child's
max-content as its own width and the `max-width: 100%` under it resolved
against the box it had just grown — a 39-character line ran off both edges of a
320px screen. `.say` is bounded to its grid track, and the say line and the
plaque are in the check's off-screen list.

**And nothing may be drawn over it.** The raised card is lifted into the space
above the hand, and that space includes the say row — measured, it covered
120px of a 309px line at 1440x900, and the 120px was the suit the line had just
been taught to say. The line is painted above the card, on a plaque, because
shortening the lift would cost the affordance and the budget has nothing to
spare.

**A table of thirteen can never offer a capture to choose.** Thirteen is four
of one value plus one of each of the other nine, so every value is on the
table and every card in hand has a single capture. The crowded choice the
check poses is twelve.

## The engine is ours, and then it is frozen

`engine.js` holds the rules and the opponent as functions over a plain state
object — `newDeal`, `distribuisci` and `gioca` mutate it, so "pure" is the
plan's loose word for what is actually true: nothing in the file reaches
outside that object. Nothing in it touches `document`, `window`, timers or
`Math.random` — that is what lets Node run the same file as the browser, which
is what makes the self-play harness and the golden fixture possible. Randomness
arrives as an injectable `rng`, `rollProfiles(rng)` included, and `rngSeed`
keeps Tressette's warm-up: mulberry32's first outputs correlate with a small
seed, and throwing eight draws away is what fixed it. **A change to the rng is
a change to the code that produced every measurement**, so every figure citing
a seed is re-run with it.

Discola's engine was a transcription of a 1997 original, so its rule was
*change a weight, not the formula*. Here the formula is ours until v1.0 — and
from v1.0 the same rule applies for a different reason: the golden fixture
freezes the plays, and a formula change invalidates it. There are **seven**
weights and the settings sheet discloses seven — but not the seven the plan
drafted: iteration 2's ladder cut `SCOPA_BONUS`, which buys nothing measurable,
and added `TEMPO_BONUS`, which §4's tempo question turned out to want. The count is a coincidence; the membership is the measurement.

**A weight under §4's 1% bar is a question, not a verdict.** `SETTEBELLO_BONUS`
moves 0.45% of decisions and was removed on that rule, with a reason that was
false — `bestMine` is per suit, so the settebello's primiera gain collapses as
soon as any denaro is in the pile, and the engine declined the point in §3.4's
own first trap. Paired on the same deals it is worth half a point. The rule is
a proxy for *cannot change the outcome*, and it fails when a point lives in one
card. Measure the plays a weight moves, then ask whether they decide anything.

**And a term that guesses may only guess at what a human could count.** The
tempo term samples hands from `fuori`; a version that reads the opponent's real
hand scores far better and is cheating, which is most of where its gain came
from.

One exception to "score every legal play and make the highest" is deliberate
and belongs in the source with its reason: from `CODA_FROM` on — the sixth
round, where the deck is empty and the opponent's hand can be deduced rather
than guessed at — `compGioca` enumerates the position and plays it out exactly,
scoring the leaf with the real `scoreDeal`. Every opponent plays those last six
cards alike, which is also why those decisions are not in the denominator when
the roster is measured for difference: there is nothing there for a weight to
change.

Piero's weights are rolled once per session, as in Discola, where `SetProfiles`
ran from `FormCreate`. It is a house tradition now, not a Delphi accident.

## Conventions

- Player-facing text is Italian, except on the rules screen, which says
  everything twice — the owner asked for both languages, and the check measures
  each `section[lang]` on its own. Comments, commit messages and documents are
  English, and `REGOLE.md` is the exception that proves it: it is the rules
  screen's long form, for a player, so it is in the language the game is played
  in. Those two documents **cite the screen's wording rather than restating
  it** — a rule written twice in two places drifts, and the screen is the copy
  a player actually reads.
- No build step and no runtime dependencies. `playwright-core` is for the UI
  check only and is gitignored.
- The card art is the original 1997 bitmaps, copied byte for byte from
  Tressette, which copied them from Discola. Do not redraw it and do not
  repack it. `tools/pack_cards.py` is carried over in case a deck is ever
  repacked, from the BMPs in `diegoami/briscola-JS`.
- Anything learned outlives the session in one of three files and nowhere else:
  a decision in §0 of `PLAN.md`, a rule the builder must follow here, and at
  iteration 6 everything a stranger needs in `SPEC.md`.
