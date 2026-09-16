# Scopetta — architecture and plan

A two-player Scopa game for the browser, the third of the series after
[Discola](https://github.com/diegoami/discola-web) (Briscola, 1997, ported)
and [Tressette](https://github.com/diegoami/Tressette) (Tressette a due,
designed): one static page, no build step, the 1997 card art, a table lit from
above, three named opponents who share one formula and differ only in their
weights, and a UI check calibrated against the defects that actually ship.

**Status: nothing is built.** This document is the plan. It becomes `SPEC.md`
once the game exists, the way Discola's did and Tressette's will.

Tressette is the ancestor this game forks from, not Discola: Tressette already
has the engine in its own file, the check with three passes, CI with two jobs,
the line above the hand that is always in the budget, the floating toast, the
seeded rng and the golden fixture. Discola is the grandparent, and the
reference for whatever Tressette did not change.

---

## 0. Decisions that are the owner's to make

Each has a default so the plan is complete without waiting. Change any of them
and the sections below say what moves.

| # | Decision | Default in this plan | What it changes |
|---|---|---|---|
| 1 | Is there a 1997 original to transcribe? | **No.** The owner's repositories hold `discola-PAS` (Briscola) and the bitmap source, and no Scopa; the opponent is designed here and tuned by self-play, as Tressette's was. | If one exists, §3.4 becomes a transcription and Discola's fidelity contract applies to it. |
| 2 | Which Scopa? | **Scopa a due**: two players, three cards each, four on the table, the game the owner asked for. | Scopone (ten cards each, four players, partners) is a different game and a different table. See §5. |
| 3 | What is a *partita*? | **One deal, as in Discola and Tressette.** Four points plus scope, the higher total wins. Chosen twice already by the owner; kept for the house's rhythm. | The traditional match to 11 across deals would add a running score, a second result dialog and a match saved between deals. `scoreDeal` is per-deal already, so it plugs in; see §5. A draw is more common here than in Tressette — two points each and no scope is a draw — and a match to 11 is the traditional answer to that. |
| 4 | House rules | **Plain Scopa.** Capture is compulsory; a single card of equal value must be taken before any sum; a scopa with the last card of the deal does not count; three or four *re* among the first four cards is a redeal. **No** napola, no *asso piglia tutto*, no *re bello*, no *scopa d'assi*. | Napola is one scoring branch and one line in the result; each of the others is a rule branch. Every one is a named constant in the engine so a change is one line, and the about screen states what is played. |
| 5 | The opponents | **Three: Franco, Graziano and Piero**, the roster Tressette settled on after measuring that eleven weights could not carry four. Franco the house standard, Graziano loose, Piero rolled once per session. | A fourth name needs a fourth character the formula can express, and §3.4 says why that is measured before it is promised. |
| 6 | How a card is played | **One tap plays it**, Discola's rhythm, because a Scopa hand is three whole cards and not a fan of strips. When the rule leaves a *choice* of capture — two sevens on the table, or 4+3 and 5+2 — the tap raises the card instead, the table shows the first option, and the player picks and confirms. | Tressette's two taps everywhere would buy a preview of every capture at a tap per play; its check rows and its raised state exist already, so it is a change of default rather than of design. |
| 7 | Where the engine lives | **`engine.js`, a classic script beside `index.html`**, as in Tressette. Still static, still no build. | See Tressette's §3.1 for what one-file-only costs the tuner. |

None of the seven has been confirmed yet. Decision 6 is the one the owner is
most likely to feel at the table, and it is worth playing iteration 3 before
settling it.

## 1. What "in the spirit of Discola" means here

The contract, in one list. Everything else is detail.

- **One static page.** `public/index.html` plus one script and the sprite
  sheets. No framework, no bundler, no runtime dependency. Netlify publishes
  `public/` and nothing else. The page must open from a folder in ten years,
  and it does.
- **The same art, untouched.** Scopa uses the same forty-card Italian deck, so
  the five sprite sheets are copied byte for byte from Tressette, which copied
  them from Discola. Nothing is redrawn and nothing is repacked.
- **The same table.** Green baize under warm light, the icon bar, the name
  plates in the corners, the sheets for start, settings, history and about.
  The CSS is forked from Tressette and changed where Scopa needs it, not
  restyled.
- **One formula, three weight vectors, and one exception.** For five rounds of
  three cards the opponent scores every legal play and makes the highest, and
  the three opponents differ only in their weights, which the settings sheet
  discloses. In the sixth round, where the deck is empty and the other hand
  can be deduced rather than guessed at, all three play the last six cards out
  exactly and identically, as Tressette's do from trick fourteen. §3.4.
- **Player-facing text is Italian.** Comments, commits and documents are
  English.
- **The UI check runs after every UI change**, and every threshold in it names
  the defect it was written for.
- **What is different is different because the game is**, not because of
  taste. The list:

| Scopa differs | Consequence for the port |
|---|---|
| There are no tricks | A play is a capture or a card laid down. The middle of the table is not two cards facing each other; it is *the table*, up to thirteen face-up cards. This is the layout risk of the project. §3.7. |
| A capture can be a choice | The engine has `prese()`, which lists every legal capture for a card, and the UI has a state where the player chooses one. Discola and Tressette never needed either. |
| Three cards in hand, not ten | No fan in the hand; the width term of Tressette's budget moves from the hand to the seat row and to the table. |
| Cards are dealt in rounds | Six rounds of three each, no draw after a play. Hands empty out and refill; the turn flow has a "deal the next round" step instead of a "draw" step. |
| The dealer plays last | Every round of six plays begins with the non-dealer, so the dealer plays the last card of every round and of the deal. The plate says who deals. |
| Points come in four kinds, plus scope | Carte, denari, settebello, primiera, each one point or nobody's; a scopa is a point. The result is a five-line table, not two numbers. |
| Everything but the deck and the other hand is public | Both captured piles are known, so the opponent's knowledge is a count of values: which of the four of each rank are still out. Briscola counted points seen, Tressette counted voids; Scopa counts ranks. |
| No 1997 author tuned the opponent | Tuning is real work again. The harness is part of the architecture, and Tressette's harness is the one to fork. §3.4. |

## 2. Rules as they will be implemented

Scopa a due, plain. Where house rules vary, this is the one the game plays,
stated in the about screen. Every variable point is a named constant in
`engine.js`.

### 2.1 Cards

Forty cards, four suits (denari, coppe, spade, bastoni), numbered 1–10.

| Card | Number | Value for capturing | Primiera value |
|---|---|---|---|
| Asso | 1 | 1 | 16 |
| Due | 2 | 2 | 12 |
| Tre | 3 | 3 | 13 |
| Quattro | 4 | 4 | 14 |
| Cinque | 5 | 5 | 15 |
| Sei | 6 | 6 | 18 |
| Sette | 7 | 7 | 21 |
| Fante | 8 | 8 | 10 |
| Cavallo | 9 | 9 | 10 |
| Re | 10 | 10 | 10 |

The sette di denari is the *settebello*.

### 2.2 The deal

- Shuffle: a plain Fisher–Yates over an **injectable random source**, as in
  Tressette, which is what makes the golden fixture and the self-play harness
  reproducible.
- The dealer gives three cards to each player and four face up to the table.
  If three or four *re* are among the four, the deal is redone (`REDEAL_RE`):
  with three kings on the table and one left in the deck, at most one can ever
  be paired, so no scopa is possible all deal. The redeal is a reshuffle from
  the same rng, so a seed still names one deal.
- When both hands are empty the dealer gives three more each, and no more to
  the table. Six rounds in all: 36 cards played, 4 dealt to the table.
- The non-dealer plays first, in every round. The deal alternates. On a cold
  start you play first, so the opponent deals, matching Discola and Tressette,
  where you lead the first deal.

### 2.3 A play

The player puts one card from hand on the table. Then, in this order:

1. If the table holds one or more cards of the **same value**, one of them
   must be taken, and only one. Which one is the player's choice when there
   are two (`SINGLE_BEFORE_SUM`: the single card takes precedence over any
   sum, so a 7 played onto 7, 4 and 3 takes the 7).
2. Otherwise, if any set of table cards **sums to the value**, one such set
   must be taken. Which set is the player's choice when there are several.
3. Otherwise the card stays on the table.

Capture is compulsory when possible (`PRESA_OBBLIGATORIA`): a card that can
take must take. The player is free to play a *different* card that takes
nothing.

A capture that empties the table is a **scopa**, worth one point, except when
it is made with the last card of the deal (`SCOPA_ULTIMA = false`). The card
that made it is kept face up in the pile, as tradition marks it.

After the 36th play, whatever is left on the table goes to the player who
captured last. That is not a scopa.

### 2.4 Scoring a deal

| Point | Goes to |
|---|---|
| Carte | the player with more than twenty cards |
| Denari | the player with more than five denari |
| Settebello | the player who took the sette di denari |
| Primiera | the higher primiera: the best card in each suit by primiera value, summed. A player with no card of some suit cannot take the point; if neither has all four suits, nobody does. |
| Scope | one point each |

A tie in carte, denari or primiera gives that point to nobody. Four points and
the scope are the whole score; a deal without scope is between 0–4 and 4–0,
and 2–2 is common.

### 2.5 The partita

A partita is one deal (decision 3). The higher total wins; equal totals are a
draw, recorded as Discola records 60–60. Whoever did not deal this deal deals
the next.

## 3. Architecture

### 3.1 Files

```
public/index.html   markup, CSS, and the UI script: screens, rendering, input, storage
public/engine.js    rules + opponent. Pure functions over a plain state object. No DOM.
public/decks/*.png  the five sprite sheets, byte-identical copies from Tressette
tools/check_ui.mjs  the UI check, forked from Tressette and extended for the table (§3.7)
tools/engine.test.mjs   unit tests on node --test, no dependencies
tools/opponent.test.mjs the trap suite and the golden test
tools/selfplay.mjs  headless matches: profile vs profile, vs baselines; the tuning loop
tools/golden.json   the frozen plays, re-recorded by `selfplay.mjs --golden`
tools/pack_cards.py the packer, carried over unchanged in case a deck is ever repacked
netlify.toml        publish "public", cache decks/* for a year, revalidate index.html
CLAUDE.md, README.md, RULES.md, REGOLE.md, SPEC.md (when built), .claude/skills/ui-check/
```

Only `public/` is the site. Tressette's §3.1 says why the engine is a second
file and why it is a classic script rather than a module; both reasons hold
unchanged, and so does the shape: `<script src="engine.js">` in the page,
`vm.runInThisContext` in Node, the surface assigned onto `globalThis` at the
end of the file.

### 3.2 The engine (`engine.js`)

Naming follows Discola's Pascal-flavoured Italian so the three games read
alike.

```js
// cards
SUITS, valore(n), primiera(n)      // capture value and primiera value of card number n
buildDeck(), mescola(cards, rng)   // rng: () => [0,1)
rngSeed(seed)                      // a seeded rng, versioned with the engine

// a deal
newDeal(state, rng)                // shuffle, redeal on three re, three each and four up, set who plays
distribuisci(state)                // the next round of three each; called when both hands are empty
prese(tavola, card)                // every legal capture for this card: [] to lay it down, else
                                   // a list of index sets — singles only, if any single matches
gioca(state, who, slot, presa)     // play a card; presa is one of prese()'s sets, required when non-empty
scoreDeal(state)                   // {carte, denari, settebello, primiera, scope, punti: [tu, loro]}
vincitore(state)                   // BASSO, ALTO or null for a draw

// the opponent
WEIGHT_KEYS                        // the names, in table order
rollProfiles(rng)                  // {Franco, Graziano, Piero}; Piero drawn from rng
compGioca(state, P)                // {slot, presa} to play, given one profile's weights
```

Nothing in this file touches `document`, `window`, timers or `Math.random`.
Tressette's §3.2 says why `rngSeed` and the profiles live here rather than in
the harness, and both reasons hold: a fixture is only reproducible if the
generator that recorded it ships with the engine, and three callers need the
profiles.

Two things `compGioca` returns here that it did not before: a capture as well
as a slot, because a play is both; and it is called once per play rather than
once per trick, because there are no tricks.

`gioca` ends the deal itself: after the 36th play it hands the leftovers to
the last taker and sets `over`, so the search in §3.4 reaches a real end of
deal and scores it with the real `scoreDeal`, not a proxy.

### 3.3 State

One mutable object, as in Discola. `render()` reads it and writes the DOM.

```
cards[40]          the shuffled deck
next               index of the next card to deal; 40 − next is the deck
hands[2][3]        BASSO = 0 (you), ALTO = 1 (them); null = empty slot
tavola[]           the face-up cards, in the order they landed
prese[2][]         each player's captured cards; the page shows a count, the engine scores them
scope[2]           scope made this deal
ultimaPresa        who captured last; null until someone has
mazziere           who dealt; the other player plays first in every round
deveGiocare        whose turn it is
giro               which round of three, 0..5
plays              cards played this deal, 0..36
selected           the slot you have raised, when a capture needs choosing (§3.7)
scelta             which of its captures is proposed
over, dealt, cheat
opponent, deck, felt, speed, showPoints, sound   settings
```

There is no `seen` list. Everything a player could have seen is in the state
already — the table, the piles, their own hand — and what the opponent has
not seen is exactly the deck plus the human's hand, which `fuori` derives
rather than tracks.

### 3.4 The opponent

**Shape.** Two branches. For five rounds, `CompGioca`'s shape: enumerate every
legal play — each card in hand times each of its captures, or the card laid
down — score each with the profile's weights, make the highest, ties to the
lowest slot and then to the first capture. The second branch, the sixth round,
scores nothing and reads no weight; it enumerates the six remaining plays and
scores the end of the deal exactly.

**Knowledge.** Three derived facts drive everything:

- `fuori(state, me)`: every card not in my hand, not on the table, not in
  either pile — the deck and their hand together. Their hand is `h` cards of
  it, where `h` is how many they still hold this round.
- `outstanding(v)`: how many of the four cards of value `v` are in `fuori`.
- `pHold(v)`: the chance they hold at least one card of value `v`, which is
  hypergeometric and exact: `1 − C(U − outstanding(v), h) / C(U, h)` with
  `U = |fuori|`. In the first round `U` is 33; in the sixth it is `h`, and the
  probability is 0 or 1. It sharpens on its own as the deal goes, which is
  why there is no `late` factor here: Tressette's `k` existed because a
  control card's certainty grew as the tallone emptied, and this term already
  is that certainty.

The count is the whole of Scopa's information, and a player who counts is a
player who knows, late in the deal, that the only 7 left is in your hand. The
engine gives the opponent nothing the human could not count.

**The worth of a card**, the one quantity every term is built from:

```
worth(c) = CARTE_WEIGHT
         + (denari ? DENARI_WEIGHT : 0)
         + (settebello ? SETTEBELLO_BONUS : 0)
         + max(0, primiera(c) − bestMine(suit(c))) × PRIMIERA_WEIGHT
```

`bestMine(s)` is the highest primiera value I hold in suit `s`, and 0 if I
hold none, so a card of a suit I lack is worth its whole primiera value — which
is right, because without it I cannot take the point at all.

**Scoring a play** — a card `c` with capture `S`, or laid down when `S` is
empty — and then the table it leaves, `tavola′`:

```
capture:   score  = Σ worth(t) for t in S ∪ {c}  + (S == tavola ? SCOPA_BONUS : 0)
lay down:  score  = 0
then, on tavola′:
  if 0 < Σ valore(tavola′) ≤ 10:  score −= SCOPA_RISK_PENALTY × pHold(Σ valore(tavola′))
  score −= GIFT_FACTOR × Σ over t in tavola′ of worth(t) × pHold(valore(t))
```

A card laid down is in `tavola′`, so laying the settebello costs
`GIFT_FACTOR × worth × pHold(7)` without a rule that says "do not lay the
settebello"; a capture removes its cards from `tavola′`, so taking the
settebello is worth its capture and the gift it no longer is. The gift term
approximates their capture by a pair, not by a sum; a sum needs two or more
of their three cards to be exactly the right ones, and is the search's
business, not the formula's.

**The weights, v1.** Seven. Discola had twelve and Tressette eleven because
their formulas had that many terms; this one has seven, and a weight is not
invented to reach a count.

| Weight | What it does |
|---|---|
| CARTE_WEIGHT | a card is a card, toward the carte point |
| DENARI_WEIGHT | a denaro is worth more, toward the denari point |
| SETTEBELLO_BONUS | the settebello is a point on its own |
| PRIMIERA_WEIGHT | a 7 or a 6 in a suit I am weak in, toward the primiera point |
| SCOPA_BONUS | a scopa is a point |
| SCOPA_RISK_PENALTY | leaving a table they can sweep, by the chance they hold the card |
| GIFT_FACTOR | leaving cards they can pair, by their worth and the chance they hold the value |

**What Tressette learned about weights, applied before tuning rather than
after.** Six of Tressette's eleven weights could not move a play at any
magnitude, and character turned out to be bought with a single weight at a
point of win rate per percent of plays changed. So here iteration 2 measures,
for each of the seven, how many plays it moves across its range *before*
anyone writes a dossier. A weight that moves under 1% of plays over 6,000
deals is removed, not tuned around, and the settings sheet discloses what is
left. There is one structural reason to expect better than Tressette: both
risk terms are multiplied by a probability that varies continuously through
the deal, so a change to `SCOPA_RISK_PENALTY` changes an argmax somewhere in
most deals, where Tressette's control penalties changed an argmax almost
nowhere. The temperaments are written against that dial — Graziano goes for
scope and risks them, Franco does not — and the measurement decides whether
the dial is real.

**The sixth round is played exactly, not weighed.** When `giro` is 5 the deck
is empty and `fuori` is their hand exactly. `compGioca` enumerates the six
plays that remain, every capture choice included, plays each line to the end
of the deal with `gioca`, scores the leaf with `scoreDeal`, and takes the play
that maximises my points minus theirs. The leaf is the real rule — leftovers
to the last taker, no scopa on the last card, a tied primiera to nobody — so
the search knows that taking one worthless card on the 35th play is worth the
whole table on the 36th. The tree is at most a few hundred leaves; it costs
nothing. As in Tressette, it refuses what it cannot deduce: if `fuori` is not
the size of their hand, it falls back to the formula.

**The named next move on the formula**, while the contract still allows one:
the fifth round, where `fuori` is nine cards and their hand is three of them.
Eighty-four possible hands, twenty ways the deck's last six can fall, a
twelve-play tree under each — about 1,700 determinisations, or a sample of
them, under an expectimax. Whether it fits the budget Tressette set — a worst
case near 70ms, because a hang once a deal is not a trade this game makes —
is measured in iteration 2, first decision of the round and worst case, not
mean. If it fits, `CODA_FROM` moves to the fifth round; if a sample of fifty
fits and the full set does not, the sample is the answer and its seed is part
of the fixture. And the same coupling Tressette found holds: every round the
search takes revalues the weights that were doing work there, so moving
`CODA_FROM` means re-measuring the weights, not just re-recording the fixture.

The case that shows why the formula cannot do it, found by brute force
over random endings rather than built by hand: sixth round, the last two cards
each, I hold a 6 and a 5, they hold a 2 and a 3, the table is a re, a 7, a
cavallo and an asso, and they play last. Neither of my cards takes anything,
and to the formula the two lays are the same play: a table of twenty-seven
cannot be swept, and nothing on it pairs with a 2 or a 3. Lay the 6 and they
lay the 2; my 5 takes nothing; their 3 takes the asso and the 2, the last
capture of the deal, and the leftovers with it — eight cards to none. Lay the
5 instead and whichever card they lay, my 6 takes the asso and the 5, their
last card takes nothing, and the eight cards are mine. Both lays score zero,
so the formula plays the lower slot; only playing it out finds the 5. Over
20,000 random two-card endings scored as cards captured, the one-ply formula
gave away six or more cards in about one ending in sixteen, which is what the
sixth round's search is worth before anyone tunes a weight.

**The temperaments.** Franco balanced and the default, Tressette's house
standard under the same name; Graziano loose, taking every scopa it can and
leaving the table low to bait one; Piero rolled once per session by
`rollProfiles`, the house tradition since `SetProfiles` ran from `FormCreate`.
Whether these are three characters or one is §4 iteration 5's measurement, as
it was in Tressette, and the dossier says what was measured.

**The contract, from v1.0 on.** Tressette's rule: the formula is ours until it
ships; after that, *change a weight, not the formula*, because the golden
fixture freezes the plays.

**Tuning.** `tools/selfplay.mjs`, forked from Tressette's — the mirrored
seeds, `--differ`, `--ladder`, `--probe`, `--golden` — plays N deals between
any two of {profile, random-legal, greedy-take} with a seeded rng and reports
win rate, mean points per deal, draws, and the noise floor. Greedy-take here:
make a scopa if it can, else the capture with the most cards, ties to the
most denari, else lay the card of least worth. It never looks at what it
leaves, which is the habit a real opponent has to beat.

**The bars are measured, not written.** Tressette's plan set 95% and 70% from
intuition and both were wrong, one unreachable by a cheating oracle and one
cleared by so much it stopped being a bar. So this plan names the method and
not the numbers: iteration 2 measures the tuned Franco on seeds no tuner saw,
against both baselines, and sets each bar two points under what it measured.
Those become §3.4's acceptance numbers, and iteration 5 holds the roster to
them. One number the plan does commit to: no profile beats another by more
than 65% — characters, not tiers.

**Trap positions**, because a win rate hides a stupid habit, and every one
with a real choice in it, because a position with one legal play asserts
nothing:

- the settebello and a 7 of coppe on the table, a 7 in hand: take the
  settebello;
- a 7 in hand, the table 4, 3, 5, 2, and the 4 is a denaro: take 4 and 3;
- a hand of a 2 and a 5, the table a 6, three 8s still out and no 3s: lay the
  5 (table 11), not the 2 (table 8, a scopa waiting);
- a scopa on offer for one card, or three cards without the scopa, first
  round: the weights decide, and the trap asserts only that the search-free
  branch takes the scopa when the three are worthless;
- 35th play, I can take one worthless card or lay one: take it, for the
  leftovers;
- the last card of the deal can empty the table: the score shows no scopa
  for it.

Each is written against a broken engine first, per iteration 1's rule below.

### 3.5 Turn flow

Discola's, with rounds instead of draws.

```
newDeal ──► render ──► (if they play first) computerPlay
humanPlay(slot, presa) ──► take or lay ──► sweep ──► hands empty? ──► distribuisci ──► whoever plays first
                                                  └── no ──► computerPlay
36th play ──► leftovers to the last taker ──► finish ──► scoreDeal ──► record ──► result dialog
```

Timers drive the opponent through `later()` with the epoch guard, exactly as
in Discola and Tressette, for the same reason: an abandoned deal must not keep
playing itself behind the start screen. Tressette's iteration 4 found that a
deal abandoned during the sweep left the sweep's end state behind and painted
every later trick transparent; the fix — `discard()` flushes the sweep
wherever you are going — is forked with the sweep.

### 3.6 Screens

The same five views and the same two scrims. Tressette's screen map holds
exactly, and its iteration 4 findings about that map — *nuova mano* deals one
and does not go to the start sheet, the result dialog closes whatever sheet is
in front, the confirm never opens over a deal that is already recorded — are
forked with it rather than rediscovered.

```
start ──Gioca──► table ──┬─ reload icon ─► confirm ─► table (new deal)
                         ├─ history icon ─► history ─back─► table
                         ├─ settings icon ─► settings ─back─► table
                         └─ about icon ────► about ───back─► table
table ──36 plays──► result ──┬─ Ancora ────► table (new deal)
                             └─ Cambia ────► start
settings ──Cambia avversario──► confirm ─► start
```

- **start** — opponent chips and dossier, deck row, Gioca pinned in the
  footer. Unchanged in structure.
- **table** — the icon bar; the opponent's seat (their pile, three cards face
  down, the deck with its count); the table; your seat (the line that names
  the proposed capture, three cards, your pile); the plates in the corners,
  with a *mazziere* tag on whoever dealt. Each plate shows that player's
  scope always — a scopa is public — and, with show-points on, carte and
  denari taken and whether the settebello is in. A transient toast for
  "Scopa!", floating, out of the budget, as Tressette's declarations are.
- **settings** — deck, felt, rhythm, show points, sound, change opponent,
  and the weights disclosure: seven, with a note that the sixth round uses
  none of them.
- **history** — tally, record against each opponent, the last hundred
  smazzate.
- **about** — what the game is, which Scopa it plays (§2, every constant
  named), where the cards come from.
- **confirm** — guards abandoning a deal in progress.
- **result** — end of the deal: five lines (carte 23–17, denari 6–4,
  settebello, primiera 78–63, scope 1–0), the two totals, a one-line note,
  Ancora and Cambia. The note is computed, as Tressette's is: score the deal
  again without each component and say which one changed hands — "Hanno
  deciso le scope", "La primiera ha deciso la smazzata" — falling back to the
  margin. A phrase that can be wrong about the deal it describes is worse
  than no phrase.

Keys: `1`–`3` play a card, or raise it when a capture needs choosing; `Space`
cycles the proposed capture; `Enter` confirms it; `Escape` puts the card
back, or backs out of a sheet. The `6winouj64ie` easter egg is kept, and it
comes back to the table: only `1`–`3` are card keys here, so the `6` and the
`4` fall through to the buffer as they did in Discola. Tressette had to move
it because every digit played a card.

### 3.7 Layout: the middle row is a table, not a trick

Discola's card size is a **height** budget, `(100dvh − --chrome) / --rows /
--ratio`, clamped, with `--chrome` derived from the spacing tokens beside it.
Tressette added a **width** term for a fan of ten. Both are kept; what changes
is where the width term comes from and what the middle row holds.

**The hand is three whole cards again.** No fan, no strip, no two-tap
selection for reachability. The width term is the widest seat row — the
opponent's, which is their pile, three cards and the deck, five card widths
and four gaps:

```
height:  (100dvh − --chrome) / --rows / --ratio
width:   (100vw − 2 × --pad-inline − 4 × --gap) / 5
--cw:    clamp(floor, min(height, width), cap)
```

On a 360px phone that is about a 59px card, which is about what Tressette's
fan got and a little less than Discola's three; at the tightest landscape
viewport the height term binds, as it always has. Estimates, to be measured.

**The table is the risk.** It holds four cards at the deal and anything from
zero to thirteen after that: thirteen is the bound the rules allow — the four
dealt cards can be four cavalli, and 10, 8, 7, 6, 5, 4, 3, 2, 1 can then be
laid in that order without any of them summing to another — and it is
reachable in play, since a card that takes nothing may be laid whenever the
player has one. So the check renders a table of thirteen, not the largest a
random deal happened to produce; the engine test reports the largest it saw
in 10,000 deals so that the two numbers can be compared, and if a deal ever
produced fourteen the proof above is wrong and the bound moves.

Thirteen cards do not sit side by side on a phone. Two rules, in this order:

1. **The middle row wraps in portrait.** `--rows` is 3 in landscape and 4 in
   portrait, Discola's numbers for Discola's reason — the middle stacks — and
   the page splits the table across the two rows, the first `ceil(n/2)` cards
   above. In portrait the width term binds anyway, so the fourth row costs a
   phone nothing; it costs a portrait tablet about a quarter of its card, and
   that is the trade.
2. **A row past capacity is a fan.** The step between table cards is
   `min(--cw + --gap, (row width − --cw) / (n − 1))`, with `n` set on the row
   by `render()`, so cards space out while they fit and overlap when they do
   not. Tressette's fan assertions carry over to it: the strip is never under
   `min(24px, .45 of a card)`, the steps are even, the last card is whole and
   the row stays inside the table. At thirteen on a 360px phone the estimate
   is seven cards in a row at a 45px step, comfortably above the floor; on a
   1920px desktop at the 156px cap, thirteen overlap at about 140px, which is
   a fan in name only.

**Choosing a capture.** With one tap per play (decision 6), the choice state
is entered only when the rule leaves one. The card lifts as Tressette's does,
the cards of the first proposed capture take a brass outline, the line above
your hand says what the next tap does — "Prendi il 4 e il 3 con il 7" — and a
tap on any table card switches to a capture that contains it, `Space` cycles,
a second tap on the raised card or `Enter` plays it. The proposal is the first
set in `prese()`'s order, which is the table's own order: neutral, not the
opponent's opinion of the best one. That line costs `--say` whether or not it
has something to say, in flow, in `--chrome`, because Tressette found what a
row that costs nothing while empty does to the cards below it.

**The piles.** Each is a face-down stack with a count badge, the scope face
up across its top edge as tradition shows them. The count is the engine's
`prese[who].length`, and the deal pass asserts it after every play, because a
badge that lags the state is the kind of defect nothing throws for.

**The check gains its rows and its assertions**, each written against a
deliberately broken page before the good one, per the `ui-check` skill:

1. the table at 0, 4, 8 and 13 cards, in every deck at every viewport, with
   the spacing inflated: no card leaves the table, no card overlaps either
   hand, the fan floors hold, and your seat is above the fold under all four;
2. a card raised with a choice: exactly the cards of the proposed capture are
   marked, the line says what the tap will do, and switching the proposal by
   tapping a table card marks exactly the new set;
3. the toast floats: it takes no space in the flow and is never clipped;
4. the badges agree with the engine after every play of the deal pass, and
   the table's DOM count agrees with `tavola.length`;
5. the deal pass chooses captures both ways — by accepting the proposal and
   by tapping a table card — and reads the table after every play, because
   Tressette's issue #7 is the rule that a pass that drives the page is not
   a pass that reads it;
6. the last play: the table is empty in the DOM after the leftovers go, and
   the result's five lines are what `scoreDeal` returned.

The remaining assertions — one screen visible, text floors, tap targets,
hand above the fold, rows drift, inflated spacing, the head tags, the raised
card, the say line, the abandon paths, the result over a sheet — carry over
unchanged from Tressette, because the defects they name are just as possible
here.

**Every term of `--chrome` is derived.** Tressette's `--plates` was a
hand-set 76px against plates that cost 120px, and the check said pass while
the player's own plate hung below the fold. The plate's height is set from its
own type here as it is there, and a number in that block is a defect waiting
for the screen that disagrees with it.

### 3.8 Persistence

`localStorage`, wrapped in `try`/`catch`, never leaving the device.

| Key | Shape |
|---|---|
| `scopetta.settings` | `{opponent, deck, felt, speed, showPoints, sound}` |
| `scopetta.history` | `[{t, o, d, y, a}, …]` newest first, capped at 100 |

The same two keys as the other two games under a third prefix. `y` and `a`
are the deal's totals, scope included. Nothing in progress is saved.
`loadHistory` drops what it cannot draw, which Tressette learned when one
entry written by something else took the sheet and its clear button down.

### 3.9 Sound, motion, deployment

Card sounds synthesised with WebAudio as in Discola; a scopa gets a second,
brighter one. `prefers-reduced-motion` honoured. Netlify site linked to
`main`, publishing `public/` and nothing else, `decks/*` immutable,
`index.html` revalidated on every load.

## 4. Iterations

Each is independently shippable, and each ends with its check green. The
shape is Tressette's, because it worked; what Tressette learned in each one is
written into the corresponding iteration here as a rule rather than left for
this project to learn again.

### 0 — Scaffold (½ day)

Fork from **Tressette at `caaef0f`** ("Iteration 5 — the opponents"), and
write the commit into the pull request. Before forking, check whether
Tressette has moved: its iteration 6 is open, and a `SPEC.md` or a README
rewrite may land.

Copy from Tressette: `public/decks/`, `tools/pack_cards.py`,
`tools/check_ui.mjs` and the `ui-check` skill (both **dormant** until
iteration 3, worded so in `CLAUDE.md`), `netlify.toml`, `.gitignore`,
`.github/workflows/check.yml` with the engine job only. Expand the stub
`CLAUDE.md` into this repo's version: the same rules, reworded for the table
row rather than the fan. Empty `public/index.html` with the doctype,
`lang="it"`, the charset, the viewport meta, the title and the font links —
the four head tags the document pass asserts. A two-line `README.md`
pointing at this file; iteration 6 rewrites it.

**Done when** the repo holds exactly what the paragraph above names, and
nothing else.

### 1 — Engine and tests (1 day)

`engine.js` per §3.2, with a seeded rng. `tools/engine.test.mjs` on
`node --test`: values and primiera values; the deal, the redeal on three re,
six rounds; `prese` — single before sum, every sum found, none invented,
empty when nothing takes; `gioca` refuses a play that must capture and does
not, and a capture that is not one of `prese()`'s; a scopa counted, and not
counted on the 36th play; the leftovers to the last taker; `scoreDeal` on
fixed piles, every tie, primiera with a missing suit; `vincitore`; and over
10,000 random-legal deals, every card ends in one pile, every point is given
at most once, and the largest table seen is printed and asserted at or under
thirteen.

**The rule from Tressette's iteration 1, which applies from the first test
here:** a test that checks a total checks that the books balance, not that the
entries are in the right accounts. Tressette's 10,000-deal test scored every
deal at exactly eleven points and would have passed a trick going to the
lower card. The Scopa equivalent is "forty cards end in the two piles",
which passes a capture credited to the wrong player. So every rule test is
broken deliberately after it is written — the wrong player credited, the sum
rule skipped, the scopa counted on the last card — and watched to fail. A
test that still passes is decoration. Tressette's tally was 31 breaks, 30
caught.

Three tests Tressette wrote that could not fail, so that nobody writes them
again: one that asked the engine who won and then checked the points went to
that player; one on a shuffle where the case it meant to test never came up;
one that searched the source for the word `document` and found it in the
comment promising not to use it.

`check.yml` runs `node --test 'tools/**/*.test.mjs'` — the glob, because
Node 22 reads a bare directory as a module path — on pull requests and on
pushes to `main` only, so a pull request branch does not run twice.

**Done when** the tests pass locally and in the Action, and the engine has no
DOM reference.

### 2 — Opponent v1 and the self-play harness (1–2 days)

The formula in §3.4 with one profile; `tools/selfplay.mjs` forked from
Tressette's with Scopa's two baselines; the trap suite; the sixth-round
search. Then the questions, each answered by a number in the pull request:

- **Which weights move plays.** `--ladder` each of the seven across its range
  and count the plays that change over 6,000 deals. Under 1% at any value:
  the weight goes, before the settings sheet ever shows it. This is
  Tressette's iteration 5 measurement done first rather than last.
- **The bars.** Tune Franco against greedy-take, then measure on seeds
  5001+ against both baselines, and write the two numbers into §3.4 two
  points under what was measured.
- **The fifth round.** Time the first decision of the round under the full
  determinisation and under a sample of fifty, worst case over 200 deals. Set
  `CODA_FROM` by the 70ms budget, and if it moves, re-ladder the weights,
  because they are coupled.
- **The tempo question.** Does the opponent lay low cards into a table it
  could have swept next turn had it waited? A 2-ply term is the candidate if
  the harness says yes, and it is decided here, before the formula freezes.

Then the golden test: seed 1..20, both seats `compGioca`, the sequence of
plays and captures frozen in `tools/golden.json`, re-recorded only by
`node tools/selfplay.mjs --golden > tools/golden.json`.

**The rule from Tressette's iteration 2:** a position built by hand to be
convenient is built to be wrong in the way that matters. Four of its trap
tests, over three iterations, were written against positions where the bug
they named could not appear, one of them written to catch a bug found in the
review before. Every trap here carries its own real-choice check, so a new one
gets it whether or not anyone remembers.

**Done when** the acceptance numbers are measured and written into §3.4, the
weights that stay are the ones that move plays, and the golden fixture is
committed.

**Risk.** This is where the project can quietly fail, as it was in Tressette:
an opponent that is merely legal is no fun, and one that never leaves a low
table is no fun either. Budget the second day and play it yourself before
moving on.

### 3 — The table (2 days)

Fork Tressette's CSS and table markup **from the commit recorded in §7.5**,
checking first whether it has moved. Take the seat, the plate derived from its
own type, the say line, the toast, the sweep with its flush, the epoch guard
and `discard()`, the keyboard path through `tapped`. Leave the fan behind in
the hand and bring it to the table row.

Build the seats with the piles and the deck, the table row with its wrap and
its fan, the capture-choice state, the badges, the mazziere tag, the toast.
Then the check: the copy on hand is Tressette inside — ten-card fixtures,
declarations, `tressette.history` — so rewrite the fixtures and the key,
keep the document pass and every assertion §3.7 says carries over, and add
the six rows and assertions of §3.7 against a broken page first: a table row
with the step floor removed, a badge that does not update, a toast in flow.
Run it at all nineteen viewports in all five decks, and add the `ui` job to
`check.yml`.

**The rule from Tressette's iterations 3 and 4, which is the one this
iteration is most likely to break:** an assertion only sees the states the
check renders. Tressette shipped a table where a finished trick was never
drawn, a declaration was cut in half at every phone width and the player's
own plate hung below the fold, with every assertion green, because no pass
ever rendered a finished trick, an announcement, or measured below the
cards. Scopa's states that exist only mid-deal: a table of thirteen, a
choice of captures, a scopa, a hand between rounds (empty for a beat while
the next three are dealt), the 36th play and the leftovers, a pile with
three scope showing. Each needs the row that puts the page there, and adding
the state is the harder half of adding the assertion. Two more clauses from
the same iterations: an assertion that waits, or that looks after the page
has healed, passes on the defect it was written for; and a pass that drives
the page is not a pass that reads it.

**Done when** a full deal can be played against Franco, choosing a capture at
least once by each path, and both jobs are green.

### 4 — Result and sheets (1 day)

The result dialog with its five lines and computed note, the start,
settings, history and about sheets, the confirm scrim, keys, sound, the easter
egg at the table, `RULES.md` and `REGOLE.md` from §2. The sheets are
Tressette's, forked with the stylesheet; what changes is the result's shape
and the history counting *smazzate*.

Decisions 3, 4 and 6 are the ones to have confirmed before this iteration
starts, because the result dialog, the about screen and the tap rhythm
depend on them.

**Done when** a deal can be played end to end, abandoned with the confirm,
and shows up in history with the right score; and every dialog-over-sheet
path Tressette's iteration 4 found has its row here.

### 5 — The opponents (1 day)

Three weight vectors, tuned to the acceptance numbers and measured for
difference. Dossier text. The weights disclosure. The README table.

**Read Tressette's iteration 5 before starting.** Character there was bought
almost entirely with one weight, at about a point of win rate per percent of
plays changed, and the owner chose a point on that curve: a Graziano who
differs on one play in ten and wins a little less. Iteration 2 has already
measured which of Scopa's weights move plays, so this iteration starts with
the ladder rather than ending with it: move `SCOPA_RISK_PENALTY` and
`SCOPA_BONUS` off Franco's values, measure plays differing and win rate at
each step, and put the table in the pull request for the owner to choose
from. Piero's ranges keep every weight above whatever cliff the ladder finds,
because below it a rolled player stops playing Scopa.

**Done when** the three beat the baselines, none dominates another, each has
a one-line character you can recognise across a few deals — or, if the
ladder says that is not reachable with these weights, when the decision
taken instead is written into §0 and the dossier tells the truth. The fixture
grows with the roster: twenty deals per tuned player and every weight of all
three, Piero's rolled seven included.

### 6 — Ship (½ day)

Netlify site. README with the rules as played and provenance. `SPEC.md`
written from this document and what actually got built, including the
"known gaps" list.

**Done when** the live URL plays and the handover document would let a
stranger take the project over.

**Total: 7–8 days**, with the table and the opponent the two estimates that
can slip.

## 5. Out of scope, deliberately

| Not built | Why |
|---|---|
| Scopone, scientifico or otherwise | A different game: ten cards each, four players, partners, a whole theory of *spariglio*. Nothing here precludes it — `prese`, `gioca` and `scoreDeal` are the same rules — but the table is not. |
| A match to 11 across deals | The traditional form, left out on the owner's standing call for one deal per partita. `scoreDeal` returns per-deal points, so a running total, a second dialog and a saved match are additions, not a redesign. The case for it is stronger here than in Tressette, because a single deal draws more often; §0 says so. |
| Napola, asso piglia tutto, re bello, scopa d'assi, scopa a quindici | Variants. Each is a named constant or a branch away, and the about screen says which Scopa this is. |
| Multiplayer, accounts, a server | Same reason as Discola: any server is an operational liability that outlives interest. |
| A framework or build step | Same reason as Discola. |
| Localisation | The terms of art are Italian. |
| A difficulty slider | The three opponents are the difficulty. |
| Looking through the piles | Tradition forbids it, and show-points already tells you more than the piles would. |

## 6. Risks, in order

1. **The table row.** A middle row of variable size is the one thing neither
   ancestor had. The wrap, the fan and the thirteen-card row in the check are
   the mitigation; the fallback if a phone in landscape cannot hold thirteen
   at the strip floor is a second table row there too, which the budget
   expresses as `--rows: 4` and costs a card size the check will report.
2. **The opponent.** No author tuned it. The harness, the per-weight ladder
   done first, the exact sixth round and the measured bars are the
   mitigation, and iteration 2 has the slack.
3. **The capture choice.** A state the player enters rarely and must
   understand at once. The outline, the line that says what the tap does, and
   the two ways to switch are the mitigation; decision 6 is the escape hatch
   if one tap per play turns out to hide the rule rather than teach it.
4. **House rules.** Scopa has more of them than Tressette. Every one is a
   constant, the about screen states the set played, and `RULES.md` says it
   in English so the owner can tell whether it is the Scopa they know.

## 7. How this gets built

Written for a builder starting with no context. Read this section, then the
rest of this document, then Tressette's `PLAN.md` — its iteration
retrospectives are the part that matters — then Discola.

### 7.1 One builder, one iteration per session

There is no orchestrator agent. This document is the plan and the owner
decides when each iteration starts. Each iteration is one session, opened
with:

> Do iteration N of PLAN.md in `diegoami/Scopetta`. Read PLAN.md in full
> first, then `diegoami/Tressette` (`CLAUDE.md`, `PLAN.md`, `public/engine.js`,
> `public/index.html`, `tools/check_ui.mjs`, `tools/selfplay.mjs`,
> `.claude/skills/ui-check`), then `diegoami/discola-web` (`SPEC.md`), then
> the previous iteration's pull request. Work on a branch named
> `iteration-N-<slug>` off the default branch. Stop at the iteration's "Done
> when": do not start the next one. Finish with every check green, commit,
> push, and open a pull request with the description in §7.4.

Why one iteration and not several: the defects this kind of page ships are
invisible in a diff and show up only in the check or at the table, and a
session that holds the whole of one iteration in context catches them.

Why no orchestrator: the iterations are sequential and coupled — the table
needs the engine's `prese`, the check needs the table's markup, the profiles
need the harness. Subagents earn their keep in one place: read-only
exploration of the two ancestors while the builder works.

Both ancestors are references. If they are not beside this repo, clone them:
`https://github.com/diegoami/Tressette` and
`https://github.com/diegoami/discola-web`.

### 7.2 Model and effort

| Iteration | Effort | Why |
|---|---|---|
| 0 Scaffold | medium | copying and rewording |
| 1 Engine and tests | medium | well specified in §2 and §3.2; `prese` is the one function with edges |
| 2 Opponent and harness | **high** | the project's first way to fail quietly; the ladder and the timing are measurements |
| 3 The table | **high** | the second; the table row and the choice state, then the check's new rows |
| 4 Result and sheets | medium | Tressette's screens, forked |
| 5 The opponents | medium | the harness does the work; the builder reads numbers |
| 6 Ship | medium | docs in the house voice |

The builder is the Opus tier throughout. Do not drop to a smaller model on the
cheap iterations: a missed layout defect costs more than it saves.
Exploration subagents the builder spawns to read the ancestors can be the
small tier. Iterations 2 and 3 run alone.

### 7.3 The reviewer

Every pull request gets one review from a **fresh context** — a new session or
a subagent that has not seen the work — at high effort, same tier as the
builder. Fresh matters more than different: the builder cannot see its own
diff, and a reviewer that shares its context cannot either.

The reviewer is given three things: this document, the diff, and the check
output pasted into the pull request. It checks, in order:

1. the rules against §2, line by line — the order single-before-sum, the
   compulsory capture, the scopa on the last card, the leftovers, the redeal,
   every tie in the scoring;
2. the opponent against §3.4 — the formula as written, the weights named as
   listed and no more, no DOM or `Math.random` in `engine.js`, the search
   scoring with the real `scoreDeal`;
3. that the UI check actually ran, on this commit, and that every assertion
   still names a defect and every new one was shown to fail first;
4. the iteration's "Done when", item by item;
5. Italian on the page, English in comments and commits.

The reviewer reports; it does not fix. The builder fixes in the same pull
request, and the reviewer looks once more. A finding the builder disagrees
with goes to the owner, in the pull request, not into a silent merge.
Tressette's reviews found, across four iterations, fourteen defects in the
page and six tests that could not fail, and none of them in a break; expect
the same rate and budget for it.

### 7.4 GitHub, at the lowest useful ceremony

- **One pull request per iteration.** Its description has four parts: what
  was built; the iteration's "Done when" as a ticked list; the check output,
  verbatim; what was left out and why.
- **CI on every pull request**: the engine tests from iteration 1, the UI
  check from iteration 3. A red check does not merge. Nothing is skipped or
  quarantined to get to green.
- **Issues only for defects found by playing** after an iteration has merged.
  Label them `defect`. Each is closed by a pull request that fixes the page
  *and* adds the assertion that would have caught it, written against the
  broken commit first.
- **No project board, no milestones, no issue per iteration.** This document
  holds the plan; a second copy goes stale.
- **Commit messages** as in the house's history: one line saying what changed
  and why, in English, imperative mood, no ticket numbers.

### 7.5 What outlives a session

Nothing lives in a session's memory. Anything learned goes into one of three
files: a decision into §0 of this document, a rule the builder must follow
into `CLAUDE.md`, and, at iteration 6, everything a stranger needs into
`SPEC.md`. If a session ends with something only it knows, that is a defect
in the handoff.

**The ancestors move.** Tressette is a live repository with its iteration 6
open and defects being filed against it; Discola moved twice during
Tressette's iteration 0 alone. Anything forked is a snapshot with a commit.
When an iteration forks, it records the commit here and in its pull request,
and the next iteration that forks checks for movement first.

| Forked | From | At | By |
|---|---|---|---|
| decks, tools, skill, `netlify.toml`, `check.yml` | Tressette | `caaef0f` | iteration 0 |
| CSS and table markup | Tressette | to be recorded | iteration 3 |
| selfplay harness | Tressette | to be recorded | iteration 2 |

Discola's last recorded commit, for whatever Tressette did not change, is
`22c4b9c`.

### 7.6 The owner's part

Confirm the seven defaults in §0, or change them: 1, 2, 5 and 7 before
iteration 1; 3, 4 and 6 before iteration 4, and 6 is best judged by playing
iteration 3 first. Start each iteration. Play the game after iterations 3 and
5 — the harness measures strength, and only a player can measure whether it
is fun — and file what you find as `defect` issues.

## 8. Glossary

| Italian | Meaning |
|---|---|
| scopa | the game, and a capture that sweeps the table clean: a point |
| scopetta | the diminutive; this game's name, as Discola was Briscola's |
| smazzata | a deal, thirty-six plays |
| mano | a round of three cards; also, loosely, a deal |
| partita | a match; here one deal, as in Discola |
| presa | a capture |
| calare | to lay a card on the table without taking |
| tavola | the table: the face-up cards |
| mazziere | the dealer, who plays last |
| mazzo | the deck, dealt out in six rounds |
| carte | the point for more than twenty cards |
| denari, ori | the suit, and the point for more than five of it |
| settebello | the sette di denari, a point on its own |
| primiera | the point for the best card in each suit, sevens highest |
| napola, napoletana | asso, due and tre of denari, in the variant this game does not play |
| spariglio | the theory of which ranks are paired and which are odd; Scopone's word, mostly |
| avversario | opponent |
