# Scopetta

A two-player **Scopa** for the browser: one static page, no build step, no
runtime dependencies, and the 1997 card art from
[Discola](https://github.com/diegoami/discola-web) in five decks, plus a sixth.
Nothing it draws with comes from the network — the typefaces ship with the page —
so it plays from a folder.

**Play it: [scopetta.netlify.app](https://scopetta.netlify.app)**

You against one of four opponents, one deal at a time. Everything — your
settings, your last hundred smazzate — stays in your browser.

## Playing

Your hand is three whole cards, sorted by suit and then from the strongest down,
and a card played leaves a hole rather than closing up: a card that moves under
the thumb is a misplay.

A tap plays a card. When the rule leaves a **choice** of capture — two sevens on
the table, or 4+3 and 5+2 — the first tap raises the card and marks in brass what
it would take, a tap on a table card switches the proposal, and the second tap on
the raised card plays it. By keyboard: `1`–`3` pick a card, `Space` cycles the
capture, `Enter` plays and `Escape` puts it back.

The middle of the table is *the table*, not a trick: four cards at the deal and
anything up to thirteen after that, wrapping in portrait and overlapping when the
row runs out of width.

## The rules it plays

Scopa has as many house rules as houses. **[`RULES.md`](RULES.md)** states this
one plainly in English, **[`REGOLE.md`](REGOLE.md)** in Italian. The short
version:

- Forty cards, four suits — denari, coppe, spade, bastoni. Three cards each and
  four face up; six rounds of three, thirty-six cards played.
- **Capture is compulsory**, and a card of equal value is taken before any sum: a
  seven played onto a seven, a four and a three takes the seven.
- A capture that empties the table is a **scopa**, one point — except with the
  last card of the deal, after which the leftovers go to whoever captured last.
- Three or four kings among the four face-up cards is a **redeal**.
- At the end, five things: **carte** (more than twenty), **denari** (more than
  five), the **settebello**, the **primiera**, and a point per **scopa**. A tie
  on carte, denari or primiera gives that point to nobody.

## The opponents

One formula and seven weights — the settings sheet discloses all seven. What
separates the four players is not character writing but measurement: **which
value they price and how much they fear leaving a sweepable table**. Iteration 5
asked which weights make *different* players and found the plan's own guess
wrong; the four that survived are a measured distance apart and each clears the
acceptance floors.

| | what he plays for |
|---|---|
| **Graziano** — the house standard | balance: the count, the ori, and the settebello |
| **Franco** — the value-hunter | every card taken is worth a lot, a denaro more |
| **Valerio** — the count | plays the carte point; a denaro is any other card, but the settebello is still a point he takes |
| **Piero** — rolled fresh every session | the cautious corner: leaves nothing cheap |

On seeds nothing was tuned on, 2,000 deals a matchup. The three fixed players'
rows are `SEED_FROM=5001 node tools/selfplay.mjs --roster 1000` and the same at
`SEED_FROM=20001`, with their last column from `SEED_FROM=5001 node
tools/selfplay.mjs --differ 300` (again at 20001). Piero's whole row — all three
columns — is `node tools/selfplay.mjs --piero 8 400` at both ranges:

| | vs greedy-take | vs random-legal | choices differing from Graziano |
|---|---|---|---|
| Graziano | 60.6% / 60.1% | 80.2% / 78.8% | — |
| Franco | 59.7% / 59.9% | 80.0% / 78.7% | 7.7% / 7.3% |
| Valerio | 59.7% / 59.6% | 79.7% / 78.9% | 16.3% / 15.8% |
| Piero\* | 58.4–58.8% / 58.4–59.3% | 79.3–79.7% / 78.0–78.5% | 14.8–15.8% / 13.9–14.4% |

The two figures are seeds 5001+ and 20001+; both are ranges nothing was tuned
on. Head to head the six pairs run about 48% to 52% — characters, not difficulty
tiers. The closest two, Franco and Graziano, still play a different card in
7.3–7.7% of the decisions the weights actually make, and the floors every player
is held to are 57.7% against greedy-take and 76.9% against random-legal.

\* rolled once per session, as Discola's was: he draws three weights from bands
narrow enough that he cannot roll into somebody else's game. Eight rolls —
`node tools/selfplay.mjs --piero 8 400`, at both `SEED_FROM` values — stay 13.9%
to 15.8% away from Graziano, 58.4% to 59.3% against greedy-take and 78.0% to
79.7% against random-legal.

In the last round the weights stop mattering: the deck is empty, the opponent's
hand can be deduced, and the opponent enumerates the six remaining plays and
plays them out exactly — so all four play those last six cards alike.

## Working on it

```sh
npm run setup                       # playwright-core and a Chromium, once
npm test                            # 86 engine tests, no dependencies
npm run check                       # the UI check
npm start                           # public/ on http://localhost:8080
node tools/selfplay.mjs             # the opponents against the baselines
```

`playwright-core` is the only dependency and it is a dev one: it belongs to the
check, not to the game. Both checks run in CI on every pull request, and a red one
does not merge. **[`PLAN.md`](PLAN.md)** is the plan and the record of how it was
built, including what it got wrong on the way — which is most of what the project
is worth.

## Provenance

The cards are the original bitmaps from the Delphi 3 **Discola** of 1997, copied
byte for byte, in five decks: Trevisane, Piacentine, Napoletane, Romagnole and
Francesi. The page and its stylesheet are forked from
[`diegoami/Tressette`](https://github.com/diegoami/Tressette), which forked
[`diegoami/discola-web`](https://github.com/diegoami/discola-web).

A sixth deck, **Bresciane**, is not 1997 art. It is imported from
[`mhamilt/Italian-decks`](https://github.com/mhamilt/Italian-decks) by
`tools/import_bresciane.mjs`, which composes the source's per-card images into
the same 11x4 sheet and writes `public/decks/bresciane.jpg` — a JPEG, not a PNG,
because the source is photographic and lossless PNG of it runs to ~12 MB.
Plainly: that repo is labelled GPLv3, but the images are a scan of a commercial
Teodomiro Dal Negro deck — the asso di denari carries the maker's stamp. The same
copyright grey area as the original art, and a deliberate choice rather than a
surprise.

The app icon is the **settebello**, cut from the Napoletane sheet by
`tools/make_icons.mjs` and scaled nearest-neighbour, so every pixel of it is still
a 1997 pixel.

The typefaces are Bodoni Moda and Barlow, the latin subset, served from
`public/fonts/`.

There is an Android app — the same `public/` directory in an APK, no build step
— published at
<https://github.com/diegoami/scopetta-releases/releases/latest> and described in
[`ANDROID.md`](ANDROID.md). Because the fonts ship with the page, it plays with
the radio off.

The opponent is this game's own. There was no 1997 Scopa to transcribe, so the
formula was designed here and tuned by self-play; its seven weights and the
measurement behind each name are in `PLAN.md` §3.4.
