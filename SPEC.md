# Scopetta — what was built, and why it is the way it is

The handover document. `PLAN.md` was the plan and is kept as the record of how
the project got here, including what it got wrong; this file describes the thing
that exists, and is what a stranger taking the project over should read first.

The game is published at **<https://scopetta.netlify.app>** — the Netlify site
linked to `main`, which publishes `public/` and nothing else. That URL cannot be
reached from the environment the work is done in (the network policy denies it),
so **nothing in this repository asserts that it serves**. The owner confirms it
by playing it, and `scopetta.netlify.app/PLAN.md` returning 404 is the one line
of that same pass; both are the owner's, not a check's.

---

## 1. What it is

A two-player **Scopa a due** for the browser: one static page, no build step, no
runtime dependencies, the 1997 card art from
[Discola](https://github.com/diegoami/discola-web) in five decks, plus an
imported sixth (§11). Nothing it draws with comes from the network. You against
one of four opponents, one deal at a time, everything kept in the browser.

Player-facing text is Italian. Comments, commit messages and documents are
English, except `REGOLE.md`, which is the rules screen's long form for a player.

## 2. The repository

```
public/index.html    the whole page: styles, markup, and the code that renders
                     a state object and turns taps into calls
public/engine.js     the rules and the opponent, as functions over one mutable
                     state object and nothing else
public/decks/        six sprite sheets: five are the original 1997 bitmaps,
                     the sixth (Bresciane) is an imported scan, §11
public/fonts/        Bodoni Moda and Barlow, latin subset, ~0.2 MB
public/icons/        the settebello, for the tab and the home screen
assets/              the same icon at 1024, for @capacitor/assets
tools/engine.test.mjs    the rules, on node --test
tools/opponent.test.mjs  the trap positions, the roster, the golden fixture
tools/selfplay.mjs       the harness every number in this file came from
tools/golden.json        sixty frozen deals and four weight vectors
tools/check_ui.mjs       the UI check: twelve passes
tools/serve.mjs          public/ over http, standard library only
tools/make_icons.mjs     cuts the settebello out of the Napoletane sheet
tools/import_bresciane.mjs  builds the sixth deck from its source repo
tools/release.test.mjs / release_lib.mjs  the release decisions, held in tests
tools/package_release.mjs   signed APK into dist-release/
tools/publish_release.mjs   that APK to the releases repo, on --confirm
tools/pack_cards.py      carried from Discola, for repacking a deck
mobile/              the Capacitor wrapper and the Android project
.github/workflows/check.yml  the two CI jobs: the tests, and the UI check
netlify.toml         publish public/, cache decks/fonts/icons, never the page,
                     and the /android redirect
package.json         scripts and playwright-core, the one dev dependency
RULES.md / REGOLE.md the rules as this game plays them, English and Italian
PLAN.md              the plan and the record, iteration by iteration
ANDROID.md           the APK: what is done, and what is left and whose
CLAUDE.md            the rules a builder has to follow
```

Nothing is generated at build time and nothing under `public/` imports
anything: the page opens from a folder, and every byte it draws with sits beside
it. `playwright-core` and a Chromium are needed only to run the UI check;
`npm run setup` installs them and `node_modules` is gitignored.

## 3. The engine contract

`public/engine.js` is a classic script. It touches no `document`, no `window`,
no timer and no `Math.random`, which is what lets Node run the very same file
the browser runs — `vm.runInThisContext` — and that is what makes the tests, the
self-play harness and the golden fixture possible at all. Randomness arrives as
an injected `rng`, `rollProfiles(rng)` included. It is the **state object** that
is mutable, as in Discola: `newDeal`, `distribuisci` and `gioca` mutate it and
return what the caller needs, so a caller that wants the old state copies it
first. The page owns the timers, the DOM and `Math.random`.

```
newDeal(state, rng)      shuffle, three each and four up, redeal on three re,
                         sort each hand, set who plays first
distribuisci(state)      the next round of three each
ordina(hand)             the house sort: suit, then value descending
prese(tavola, card)      every legal capture: [] to lay it down, else index sets
gioca(state, who, slot, presa)   play a card; resolves capture, scopa, round,
                         leftovers and end of deal; reports what it did
scoreDeal(state)         {carte, denari, settebello, primiera, scope, punti}
vincitore(state)         BASSO, ALTO, or null for a draw
rollProfiles(rng)        {Graziano, Franco, Valerio, Piero}
compGioca(state, P)      the opponent's {slot, presa}, given a weight vector
```

The mutation discipline is the engine's one sharp edge: `gioca` does many things
at once, so the page reads its **report** (`nuovoGiro`, `scopa`, the capture it
resolved) rather than inferring them from before-and-after snapshots.

**From v1.0 the rule is: change a weight, not the formula.** The golden fixture
freezes sixty deals play by play across three fixed profiles, and the whole
roster's weights; a formula change moves them by accident and the test says so,
and a weight change moves them deliberately and the fixture is re-recorded in
the same commit:

```sh
node tools/selfplay.mjs --golden > tools/golden.json
```

It has been recorded three times: once when iteration 2 froze Franco's twenty
deals, again at iteration 5 when the roster arrived (twenty deals per fixed
player, the roster's weights, Piero's roll included), and once more when the two
names were swapped by the owner's request (#23) — which is the same
"re-record in the commit that moves it" rule, and the reason the fixture's
`profiles` is compared against `rollProfiles(rngSeed(1))` rather than against a
literal.

## 4. The rules as implemented

`RULES.md` (English) and `REGOLE.md` (Italian) state them for a player. The
engine facts a maintainer needs:

- Forty cards, four suits: denari, coppe, spade, bastoni. Three cards each and
  four face up; six rounds of three, thirty-six cards played.
- **Capture is compulsory** (`PRESA_OBBLIGATORIA`), and **a single equal card
  beats any sum** (`SINGLE_BEFORE_SUM`): a seven played onto a seven, a four and
  a three takes the seven. `prese()` answers in index sets and is the only
  authority on what is legal; `gioca` refuses a play that must capture and does
  not.
- A capture that empties the table is a **scopa**, except with the last card of
  the deal (`SCOPA_ULTIMA = false`). After the thirty-sixth play the leftovers
  go to whoever captured last, and are not a scopa.
- **Three re among the four face-up cards is a redeal** (`REDEAL_RE = 3`): with
  three kings down and one in the deck at most one can ever be paired, so no
  scopa would be possible all deal.
- Five points: **carte** (>20), **denari** (>5), the **settebello**, the
  **primiera**, and one per **scopa**; a tie gives that point to nobody. The
  primiera scale is `7→21, 6→18, A→16, 5→15, 4→14, 3→13, 2→12, figures→10`, and
  `primieraTotale` returns `null` — not a zero — when a suit is missing.
- The variants are not played. `NAPOLA`, `ASSO_PIGLIA_TUTTO` and `RE_BELLO` are
  live branches behind constants that are off, each with a test that flips it and
  watches the branch fire. `scopa d'assi` is the exception: there is no constant,
  because houses disagree about what it means (PLAN.md §0 decision 8).
- A *partita* is one deal (§0, decision 3).

## 5. The opponent

**One formula, seven weights.** For five rounds `compGioca` scores every legal
play with the profile's weights and makes the highest, ties to the lowest slot
and then to the first capture. The one quantity every term is built from:

```
worth(c) = CARTE_WEIGHT
         + (denari ? DENARI_WEIGHT : 0)
         + (settebello ? SETTEBELLO_BONUS : 0)
         + max(0, primiera(c) − bestMine(suit(c))) × PRIMIERA_WEIGHT
```

and a play scores what it takes, then what it leaves:

```
capture:   Σ worth(t) for t in S ∪ {c}
lay down:  0
then, on the table it leaves, tavola′:
  if 0 < Σ valore(tavola′) ≤ 10:  − SCOPA_RISK_PENALTY × pHold(Σ valore(tavola′))
  − GIFT_FACTOR × Σ worth(t) × pHold(valore(t))
```

`pHold(v)` is the chance the opponent holds a card of value `v`, hypergeometric
and exact from what is public — the deck plus their hand minus the deck, which
is `fuori`. **The opponent is given nothing a human could not count**: the tempo
term samples hands from `fuori` and refuses to guess past a round boundary,
where the next hand is in a deck it may not read.

**The sixth round is played exactly, not weighed.** From `CODA_FROM = 5` the
deck is empty, the other hand can be deduced, and `compGioca` enumerates what
remains and plays it out with the real `gioca` and `scoreDeal`. All four
profiles play those last six cards alike, which is why those decisions are
excluded whenever the roster is measured for difference.

### The four

**The plan guessed the two risk terms would make four corners. One measurement
said no** (§0 decision 5, iteration 5): `GIFT_FACTOR=0` is 55.8% against
greedy-take, under the acceptance floor, and the risk corners left two candidate
names 1.78% apart — two names, one player. What separates players *and* holds the
floor is the two value weights and the cautious corner, and **the two names were
then swapped by the owner** (#23):

| name | vector `[carte, denari, settebello, primiera, scopa risk, gift, tempo]` | role |
|---|---|---|
| **Graziano** | `[1, 2, 6, 0.4, 6, 0.5, 5]` | the house standard, balanced, the default |
| **Franco** | `[4, 8, 6, 0.4, 6, 0.5, 5]` | the value-hunter: carte and denari priced high |
| **Valerio** | `[1, 0, 6, 0.4, 6, 0.5, 5]` | the count: a denaro is any other card, the settebello still a point |
| **Piero** | rolled: `GIFT∈[1.7,2.5]`, `PRIMIERA∈[1.5,2.1]`, `SCOPA_RISK∈[22,30]` | the cautious corner, fresh every session |

On seeds nothing was tuned on, 2,000 deals a matchup (`--roster 1000` at each
`SEED_FROM`), and `--differ 300` for the last column:

| | vs greedy-take | vs random-legal | choices differing from Graziano |
|---|---|---|---|
| Graziano | 60.6% / 60.1% | 80.2% / 78.8% | — |
| Franco | 59.7% / 59.9% | 80.0% / 78.7% | 7.7% / 7.3% |
| Valerio | 59.7% / 59.6% | 79.7% / 78.9% | 16.3% / 15.8% |
| Piero (eight rolls) | 58.4–58.8% / 58.4–59.3% | 79.3–79.7% / 78.0–78.5% | 14.8–15.8% / 13.9–14.4% |

The two figures are seeds 5001+ and 20001+. Head to head the six pairs run about
48% to 52%. **§3.4 of `PLAN.md` asks for 57.7% against greedy-take and 76.9%
against random-legal**, and every fixed player and every roll of Piero clears
both. Those floors are a regression guard; the table is the claim about how
strong these players are.

**A weight under §3.4's 1% bar is a question, not a verdict.** `SETTEBELLO_BONUS`
moves 0.45% of decisions and is kept anyway: `bestMine` is per suit, so the
settebello's primiera gain collapses as soon as any denaro is in the pile, and
the point lives in one card. Paired on the same deals it is worth half a point.

### Measuring any of this

```sh
node tools/selfplay.mjs --probe 1000        the standard against both baselines
node tools/selfplay.mjs --roster 1000       every player against both baselines
node tools/selfplay.mjs --differ 300        how often each pair differs
node tools/selfplay.mjs --ladder KEY 1,2,3  what one weight costs and buys
node tools/selfplay.mjs --try KEY=V,KEY=V   a whole candidate vector
node tools/selfplay.mjs --piero 8 400       what a rolled Piero is worth
node tools/selfplay.mjs --paired KEY=V      one change against the standard, paired
SEED_FROM=5001 node tools/selfplay.mjs …    any of them, on held-out seeds
```

Every match is mirrored — the same deal played from both sides — because an
unmirrored win rate mostly measures who was dealt the settebello. A difference
smaller than the harness's own noise floor is nothing, and two vectors that
differ on a tenth of a percent of plays differ on about 1.3% of deals, which is
why the paired command exists.

## 6. The layout

The card size is a budget with two terms, and `--cw` is the smaller of them:

```
height:  (100dvh − --chrome) / --rows / --ratio
width:   (100vw − 2 × --pad-inline − 4 × --gap − --seat-extra) / 5
```

`--rows` is 3 in landscape and 4 in portrait, where the middle stacks.
`--seat-extra` is the two name plates in landscape (0 in portrait, where they
stack), and `--chrome` is **derived** from the spacing tokens beside it, never
hand-set — every term of it, including the say line (which costs `--say` whether
or not it has something to say) and the plates.

**The middle row is a table, not a trick.** It holds four cards at the deal and
anything from zero to thirteen after that. It **wraps** in portrait (the first
`ceil(n/2)` above); a row past capacity is a **fan**, stepping by
`min(--cw + --gap, (row width − --cw) / (n − 1))`. The strip a card can be
tapped on is never under `min(24px, .45 of a card)`, and the check measures it by
**hit-testing the row a pixel at a time** — because which card a tap lands on is
decided by paint order, and paint order moves no box.

**The say line is a label, and a label is short.** Naming one card with its suit
runs long and a four-card capture runs longer, so `renderSay` tries three rungs,
shortest that fits, reading the rendered height back rather than counting
characters — a count is a proxy for a width and a bad one.

**Choosing a capture.** With one tap per play, the choice state is entered only
when the rule leaves one: the card lifts, the cards of the first proposal take a
brass outline, and the line says what the next tap does. A tap on a table card
switches to a proposal containing it, `Space` cycles, a second tap or `Enter`
plays.

**The running score is five rows.** Carte, ori, settebello, primiera and scope,
in the column opposite the plate; scope was the last to arrive (#22), because
the running score and the result panel must list the same five points. The box is
a fixed `--plate-h` and buys its fifth row by tightening the line, not by growing
the box.

## 7. The checks

```sh
node --test "tools/**/*.test.mjs"    94 tests, 93 passing, 1 skipped on Windows
node tools/check_ui.mjs              twelve passes, needs playwright-core + Chromium
```

Both run in CI on every pull request; a red check does not merge. The engine
tests cover the rules, the traps, the roster, the release decisions and the
golden fixture. The UI check's twelve passes: the **document**, the **fonts**
(every character inside the shipped subset, every `@font-face` loading with the
network cut, no subresource from outside), the **screens** (every screen and
every mid-deal state at seven shapes), the **table** (25 viewports × 6 decks × 4
table sizes, then the tightest again with the spacing inflated and `--slack: 0`),
the **choice**, the **sweep and beat**, the **rotation**, the **rules**, the
**plates in a fallback font**, the **sheets and the partita**, and **one whole
deal**. `.claude/skills/ui-check/SKILL.md` explains what each threshold is
calibrated against.

**Every threshold in it was calibrated against a defect that actually shipped.**
Change one only after running the check against the commit that introduced the
bug it names, and confirming it still fails there.

## 8. Persistence

`localStorage`, wrapped in try/catch, never leaving the device.

| key | shape |
|---|---|
| `scopetta.settings` | `{opponent, deck, felt, speed, showPoints, sound}` |
| `scopetta.history` | `[{t, o, d, y, a}, …]` newest first, capped at 100 |

Everything read back is validated, because what comes out of storage is not
necessarily what this build wrote. `usable()` requires the fields *and* a
timestamp inside Date's range: a finite `1e100` is outside it, and the history
sheet used to go down mid-render before the button that clears the bad data
(#13). Nothing in progress is saved.

## 9. What this project learned, which is most of its value

The full list is in `CLAUDE.md`, each rule bought by a review or a break finding
something green and wrong. The ones a newcomer should know first:

1. **An assertion only ever sees the states the check renders.** Iteration 3
   shipped a table whose row wrapped wrongly, a capture choice nobody could tap,
   and a seat below the fold, with every assertion green. When the page gains a
   state, the check gains the row that puts it there — and that is the harder
   half.
2. **Measure what the page answers, not what it contains.** Which card a tap
   lands on and which words a player can read are decided by paint order; four
   defects moved no box and every geometric assertion stayed green. Hit-test.
3. **A viewport is a state, and a change of viewport is a state.** Two rules on
   this table are read in script at render time; a page that never draws itself
   again is a page the whole grid agrees with. The check turns the phone over.
4. **A measured number and a remembered one look the same in a comment.** Every
   figure not followed by how it was obtained is a claim.
5. **An assertion behind a condition needs a fixture that meets the condition.**
   A guard that is never entered is an assertion that is never made, and it looks
   exactly like passing. Say out loud what makes an assertion optional.
6. **A new assertion is made to fail before it is made to pass.** `break.mjs`
   and `break_ui.mjs` are that, mechanised: each defect is broken on purpose, and
   the check must go red on the assertion written for it and not merely on
   something.
7. **The check's own environment is part of the check.** The fonts are served
   from `fonts/` now and a fonts pass asserts the page needs no network; the
   plates are measured in five fallback faces, because a check whose answer
   depends on the machine's fonts is not a check.

## 10. Known gaps

- **A deal in progress is not saved.** Reload and it is gone.
- **The fifth-round search was measured and does not fit.** Extending the exact
  search one round earlier costs a worst case near 1,900ms over all 84 hands,
  against a 70ms budget, so `CODA_FROM` stays at 5 (PLAN.md §3.4).
- **The tightest pair of players is 7.3–7.7% apart**, Graziano and Franco. That
  is above the "not a player" line the project holds itself to, but it is the
  floor on how different the roster is, and it is measured rather than chosen.
- **Piero varies less than his name promises.** He draws three weights from bands
  narrow enough to hold his corner and keeps the standard's other four; the
  bands are what stop him rolling into Valerio or Franco, and they are priced.
- **`SETTEBELLO_BONUS` moves 0.45% of decisions.** It is kept on a paired
  measurement (worth about half a point) rather than on the 1% bar, which is a
  proxy for "cannot change the outcome" and fails when a point lives in one card.
- **#5, the 1100x320 viewport question, is open.** At that shape `--cw` sits on
  its clamp floor, so the no-scrolling assertion tests the clamp rather than the
  derivation. It is a decision about what the check covers, not a defect.
- **The UI check needs a browser**, so it is the one thing here with a
  dependency.
- **Every deck sheet loads on the start screen**, because the picker previews
  all of them; the Bresciane JPEG adds ~0.6 MB. Lazy-loading is the fix if it
  bites.
- **The Bresciane deck is not cleanly licensed.** A scan of a commercial Dal
  Negro deck — the same grey area as the original art, documented in the README
  and the import script.
- **`android.permission.INTERNET` is still declared**, though the app makes no
  network requests: Capacitor serves the page over an intercepted
  `http://localhost` origin and a WebView will not load it without the
  permission. Dropping it can only be verified by installing the result, and
  `ANDROID.md` §7 makes that the first device to try it.
- **The APK is live**: v1.0.0 is published at
  `diegoami/scopetta-releases`, signed and checksummed, and the owner installed
  it on a tablet and played. `ANDROID.md` §6 is the release-status source of
  truth.

## 11. Provenance

The card images are the original 1997 bitmaps from the Delphi 3 Discola, copied
byte for byte, in five decks: Trevisane, Piacentine, Napoletane, Romagnole and
Francesi. Do not redraw them. `tools/pack_cards.py` is carried over in case a
deck is ever repacked.

The sixth deck is not 1997 art: `tools/import_bresciane.mjs` composes it from
[`mhamilt/Italian-decks`](https://github.com/mhamilt/Italian-decks), whose images
are a scan of a commercial Teodomiro Dal Negro deck. The app icon is a crop of
the Napoletane sheet — the settebello — nearest-neighbour scaled by
`tools/make_icons.mjs`, so every pixel of it is still a 1997 pixel.

The typefaces are Bodoni Moda and Barlow (SIL Open Font License), subset to latin
and served from `public/fonts/`.

The page and its stylesheet are forked from
[`diegoami/Tressette`](https://github.com/diegoami/Tressette), which forked
Discola. The self-hosted fonts, the dev server, the sixth deck, the icons and the
Capacitor wrapper and release scripts were adopted from discola-web and Tressette
after they diverged — issue #9, one pull request per divergence. The opponent is
this game's own: there was no 1997 Scopa to transcribe, which is §0's first
decision and the reason the formula had to be designed and tuned here.
