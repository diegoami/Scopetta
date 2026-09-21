# Scopa a due — the rules as this game plays them

Scopa has as many house rules as it has houses. This is the version the game
deals, stated plainly, so that you can tell whether it is playing the Scopa you
know. The Italian version is `REGOLE.md`.

The rules screen inside the game carries the same rules in both languages, in
short: what fits a screen somebody reads on a phone mid-deal. This file is the
long form and the two are not independent — a rule stated twice in two places
drifts — so where the two overlap, the screen's own wording is quoted here
rather than paraphrased, and `node tools/check_ui.mjs` asserts that each half of
that screen is still the rules rather than a note.

Every rule that varies between houses is a **named constant** in
`public/engine.js`, and this file names it, so that changing one is a line
rather than an excavation.

## The deck

Forty Italian cards in four suits — **denari, coppe, spade, bastoni** — numbered
1 to 10. There are no 8, 9 and 10 as such: the figures are the **fante** (8),
the **cavallo** (9) and the **re** (10).

A card has two values, and they are not the same number:

| card | captures as | primiera |
|---|---|---|
| sette | 7 | **21** |
| sei | 6 | 18 |
| asso | 1 | 16 |
| cinque | 5 | 15 |
| quattro | 4 | 14 |
| tre | 3 | 13 |
| due | 2 | 12 |
| fante, cavallo, re | 8, 9, 10 | 10 |

The **sette di denari** is the *settebello*.

## The deal

> The dealer gives **three cards each and four face up on the table**. When
> both hands are empty they give three more each, and nothing more to the
> table: six rounds, thirty-six cards played. If three or four kings are among
> the four on the table, the deal is done again.

The redeal is `REDEAL_RE = 3`, and it exists for a reason worth stating: with
three re on the table and one still in the deck, at most one of them can ever
be paired, so no capture could empty the table and no scopa would be possible
for the whole deal.

The deal alternates. On a cold start the opponent deals, because the non-dealer
plays first and you lead the first deal — the same way round as Discola and
Tressette. The **dealer plays last** in every round and therefore plays the last
card of the deal, which is why the plate says who dealt.

A hand is **sorted when it is dealt** — by suit in the order the sprite sheets
hold them, and within a suit from the highest card down — and it keeps its holes
until the next round. A card that moves under the thumb between one glance and
the next is a misplay.

## A play

> One card at a time. If the table holds a card of the **same value**, that
> card is taken and only that one — even when a sum would also work. Otherwise,
> if a set of cards **adds up to the value** played, that set is taken. If
> nothing can be taken the card stays on the table. Taking is compulsory: a
> card that can take, takes. You are always free to play a different card that
> takes nothing.

The two constants there are `SINGLE_BEFORE_SUM = true` and
`PRESA_OBBLIGATORIA = true`. A seven played onto a table of 7, 4 and 3 takes the
seven; the sum is not offered at all.

The rule leaves a **choice** in two shapes, and the table hands it to you rather
than picking for you: two cards of the same value on the table and one of that
value in hand, or two different sets that add up. The card lifts, the cards it
would take are ringed in brass, the line above your hand says what the next tap
will do, and a tap on any table card switches to a capture containing it.

**Thirteen is the most the table can hold**, and it is reachable: the four dealt
cards can be four cavalli, and 10, 8, 7, 6, 5, 4, 3, 2 and 1 can then be laid
one after another without any of them matching a value or making a sum. Over
10,000 random-legal deals the engine test saw twelve.

## A scopa

> A capture that **empties the table** is a **scopa** and scores a point —
> except when it is made with the last card of the deal. After the
> thirty-sixth card, whatever is left on the table goes to whoever captured
> last, and that is not a scopa.

`SCOPA_ULTIMA = false` is the first half of that. The second half is not a
constant but a rule in `gioca`: the leftovers go to `ultimaPresa`, the player
who captured last, and they are not a scopa for anybody.

The card that made a scopa is kept face up across the top of the pile, as
tradition marks it, so the count is public all deal.

## Scoring a deal

> Five things are counted at the end: **cards** (more than twenty), **denari**
> (more than five), the **settebello** (the seven of denari), the
> **primiera**, and **one point per scopa**. A tie on cards, denari or primiera
> gives that point to nobody.

The **primiera** is the one that has to be spelt out:

> The primiera is the sum of your best card in each suit, counted this way:
> seven 21, six 18, ace 16, five 15, four 14, three 13, two 12, face cards 10.
> A player missing a suit cannot take the point.

If neither player holds all four suits, the point goes to nobody. The result
panel shows both totals rather than a tick, and draws a dash where a suit is
missing, because a point decided by an arithmetic nobody can see is the one most
worth showing.

Four points and the scope are the whole score. A deal without scope is somewhere
between 0–4 and 4–0, and **2–2 is common**: a draw is an ordinary result here in
a way it is not in Tressette, whose eleven points cannot divide.

## A partita

A *partita* is **one deal**, as in Discola and Tressette. The higher total wins;
equal totals are a draw and are recorded as one. Whoever did not deal this deal
deals the next.

## What is not played

> The variants are not played: no **napola**, no **asso piglia tutto**, no **re
> bello**, no **scopa d'assi**, no scopa a quindici.

The first three are constants read by a real branch — `NAPOLA`,
`ASSO_PIGLIA_TUTTO`, `RE_BELLO` — each off, and each with a test that turns it
on and watches the branch fire, because a constant nothing consults would not
make a change one line, it would only look as though it had.

*Scopa d'assi* has no constant, deliberately. Houses disagree about what it
means — in some it is another name for *asso piglia tutto*, in others a scopa
scored for an asso played to an empty table — and a constant guessing between
two rules would be worse than none. It is §0 decision 8 of `PLAN.md`, and it is
open.

Also not built: Scopone, and a match to 11 across deals. `PLAN.md` §5 says why
each is out of scope.

## At the table

> At the table: **one tap plays a card**. When the rule leaves a choice of
> capture, the first tap raises the card and marks in brass what it would take;
> a tap on a table card switches the proposal, and a second tap on the raised
> card plays it. By keyboard: **1**–**3** pick a card, **space** cycles the
> capture, **Enter** plays and **Esc** puts it back.

Escape also backs out of a sheet and answers the confirm. The record of past
smazzate stays in this browser, on this device, and nothing leaves it.

## Where the cards come from

> The cards of the five original decks — Trevisane, Piacentine, Napoletane,
> Romagnole and Francesi — are the bitmaps of **Discola** of 1997. A sixth,
> Bresciane, is added to them, a scan of a Dal Negro deck. They are copied card
> for card and not redrawn. The opponent is this game's own: there was no 1997
> scopa to copy it from, and its weights are shown in the settings.
