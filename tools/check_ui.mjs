#!/usr/bin/env node
/**
 * UI check for Scopetta. Run it after any UI change.
 *
 *   node tools/check_ui.mjs [path-to-index.html]   # defaults to public/index.html
 *
 * Needs playwright-core and a Chromium binary:
 *   npm i playwright-core && npx playwright-core install chromium
 *   CHROME=/path/to/chrome node tools/check_ui.mjs   # or name one yourself
 *
 * Forked from Tressette's at dec1c74. The document pass and the audit are its
 * and Discola's, unchanged where the defect they name is the same; the table
 * and deal passes are rewritten, because Scopa's middle row is a table of up
 * to thirteen cards rather than a trick of two, and its hand is three whole
 * cards rather than a fan of ten.
 *
 * 0. DOCUMENT — the four document facts that cannot be expressed as a layout
 *    assertion: the viewport meta, the doctype, the charset and <html lang>.
 *
 * 1. SCREENS — every screen and every state worth looking at, at a handful of
 *    real device shapes. Catches what is wrong anywhere: more than one screen
 *    visible at once, text too small to read, clipped labels, tap targets under
 *    the thumb, sideways scroll, script errors.
 *
 * 2. TABLE — the card table only, at every viewport and in all five decks, and
 *    then the tightest of them again with the spacing tokens inflated. The card
 *    size is a budget and when it is wrong nothing throws: the cards quietly
 *    overlap, or your seat slides below the fold, or the rows drift apart.
 *    **It renders the table at 0, 4, 8 and 13 cards**, because the number of
 *    cards in the middle is this game's own way to fail and a freshly dealt
 *    table only ever shows four. It also asks the page which card a tap would
 *    land on, a pixel at a time, because paint order decides that and paint
 *    order moves no box.
 *
 * 2b. CHOICE — a capture waiting to be chosen, on a four-card table and on a
 *    crowded one with a pointer resting on a card; and the toast.
 *
 * 2c. STATES — the sweep and the beat between rounds, PLAYED rather than posed.
 *    Neither is a state the engine will sit in, so a posed one passes whether
 *    or not the page can reach the real one.
 *
 * 3. DEAL — one whole deal against Franco, played by tapping, choosing a
 *    capture by both paths, reading the table after every play.
 *
 * Every threshold below is calibrated against a real defect, not taste. If you
 * relax one, check it still fails the commit that introduced the bug it names.
 */
import { chromium } from 'playwright-core';
import path from 'node:path';
import { existsSync } from 'node:fs';

const FILE = path.resolve(process.argv[2] ?? new URL('../public/index.html', import.meta.url).pathname);
const URL_ = 'file://' + FILE;

// Three ways to find a Chromium, in order: the one CHROME names, the one this
// development container ships, and the one `playwright-core install chromium`
// put in its own cache — which is the only one CI has.
const PINNED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CHROME = process.env.CHROME || (existsSync(PINNED) ? PINNED : null);

/* ---- viewports ------------------------------------------------------------ */

const VIEWPORTS = [
  // The narrowest screen the game claims to work on, and the one the say line
  // runs off first: a 39-character line is 335px wide, which is wider than the
  // whole of this.
  ['narrow phone',      320,  568],
  ['Android small',     360,  800],
  ['iPhone 15',         393,  852],
  ['Pixel',             412,  915],
  ['iPhone Pro Max',    430,  932],
  ['narrow and tall',   360, 1200],
  ['big phone',         600, 1200],
  ['tall phone A',      700, 1400],
  ['tall phone B',      770, 1475],
  ['tall phone C',      800, 1600],
  ['tablet portrait',   600,  853],
  ['iPad',              768, 1024],
  ['iPad Air',          820, 1180],
  ['iPad Pro',         1024, 1366],
  ['tablet landscape', 1180,  820],
  ['phone landscape',   980,  385],
  ['phone desktop-mode',1045, 2265],
  ['laptop',           1440,  900],
  ['laptop short',     1366,  700],
  ['desktop',          1920, 1080],
  // Small landscape WINDOWS, which the grid had none of until iteration 3's
  // review: every landscape shape above is at least 980 wide, and the seat row
  // is the widest thing on the table. A browser window dragged down to 800x680
  // is an ordinary thing to do, and it clipped the deck and your own name plate
  // off the right edge with the check green.
  ['small window',      800,  680],
  ['VGA window',        640,  480],
  ['tiny window',       500,  425],
  // Shorter than they are wide by a lot, which is where the plate's type — in
  // rem — grows past the card's height and the seat row stops costing a card.
  ['short window',      980,  340],
  ['shorter window',   1100,  330],
  ['shortest window',  1100,  320],
];

const SCREEN_VIEWPORTS = ['narrow phone', 'Android small', 'iPhone Pro Max',
                          'tablet portrait', 'phone landscape', 'tiny window', 'laptop'];

// The inflated pass runs these. Not the short landscape windows — 640x480,
// 980x340, 1100x330, 1100x320 — where the inflation drives the card onto its
// clamp floor, which tests the clamp rather than the derivation, exactly as the
// note on INFLATE says.
const TIGHT = ['phone landscape', 'laptop short', 'iPad', 'tablet portrait',
               'Android small', 'small window', 'tiny window'];

// Where an interaction is measured. The screen shapes, plus the narrow portrait
// one where the middle row has to overlap hardest — a card's reachable strip is
// a geometry question and it is at its worst where the cards are most crowded.
const CHOICE_VIEWPORTS = [...SCREEN_VIEWPORTS, 'narrow and tall', 'iPad'];

const DECKS = ['Trevisane', 'Romagnole', 'Napoletane', 'Piacentine', 'Francesi'];

// tools/break_ui.mjs breaks the page on purpose and needs to run the check
// dozens of times. QUICK trims the grid to the shapes that actually catch
// things — the tightest viewport, the widest, one portrait and one deck — so a
// break takes seconds instead of minutes. Nothing else sets it, and CI does
// not: a quick run is for proving an assertion bites, never for clearing one.
const QUICK = !!process.env.QUICK;

// How many cards the middle row is asked to hold. Not "whatever a deal
// produced": §3.7's bound is thirteen and a random deal reaches twelve, so the
// state that breaks the row has to be rendered on purpose.
const TABLE_SIZES = [0, 4, 8, 13];

// Raising a card is a transition, and a measurement taken on the tick that
// starts it reads the unraised box. Motion off for the measuring passes, so a
// measurement is of where the page settles rather than of where it starts.
const STILL = '*, *::before, *::after{ transition: none !important; animation: none !important; }';

/* ---- putting the page into a state ---------------------------------------- */

// Thirteen cards, the way the rules actually reach thirteen: the four dealt
// cards are four of a kind, and then one card of every other value is laid.
// **Not thirteen low cards.** A synthetic table of assi, due and tre makes
// `prese` enumerate hundreds of capture sets for a single re, which is a state
// no deal can reach — a value already on the table always captures, so no value
// is ever laid twice. A fixture that ignores that measures a page nobody can
// get to, slowly.
const TAVOLA_13 = `[
  {s:0,n:9},{s:1,n:9},{s:2,n:9},{s:3,n:9},
  {s:0,n:10},{s:1,n:8},{s:2,n:7},{s:3,n:6},
  {s:0,n:5},{s:1,n:4},{s:2,n:3},{s:3,n:2},{s:0,n:1}
]`;

// A dealt table, then `n` cards on it. Deterministic: the page's own newDeal
// runs first so every other part of the state is real, and only `tavola` is
// posed.
const setTavola = n => `(() => {
  const all = ${TAVOLA_13};
  state.tavola = all.slice(0, ${n});
  // The longest name in §0's roster, on every case of the pass that measures
  // plates. Only Franco exists until iteration 5, and a plate asserted against
  // one name is a plate asserted against one name.
  state.opponent = "Graziano";
  state.selected = null; state.scelta = 0;
  render();
})()`;

// A capture with a real choice in it: two sevens on the table and a seven in
// hand, so `prese` offers exactly two and the page must let the player pick.
const poseChoice = `(() => {
  state.tavola = [{s:1,n:7},{s:0,n:7},{s:2,n:4},{s:3,n:3}];
  state.hands[0] = [{s:2,n:7}, {s:3,n:10}, {s:1,n:2}];
  state.deveGiocare = 0; state.over = false;
  state.selected = null; state.scelta = 0;
  render();
  tapped(0);
})()`;

// The same choice on a crowded table, which is where marking a card can take
// the tap that belongs to the card beside it. Twelve, not thirteen: a
// thirteen-card table holds four of one value and one of each of the other
// nine, so every value is on it and every hand card has a single capture —
// **a table of thirteen can never offer a choice**. Twelve is the crowded
// table that can: three nines dealt down, the fourth in hand.
const poseChoiceCrowded = `(() => {
  state.tavola = [
    {s:0,n:9},{s:1,n:9},{s:2,n:9},
    {s:0,n:10},{s:1,n:8},{s:2,n:7},{s:3,n:6},
    {s:0,n:5},{s:1,n:4},{s:2,n:3},{s:3,n:2},{s:0,n:1}
  ];
  state.hands[0] = [{s:3,n:9}, {s:3,n:10}, {s:1,n:2}];
  state.deveGiocare = 0; state.over = false;
  state.selected = null; state.scelta = 0;
  render();
  tapped(0);
})()`;

// The say line's middle rung: a card named with its suit, which is 43
// characters with the clause naming the raised card and 28 without it, so the
// clause goes and the name stays. Two quattro on the table and the third in
// hand — a real choice, so `tapped` raises rather than plays, which the first
// version of this fixture did not check and did not get.
const LONG_SAY = 'Prendi il quattro di bastoni';
const poseLongSay = `(() => {
  state.tavola = [{s:3,n:4},{s:1,n:4},{s:0,n:3},{s:2,n:1}];
  state.hands[0] = [{s:2,n:4}, {s:3,n:10}, {s:1,n:9}];
  state.deveGiocare = 0; state.over = false;
  state.selected = null; state.scelta = 0;
  render();
  tapped(0);
})()`;

// The widest line the ladder is allowed to keep: 39 characters, and 335px of
// them — wider than a 360px phone's seat and wider than the whole of a 320px
// one. A count is a proxy for a width and a bad one, so the fixture that keeps
// the ladder honest is the one where the two disagree. A cavallo takes the asso
// and the fante, or the quattro and the cinque, so it raises.
const WIDEST_SAY = "Prendi l'asso e il fante con il cavallo";
const CUT_SAY = "Prendi l'asso e il fante";
const poseWidestSay = `(() => {
  state.tavola = [{s:0,n:1},{s:1,n:8},{s:2,n:4},{s:3,n:5}];
  state.hands[0] = [{s:2,n:9}, {s:3,n:10}, {s:1,n:2}];
  state.deveGiocare = 0; state.over = false;
  state.selected = null; state.scelta = 0;
  render();
  tapped(0);
})()`;

// And the rung below that: five cards taken at once, which cannot be named in
// the space the budget pays for however it is phrased, so the line says how
// many and the brass marks say which. The quattro and the sei are here to make
// it a choice — without a second capture the card is simply played and the row
// renders an empty table, which is what the first version of this did.
const UNNAMEABLE_SAY = 'Prendi le 5 carte segnate';
const poseUnnameable = `(() => {
  state.tavola = [{s:1,n:1},{s:2,n:1},{s:0,n:2},{s:3,n:3},{s:1,n:3},{s:0,n:4},{s:2,n:6}];
  state.hands[0] = [{s:2,n:10}, {s:3,n:9}, {s:1,n:8}];
  state.deveGiocare = 0; state.over = false;
  state.selected = null; state.scelta = 0;
  render();
  tapped(0);
})()`;

// A sweep made by the opponent, which goes the other way. §3.7 calls the
// direction a deliberate departure and nothing was reading it.
const playSweepOpp = `(() => {
  state.tavola = [{s:2,n:4}];
  state.hands[1] = [{s:0,n:4}, {s:3,n:10}, {s:1,n:2}];
  state.deveGiocare = 1; state.over = false; state.speed = 1200;
  state.selected = null; state.scelta = 0;
  render();
  computerPlay();
})()`;

// Play real cards until the round ends, which is the only way to reach the beat
// where both hands are empty: gioca() deals the next round itself and reports
// it, so the state never sits in that beat and the page draws it from the flag.
// Posing it by emptying state.hands would render a page the game cannot reach
// and would pass whether or not the page ever draws the real one.
//
// speed is set high so the beat does not tick past before it is measured, and
// each play() reschedules the one timer, so the loop steps the deal by hand.
const playToBeat = `(() => {
  epoch++; state.mazziere = null;
  newDeal(state, rngSeed(11));
  state.speed = 30;
  render();
  for (let i = 0; i < 40 && !state.over; i++){
    const who = state.deveGiocare;
    if (who === null) break;
    const slot = state.hands[who].findIndex(c => c);
    if (slot < 0) break;
    // The last card of the round is played at a speed that leaves the sweep
    // and the beat long enough to measure. Everything before it runs fast.
    const left = state.hands[0].filter(Boolean).length
               + state.hands[1].filter(Boolean).length;
    if (left === 1) state.speed = 4000;
    const opts = prese(state.tavola, state.hands[who][slot]);
    play(who, slot, opts[0] || []);
    if (left === 1) return true;
  }
  return false;
})()`;

// A real sweep: one card on the table and the card that takes it in hand, then
// the page's own tap. The toast, the empty table and the scopa mark are what
// gioca() and render() do with it — none of it is posed.
const playSweep = `(() => {
  state.tavola = [{s:2,n:2},{s:0,n:2}];
  state.hands[0] = [{s:0,n:4}, {s:3,n:10}, {s:1,n:2}];
  state.deveGiocare = 0; state.over = false; state.speed = 1200;
  state.selected = null; state.scelta = 0;
  render();
  tapped(0);
})()`;

// How long the sweep started by playSweep takes to finish, plus a margin. The
// toast outlives it by roughly twice as long, so the settled state is still
// announcing the scopa when it is measured.
const SWEEP_MS = 700;

/* ---- what counts as a defect ---------------------------------------------- */

const audit = () => {
  const out = [];
  const name = el => el.id ? '#' + el.id
    : (typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\s+/)[0]
        : el.tagName.toLowerCase());

  const shown = el => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0';
  };

  // Exactly one screen. An author `display` rule beats the UA stylesheet's
  // [hidden]{display:none}, which once left every screen stacked on top of one
  // another with an invisible scrim swallowing every click.
  //
  // By what the browser DRAWS, not by the attribute. Reading `v.hidden` asks
  // the page what it meant rather than what it did — which is the whole of the
  // defect, since the attribute was always set correctly and the rule that acts
  // on it was the thing that lost. The break that takes the `!important` off
  // `[hidden]` survived this assertion for exactly that reason.
  const open = [...document.querySelectorAll('.view')]
    .filter(v => getComputedStyle(v).display !== 'none');
  if (open.length !== 1) out.push(`${open.length} screens visible at once`);

  if (document.documentElement.scrollWidth > window.innerWidth + 1)
    out.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${window.innerWidth})`);

  // Sideways scroll is not enough on its own. The table sets `overflow: hidden
  // auto`, so anything too wide is clipped rather than scrollable and the
  // document width never betrays it — Discola cut the opponent's third card off
  // a phone screen through nineteen viewports while that assertion passed. Ask
  // the elements directly. The table row is in this list because it is the one
  // this game added.
  const past = [...document.querySelectorAll('.hand, .tavola, .tavola-row, .seat__cards, .plate, .toast, .say, .sel-name')]
    .filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
    });
  for (const el of past.slice(0, 3)) {
    const r = el.getBoundingClientRect();
    out.push(`${name(el)} runs off the screen (${Math.round(r.left)}…${Math.round(r.right)} `
      + `vs 0…${window.innerWidth})`);
  }

  // Nothing on the table may sit on a hand card. Against the HAND'S OWN BOX
  // this passes while the raised card stands on two to four of the cards it is
  // proposing to take: a transform does not move the box it is applied to out
  // of its parent, so the hand measures where it always was and the card is
  // somewhere else entirely. Card against card, or it sees nothing.
  const hit = (a, b) => a.left < b.right - 1 && a.right > b.left + 1
                     && a.top < b.bottom - 1 && a.bottom > b.top + 1;
  const handCards = [...document.querySelectorAll('.hand .card')].map(c => c.getBoundingClientRect());
  const onHand = [...document.querySelectorAll('.tavola .card')]
    .filter(c => handCards.some(h => hit(c.getBoundingClientRect(), h)));
  if (onHand.length)
    out.push(`${onHand.length} table card(s) overlap a hand card`);

  // A name plate that outgrows the width the budget pays for lands on the cards
  // beside it. Two ways that happens and they need different eyes: the plate's
  // box can be squeezed narrower than its content, which only scrollWidth
  // shows, or the box itself can be wider than its column.
  for (const plate of document.querySelectorAll('.plate')) {
    if (plate.scrollWidth > plate.clientWidth + 1)
      out.push(`${name(plate)} spills ${plate.scrollWidth - plate.clientWidth}px past its own width`);
    // And past its own height, which is the same question turned ninety
    // degrees and the one the first version of this rule did not ask: the
    // plate has a derived height, the mazziere tag is a row of its own, and a
    // box of 35px measuring 51px of content drew the tag behind the cards at
    // every portrait viewport with both assertions green.
    if (plate.scrollHeight > plate.clientHeight + 1)
      out.push(`${name(plate)} spills ${plate.scrollHeight - plate.clientHeight}px past its own height`);
  }
  // The plate's CHILDREN against the cards, not the plate's box: overflowing
  // content leaves the box and the box stays where it was.
  for (const kid of document.querySelectorAll('.plate, .plate *')) {
    const a = kid.getBoundingClientRect();
    if (!a.width || !a.height) continue;
    for (const row of document.querySelectorAll('.seat__cards'))
      if (hit(a, row.getBoundingClientRect())) { out.push(`${name(kid)} lands on the cards`); break; }
  }

  for (const el of document.querySelectorAll('body *')) {
    if (!shown(el)) continue;
    if (el.closest('details:not([open])') && !el.closest('summary')) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();

    const text = [...el.childNodes]
      .filter(n => n.nodeType === 3)
      .map(n => n.textContent.trim()).join(' ').trim();

    if (text) {
      const size = parseFloat(cs.fontSize);
      // Two tiers: a short uppercase label can run smaller than a sentence
      // somebody has to read. Body copy sat at 12.5px until it was measured.
      const floor = text.length > 40 ? 14.5 : 12.5;
      if (size < floor - 0.05)
        out.push(`${name(el)} text ${size.toFixed(1)}px, want ${floor} — "${text.slice(0, 32)}"`);

      if (cs.overflowX === 'hidden' && cs.overflowY !== 'auto' && cs.overflowY !== 'scroll'
          && el.scrollWidth > el.clientWidth + 1)
        out.push(`${name(el)} clips its text (${el.scrollWidth} > ${el.clientWidth})`);

      // Cut off from above or below by an ancestor that cannot scroll. The rule
      // above cannot see it, because the element that clips is not the element
      // that holds the text: in Tressette a declaration inside a strip sized for
      // one line lost half a line off the top and half off the bottom at every
      // phone width, and every assertion passed.
      for (let up = el; up && up !== document.body; up = up.parentElement) {
        const ucs = getComputedStyle(up);
        if (ucs.overflowY !== 'hidden' || ucs.overflowX === 'auto' || ucs.overflowX === 'scroll') continue;
        const ur = up.getBoundingClientRect();
        const cut = up === el
          ? Math.max(0, el.scrollHeight - el.clientHeight)
          : Math.max(0, ur.top - r.top) + Math.max(0, r.bottom - ur.bottom);
        if (cut > 1)
          out.push(`${name(el)} is cut off by ${Math.round(cut)}px inside ${name(up)}, `
            + `which cannot scroll — "${text.slice(0, 32)}"`);
        break;
      }
    }

    // Thumb-sized targets. Cards are excluded because a card's size is the
    // table's budget and is asserted by the second pass.
    const inlineLink = el.tagName === 'A' && cs.display.startsWith('inline');
    if ((el.tagName === 'BUTTON' || el.tagName === 'A') && !el.classList.contains('card') && !inlineLink) {
      const small = Math.min(r.width, r.height);
      if (small < 32)
        out.push(`${name(el)} tap target ${Math.round(r.width)}x${Math.round(r.height)}, want 32`);
    }
  }
  return out;
};

// Local runs have no network, so the Google Fonts stylesheet always fails.
const noise = m => /ERR_CERT_AUTHORITY_INVALID|ERR_CONNECTION|ERR_NAME_NOT_RESOLVED|fonts\.googleapis/.test(m);

/* ---- getting to each screen ----------------------------------------------- */

// A row that cannot reach its screen is a check that silently passes, so rows
// arrive with their screens. The mid-deal states are here because §4 iteration
// 3 is explicit: an assertion only sees the states the check renders, and every
// one of these exists only in the middle of a deal.
const SCREENS = [
  { name: 'start', open: async p => {} },
  { name: 'table, just dealt', open: async p => { await p.click('#play'); } },
  { name: 'table, empty middle', open: async p => {
      await p.click('#play');
      await p.evaluate(setTavola(0));
    } },
  { name: 'table, thirteen cards', open: async p => {
      await p.click('#play');
      await p.evaluate(setTavola(13));
    } },
  { name: 'table, a capture to choose', open: async p => {
      await p.click('#play');
      await p.evaluate(poseChoice);
    } },
  { name: 'table, a capture named with its suit', open: async p => {
      await p.click('#play');
      await p.evaluate(poseLongSay);
    } },
  { name: 'table, the widest line the say line keeps', open: async p => {
      await p.click('#play');
      await p.evaluate(poseWidestSay);
    } },
  { name: 'table, a capture too long to name', open: async p => {
      await p.click('#play');
      await p.evaluate(poseUnnameable);
    } },
  // A sweep, played rather than posed: the toast is announcing something that
  // happened, over the empty table it left behind. Posing the toast alone
  // renders half the state, and the empty middle it sits over is the half that
  // moves the cards.
  { name: 'table, a scopa announced', open: async p => {
      await p.click('#play');
      await p.evaluate(playSweep);
      await p.waitForTimeout(SWEEP_MS);
    } },
  // Likewise the beat between rounds, which is reached by finishing a round.
  { name: 'table, hands empty between rounds', open: async p => {
      await p.click('#play');
      await p.evaluate(playToBeat);
      // Not fatal if it never arrives: a page that stops listening for the new
      // round is a defect for checkStates to report, not a crash that takes the
      // rest of the check's output with it.
      await p.waitForFunction('beat === true', null, { timeout: 8000 }).catch(() => {});
    } },
  { name: 'table, a pile with three scope', open: async p => {
      await p.click('#play');
      await p.evaluate(`(() => {
        state.scope = [3, 2];
        state.prese[0] = state.cards.slice(0, 17);
        state.prese[1] = state.cards.slice(17, 30);
        render();
      })()`);
    } },
  { name: 'table, the deal over', open: async p => {
      await p.click('#play');
      await p.evaluate(`(() => {
        state.prese[0] = state.cards.slice(0, 21);
        state.prese[1] = state.cards.slice(21, 40);
        state.tavola = []; state.hands[0] = [null,null,null]; state.hands[1] = [null,null,null];
        state.over = true; state.plays = 36; state.deveGiocare = null;
        render();
      })()`);
    } },
];

/* ---- pass 0: the document itself ------------------------------------------- */

async function checkDocument(browser) {
  console.log('\ndocument');
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  await page.goto(URL_);
  const bad = await page.evaluate(() => {
    const out = [];
    const vp = document.querySelector('meta[name="viewport"]');
    if (!vp) out.push('no viewport meta — a phone will lay the page out at ~980px and scale it down');
    else if (!/width\s*=\s*device-width/.test(vp.content))
      out.push(`viewport meta does not set width=device-width: "${vp.content}"`);
    if (document.compatMode !== 'CSS1Compat')
      out.push('quirks mode — no doctype, so box sizing and table layout differ from every browser default');
    if (document.characterSet !== 'UTF-8')
      out.push(`charset is ${document.characterSet}, not UTF-8 — accented Italian will render as mojibake over file://`);
    if (!document.documentElement.lang)
      out.push('no lang on <html> — screen readers and hyphenation have no language to work from');
    return out;
  });
  await page.close();
  console.log(`  ${bad.length ? 'FAIL' : 'pass'}  head tags`);
  bad.forEach(b => console.log(`        ${b}`));
  return bad.length ? 1 : 0;
}

/* ---- pass 1: every screen -------------------------------------------------- */

async function checkScreens(browser) {
  console.log('\nscreens');
  let failed = 0;
  // Two shapes in the quick grid, and the second is deliberately not a phone:
  // the phone-shaped media query re-declares every type token, so a break that
  // drops the base --t-tiny below the floor cannot show up on a phone at all.
  for (const vname of (QUICK ? ['narrow phone', 'tiny window'] : SCREEN_VIEWPORTS)) {
    const [, w, h] = VIEWPORTS.find(v => v[0] === vname);
    for (const screen of SCREENS) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const errs = [];
      page.on('pageerror', e => errs.push(String(e)));
      page.on('console', m => { if (m.type() === 'error' && !noise(m.text())) errs.push(m.text()); });
      await page.goto(URL_);
      await page.addStyleTag({ content: STILL });
      await screen.open(page);
      await page.waitForTimeout(60);
      const bad = await page.evaluate(audit);
      const all = [...bad, ...errs];
      if (all.length) {
        failed++;
        console.log(`  FAIL  ${screen.name} @ ${vname}`);
        all.slice(0, 8).forEach(b => console.log(`        ${b}`));
      }
      await page.close();
    }
  }
  console.log(`  ${failed ? failed + ' case(s) failed' : 'pass'}  ${SCREENS.length} screens x ${SCREEN_VIEWPORTS.length} viewports`);
  return failed;
}

/* ---- pass 2: the card table ----------------------------------------------- */

// Runs in the page, with the table already holding `n` cards.
const measure = () => {
  const r = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
  const table = r('.table');
  const oppSeat = r('.seat--opp'), youSeat = r('.seat--you');
  const middle = r('.middle'), tavola = r('.tavola');
  // NOT `.hand--you .card`: the first slot is the one a raised card lives in,
  // and a raised card is scale(1.04) — 4% of a card wide enough to make every
  // reachable-strip measurement below miss by three pixels.
  const card = r('.hand--you .card:not([aria-pressed="true"])');
  const say = r('.say');

  // A strip of zero height is the defect this line exists for: while the say
  // line was `hidden` until it had something to say, raising a card pushed every
  // card below it down 31px — off the bottom of the screen in landscape.
  const sayShown = say && say.height > 0;

  // The three row boxes, sorted so the numbers mean the same thing in portrait
  // and in landscape.
  const boxes = [oppSeat, middle, youSeat].filter(Boolean).sort((a, b) => a.top - b.top);
  const gaps = [];
  for (let i = 1; i < boxes.length; i++) gaps.push(boxes[i].top - boxes[i - 1].bottom);

  // --- the table row, §3.7 --------------------------------------------------
  // The fan lives here now. Three ways it goes wrong, all silent: the steps
  // collapse and a card cannot be singled out; the last card runs under the
  // table's edge; the steps are uneven, which means the derivation drifted.
  // What a thumb can actually reach, asked of the page rather than computed
  // from the step. Paint order decides which element a tap lands on, and a rule
  // that lifts one card above its neighbours takes `cw - step` off the strip of
  // the card after it without changing a single box: the geometry is untouched
  // and the card is simply not there any more. So walk the row a pixel at a
  // time and ask who is on top.
  const reachOf = row => {
    const cs = [...row.children];
    const got = cs.map(() => 0);
    if (!cs.length) return got;
    const first = cs[0].getBoundingClientRect();
    const y = Math.round(first.top + first.height / 2);
    // Off the screen entirely: there is nothing to hit-test, and the assertion
    // that the row is below the fold is the one with something to say.
    if (y < 0 || y >= window.innerHeight) return null;
    const rr = row.getBoundingClientRect();
    const x0 = Math.max(0, Math.ceil(rr.left));
    const x1 = Math.min(window.innerWidth - 1, Math.floor(rr.right));
    for (let x = x0; x <= x1; x++) {
      const i = cs.indexOf(document.elementFromPoint(x, y));
      if (i >= 0) got[i]++;
    }
    return got;
  };

  const rows = [...document.querySelectorAll('.tavola-row')];
  const rowStats = rows.map(row => {
    const cs = [...row.children].map(c => c.getBoundingClientRect());
    if (cs.length === 0) return null;
    const steps = cs.slice(1).map((c, i) => Math.round(c.left - cs[i].left));
    const rr = row.getBoundingClientRect();
    return {
      n: cs.length,
      minStep: steps.length ? Math.min(...steps) : Infinity,
      stepSpread: steps.length ? Math.max(...steps) - Math.min(...steps) : 0,
      // The last card whole, and the row inside the table's padding.
      spillRight: Math.round(Math.max(0, cs[cs.length - 1].right - (rr.right + 1))),
      spillLeft: Math.round(Math.max(0, rr.left - cs[0].left)),
      reach: reachOf(row),
    };
  }).filter(Boolean);

  const cw = card ? card.width : 0;

  // Past the screen edge, and the name plates. These live in the audit too, but
  // the audit runs on a handful of screen shapes and these are questions about
  // the widest row on the table in a particular deck — so they belong where
  // every viewport and every deck is rendered. The plates were left out of the
  // card budget and the three breaks for it survived the whole check, because
  // the only pass that could see them ran at one portrait phone.
  const nameOf = e => e.id ? '#' + e.id : '.' + e.className.trim().split(/\s+/)[0];
  const offScreen = [...document.querySelectorAll('.hand, .tavola, .tavola-row, .seat__cards, .plate, .say, .sel-name')]
    .filter(e => {
      const q = e.getBoundingClientRect();
      return q.width > 0 && (q.right > window.innerWidth + 1 || q.left < -1);
    }).map(nameOf);
  const plateBad = [];
  for (const plate of document.querySelectorAll('.plate')) {
    if (plate.scrollWidth > plate.clientWidth + 1)
      plateBad.push(`${nameOf(plate)} spills ${plate.scrollWidth - plate.clientWidth}px past its own width`);
    if (plate.scrollHeight > plate.clientHeight + 1)
      plateBad.push(`${nameOf(plate)} spills ${plate.scrollHeight - plate.clientHeight}px past its own height`);
  }
  for (const kid of document.querySelectorAll('.plate, .plate *')) {
    const a = kid.getBoundingClientRect();
    if (!a.width || !a.height) continue;
    for (const row of document.querySelectorAll('.seat__cards')) {
      const b = row.getBoundingClientRect();
      if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) {
        plateBad.push(`${nameOf(kid)} lands on the cards`); break;
      }
    }
  }

  // Nothing in the middle may land on a hand card — card against card, for the
  // reason the audit gives: the hand's own box does not follow the card that
  // leaves it.
  const handCards = [...document.querySelectorAll('.hand .card')].map(c => c.getBoundingClientRect());
  const cardsInTavola = [...document.querySelectorAll('.tavola .card')].map(c => c.getBoundingClientRect());
  const overlapsHand = cardsInTavola.filter(c =>
    handCards.some(h => c.left < h.right - 1 && c.right > h.left + 1
                     && c.top < h.bottom - 1 && c.bottom > h.top + 1)).length;

  return {
    sayShown,
    offScreen,
    plateBad,
    sayH: say ? Math.round(say.height) : 0,
    cw: Math.round(cw),
    rowStats,
    overlapsHand,
    // §3.7: one row in landscape, two in portrait once there is more than one
    // card. Without this the wrap rule is a line of JavaScript nothing reads.
    rowCount: rows.length,
    portrait: window.matchMedia('(orientation: portrait)').matches,
    // Your whole seat, not just your cards: in portrait the plate is below the
    // hand, and Tressette's hung 15px past the bottom of the screen while the
    // check printed `pass`, because it measured the hand.
    youSeatBottom: youSeat ? Math.round(youSeat.bottom) : 0,
    viewportH: window.innerHeight,
    // The table has `overflow: hidden auto`, so a budget that comes up short
    // does not error — it hands the player a scrollbar. Scrolling to reach a
    // card beats a card hidden under another one, which is why the fallback is
    // there, but needing it at all means a term of --chrome is missing: it was
    // --extra-gap, a hand-set .5rem standing in for --step, 6px short at
    // 1024x1366 and the table scrolled by exactly that.
    tableScroll: table ? Math.max(0, document.querySelector('.table').scrollHeight
                                   - document.querySelector('.table').clientHeight) : 0,
    tavolaInsideTable: tavola && table
      ? Math.round(Math.max(0, tavola.right - table.right) + Math.max(0, table.left - tavola.left))
      : 0,
    gapSpread: gaps.length ? Math.round(Math.max(...gaps) - Math.min(...gaps)) : 0,
    maxGap: gaps.length ? Math.round(Math.max(...gaps)) : 0,
    tavolaCount: cardsInTavola.length,
    engineCount: (state.tavola || []).length,
  };
};

// The tokens --chrome is derived from, made bigger. If anyone replaces the
// derivation with a constant, the cards stop shrinking to pay for the extra
// space and the assertions above catch it.
//
// Moderate on purpose. Inflating hard enough to drive the card onto its 32px
// clamp floor tests the clamp, not the derivation: at 980x385 the page then
// overflows however faithfully --chrome tracked its tokens, and `.table`
// scrolls, which is the designed fallback rather than a defect. The numbers
// below are the largest that leave the floor unbound at the tightest viewport,
// and they are verified to fail a hard-coded --chrome.
const INFLATE = `:root{
  --topbar: 56px !important;
  --pad-block: .95rem !important;
  --step: .85rem !important;
  --say: 26px !important;
  /* And no slack. --slack exists so the budget never lands on exactly zero,
     which means a term that is SHORT by less than --slack costs nothing and
     shows nowhere — --plates was 8px short at every portrait viewport and
     --slack is 8px. Taking it away here is what makes the budget's arithmetic
     assertable rather than merely comfortable. */
  --slack: 0px !important;
}`;

async function checkTable(browser, only, inflate) {
  console.log(inflate ? '\ntable, spacing inflated' : '\ntable');
  let failed = 0;
  let list = only ? VIEWPORTS.filter(v => only.includes(v[0])) : VIEWPORTS;
  // 'tiny window' is in the quick grid because it is the shape the width term
  // is about, and 'shortest window' because it is where the plate is taller
  // than the card AND the budget has nothing left over: a break that takes a
  // term out of the budget has to have somewhere to show up.
  if (QUICK) list = list.filter(v =>
    ['phone landscape', 'narrow phone', 'Android small', 'laptop', 'tiny window',
     'shortest window'].includes(v[0]));

  for (const [vname, w, h] of list) {
    // Two decks even in the quick grid: Romagnole's cards are the widest, so it
    // is the only one where the width term of the budget binds, and a break
    // that takes a term out of that budget has nowhere else to show.
    for (const deck of (QUICK ? ['Trevisane', 'Romagnole'] : DECKS)) {
      for (const n of (QUICK ? [4, 13] : TABLE_SIZES)) {
        const page = await browser.newPage({ viewport: { width: w, height: h } });
        const errs = [];
        page.on('pageerror', e => errs.push(String(e)));
        page.on('console', m => { if (m.type() === 'error' && !noise(m.text())) errs.push(m.text()); });
        await page.goto(URL_);
        await page.addStyleTag({ content: STILL });
        if (inflate) await page.addStyleTag({ content: INFLATE });
        await page.click('#play');
        // Off the table. Clicking leaves the pointer where the button was, and
        // a pointer resting on a card changes what is painted over what — so
        // every measurement below would carry a hover nobody asked for. Hover
        // is asserted on purpose in checkChoice instead.
        await page.mouse.move(0, 0);
        // The settings sheet that lets a player pick a deck is iteration 4, so
        // each deck is applied directly — applyDeck is the same call it will
        // make.
        await page.evaluate(d => applyDeck(d), deck);
        await page.evaluate(setTavola(n));
        await page.waitForTimeout(40);

        const m = await page.evaluate(measure);
        const bad = [];

        if (!m.sayShown || m.sayH < 10)
          bad.push(`the say line is ${m.sayH}px tall — it must cost --say whether or not it has something to say`);

        for (const e of m.offScreen.slice(0, 3))
          bad.push(`${e} runs off the screen`);
        bad.push(...m.plateBad.slice(0, 2));

        if (m.overlapsHand)
          bad.push(`${m.overlapsHand} table card(s) land on a hand`);

        const wantRows = (m.portrait && n > 1) ? 2 : 1;
        if (m.rowCount !== wantRows)
          bad.push(`the middle draws ${m.rowCount} row(s) in `
            + `${m.portrait ? 'portrait' : 'landscape'}, want ${wantRows}`);

        if (m.tableScroll > 1)
          bad.push(`the table needs ${m.tableScroll}px of scrolling — a term of --chrome is missing`);

        if (m.youSeatBottom > m.viewportH + 1)
          bad.push(`your seat runs ${m.youSeatBottom - m.viewportH}px below the fold `
            + `(${m.youSeatBottom} vs ${m.viewportH})`);

        if (m.tavolaInsideTable > 1)
          bad.push(`the table row runs ${m.tavolaInsideTable}px outside the table`);

        if (m.tavolaCount !== m.engineCount)
          bad.push(`the middle shows ${m.tavolaCount} cards, the engine holds ${m.engineCount}`);

        // The rows must not drift apart: cards hit their cap and the grid hands
        // the leftover height to the gaps until a third of the table is empty.
        // Before the per-card lines below, which can be many: a failure that is
        // about the whole table is the one worth printing first.
        if (m.gapSpread > Math.max(24, m.cw * 0.5))
          bad.push(`the rows drift apart — gaps differ by ${m.gapSpread}px`);

        // The fan floors, moved here from Tressette's hand. A strip too narrow
        // to touch does not error — it just makes a capture unreachable, and a
        // misplay costs the deal.
        const floor = Math.min(24, Math.round(m.cw * 0.45));
        for (const row of m.rowStats) {
          if (row.n > 1 && row.minStep < floor)
            bad.push(`a table row steps ${row.minStep}px between cards, want ${floor} `
              + `(${row.n} cards, ${m.cw}px each)`);
          if (row.stepSpread > 1)
            bad.push(`a table row's steps are uneven by ${row.stepSpread}px — the derivation has drifted`);
          if (row.spillRight > 1 || row.spillLeft > 1)
            bad.push(`a table row spills ${row.spillRight || row.spillLeft}px past its own box`);
          // Tressette asserted here that the last card of the fan is a whole
          // card. That assertion is gone, measured rather than argued away:
          // its cards are `width: --cw; flex: none` and the row's negative
          // margins keep the content inside the box, so nothing shrinks them.
          // `flex: 1 1 auto` on .card — the regression it was written against
          // — changes not one measurement. An assertion that cannot fail reads
          // like cover and is not any. What can fail is the spill above.

          // The strip the layout promises and the strip a thumb gets are two
          // different numbers, and only the second one plays the card. Every
          // card is reachable across its own step — the last one across a whole
          // card — unless something is painted over it.
          // One line per row, not one per card: a row that loses its strips
          // loses all of them, and thirteen copies of the same finding push the
          // assertion that explains it off the end of the report.
          const want = Math.min(row.minStep, m.cw);
          const reach = row.reach || [];
          const starved = reach.findIndex(g => g < floor);
          const robbed = reach.findIndex(g => g >= floor && g < want - 2);
          if (starved >= 0)
            bad.push(`table card ${starved} is ${reach[starved]}px wide to a thumb, `
              + `want ${floor} (${row.n} cards, ${m.cw}px each)`);
          else if (robbed >= 0)
            bad.push(`table card ${robbed} loses ${want - reach[robbed]}px of its strip to `
              + `whatever is painted over it (${reach[robbed]}px reachable of ${want}px)`);
        }

        const all = [...bad, ...errs];
        if (all.length) {
          failed++;
          console.log(`  FAIL  ${vname} / ${deck} / ${n} cards`);
          all.slice(0, 8).forEach(b => console.log(`        ${b}`));
        }
        await page.close();
      }
    }
  }
  const deckN = QUICK ? 2 : DECKS.length, sizeN = QUICK ? 2 : TABLE_SIZES.length;
  console.log(`  ${failed ? failed + ' case(s) failed' : 'pass'}  `
    + `${list.length} viewports x ${deckN} decks x ${sizeN} table sizes`);
  return failed;
}

/* ---- pass 2b: the capture choice and the toast ----------------------------- */

// The states §3.7 adds, measured rather than merely rendered. A capture with a
// choice in it is the one interaction this game has that neither ancestor did.
async function checkChoice(browser) {
  console.log('\nthe capture choice, and the toast');
  let failed = 0;
  const list = QUICK ? ['Android small'] : CHOICE_VIEWPORTS;
  for (const [vi, vname] of list.entries()) {
    const [, w, h] = VIEWPORTS.find(v => v[0] === vname);
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !noise(m.text())) errs.push(m.text()); });
    await page.goto(URL_);
    await page.addStyleTag({ content: STILL });
    await page.click('#play');
    // A different deck each time round: the decks differ in card ratio, so the
    // geometry below differs with them, and running one deck here was a gap
    // rather than a decision.
    const deck = DECKS[vi % DECKS.length];
    await page.evaluate(d => applyDeck(d), deck);
    await page.mouse.move(0, 0);
    await page.evaluate(poseChoice);

    const bad = await page.evaluate(() => {
      const out = [];
      const marked = () => [...document.querySelectorAll('.tavola .card')]
        .map((c, i) => [i, c.dataset.take === 'true'])
        .filter(([, t]) => t).map(([i]) => i);

      // The card is raised.
      const raised = document.querySelector('.hand--you .card[aria-pressed="true"]');
      if (!raised) out.push('a capture with a choice did not raise the card');

      // Exactly the cards of the proposal are marked — not more, not fewer.
      const want = propostaCorrente();
      const got = marked();
      if (JSON.stringify(got) !== JSON.stringify([...want].sort((a, b) => a - b)))
        out.push(`the table marks ${JSON.stringify(got)}, the proposal is ${JSON.stringify(want)}`);
      if (got.length === 0) out.push('nothing on the table is marked');

      // The line says what the next tap will do, not merely what the card is.
      const say = document.querySelector('.sel-name');
      if (say.hidden) out.push('the say line is hidden while a card is raised');
      if (!/^Prendi /.test(say.textContent))
        out.push(`the say line does not say what the tap does: "${say.textContent}"`);

      // Switching the proposal by tapping a table card marks exactly the new
      // set. This is the second of the two paths §4 requires.
      const other = proposte().findIndex(s => JSON.stringify(s) !== JSON.stringify(want));
      if (other < 0) out.push('the posed position offers only one capture — it is not a choice');
      else {
        const said = say.textContent;
        const idx = proposte()[other][0];
        document.querySelector(`.tavola .card[data-index="${idx}"]`).click();
        const now = marked();
        const wantNow = [...propostaCorrente()].sort((a, b) => a - b);
        if (JSON.stringify(now) !== JSON.stringify(wantNow))
          out.push(`after tapping a table card the marks are ${JSON.stringify(now)}, want ${JSON.stringify(wantNow)}`);
        if (JSON.stringify(now) === JSON.stringify([...want].sort((a, b) => a - b)))
          out.push('tapping a table card did not change the proposal');
        // Two proposals, one line. The posed position is two sevens on the
        // table and a seven in hand — the value alone reads "Prendi il sette
        // con il sette" for both of them, and a line that cannot tell the
        // player which seven is about to go is not telling them anything.
        if (say.textContent === said)
          out.push(`the say line reads the same for both proposals: "${said}"`);
      }
      return out;
    });

    // The toast floats: it takes no space in the flow and is never clipped.
    await page.evaluate(`toast("Scopa!")`);
    await page.waitForTimeout(30);
    const toastBad = await page.evaluate(() => {
      const out = [];
      const t = document.querySelector('.toast');
      if (t.hidden) out.push('the toast did not show');
      const cs = getComputedStyle(t);
      if (cs.position !== 'absolute' && cs.position !== 'fixed')
        out.push(`the toast is ${cs.position} — it is in the flow, and it will move the cards`);
      const r = t.getBoundingClientRect();
      if (r.right > window.innerWidth + 1 || r.left < -1)
        out.push(`the toast runs off the screen (${Math.round(r.left)}…${Math.round(r.right)})`);
      if (t.scrollHeight > t.clientHeight + 1)
        out.push(`the toast clips its own text (${t.scrollHeight} > ${t.clientHeight})`);
      return out;
    });

    // The same choice on a crowded table. Two things can only go wrong here:
    // the mark can take the tap that belongs to the card beside it, and the
    // raised card can stand on the cards it is proposing to capture. Both are
    // invisible in the diff, neither throws, and each costs a deal.
    await page.reload();
    await page.addStyleTag({ content: STILL });
    await page.click('#play');
    await page.evaluate(poseChoiceCrowded);
    // And a pointer resting on one of those cards, on purpose. A hover that
    // lifts a card transforms it, a transform paints it as its own stacking
    // context, and the card to its right loses the difference — which is the
    // same defect as marking one, arriving by a different door. Hovering here
    // is what makes the measurement below see it.
    const spot = await page.evaluate(() => {
      // A card the proposal is offering to take, by preference: a pointer on a
      // marked card is where two rules meet, and the hover ring used to paint
      // over the mark and say the opposite of what was true.
      const rows = [...document.querySelectorAll('.tavola-row')];
      const row = rows[rows.length - 1];
      const c = document.querySelector('.tavola .card[data-take="true"]')
             || (row && row.children[Math.min(2, row.children.length - 1)]);
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { x: Math.round(r.left + 4), y: Math.round(r.top + r.height / 2) };
    });
    if (spot) await page.mouse.move(spot.x, spot.y);
    await page.waitForTimeout(40);
    const crowdBad = await page.evaluate(() => {
      const out = [];
      // From a card on the table, which is never raised and never scaled.
      const anyCard = document.querySelector('.tavola .card');
      const cw = anyCard ? anyCard.getBoundingClientRect().width : 0;
      const floor = Math.min(24, Math.round(cw * 0.45));

      const mark = document.querySelector('.tavola .card[data-take="true"]');
      if (!mark)
        out.push('nothing on the crowded table is marked — the position is not a choice');
      else if (!/rgb\(200, 162, 74\)/.test(getComputedStyle(mark).boxShadow))
        out.push('the marked card under the pointer is not drawn as marked');

      for (const row of document.querySelectorAll('.tavola-row')) {
        const cs = [...row.children];
        if (cs.length < 2) continue;
        const boxes = cs.map(c => c.getBoundingClientRect());
        const step = Math.min(...boxes.slice(1).map((b, i) => b.left - boxes[i].left));
        const want = Math.min(Math.round(step), Math.round(cw));
        const first = boxes[0];
        const y = Math.round(first.top + first.height / 2);
        if (y < 0 || y >= window.innerHeight) continue;
        const got = cs.map(() => 0);
        for (let x = Math.max(0, Math.ceil(row.getBoundingClientRect().left));
             x <= Math.min(window.innerWidth - 1, Math.floor(row.getBoundingClientRect().right)); x++) {
          const i = cs.indexOf(document.elementFromPoint(x, y));
          if (i >= 0) got[i]++;
        }
        got.forEach((g, i) => {
          if (g < floor)
            out.push(`with a capture marked, table card ${i} is ${g}px wide to a thumb, want ${floor}`);
          else if (g < want - 2)
            out.push(`with a capture marked, table card ${i} loses ${want - g}px of its strip `
              + `to whatever is painted over it (${g}px of ${want}px)`);
        });
      }

      // And the card you raised is not standing on the table.
      const hit = (a, b) => a.left < b.right - 1 && a.right > b.left + 1
                         && a.top < b.bottom - 1 && a.bottom > b.top + 1;
      const hand = [...document.querySelectorAll('.hand .card')].map(c => c.getBoundingClientRect());
      const on = [...document.querySelectorAll('.tavola .card')]
        .filter(c => hand.some(h => hit(c.getBoundingClientRect(), h))).length;
      if (on) out.push(`the raised card stands on ${on} table card(s)`);
      return out;
    });

    // The say line, hit-tested while a card is raised. That the line says the
    // right words is asserted above; that anything can READ them is a separate
    // question, and the raised card was drawn over 120px of a 309px line at
    // 1440x900 from the middle slot — over the suit, which is the reason the
    // line names one.
    const sayBad = [];
    for (const slot of [0, 1]) {
      await page.reload();
      await page.addStyleTag({ content: STILL });
      await page.click('#play');
      await page.evaluate(d => applyDeck(d), deck);
      await page.mouse.move(0, 0);
      await page.evaluate(`(() => {
        state.tavola = [{s:1,n:7},{s:0,n:7},{s:2,n:4},{s:3,n:3}];
        state.hands[0] = [{s:2,n:7},{s:3,n:7},{s:1,n:2}];
        state.deveGiocare = 0; state.over = false; state.selected = null; state.scelta = 0;
        render(); tapped(${slot});
      })()`);
      await page.waitForTimeout(40);
      sayBad.push(...await page.evaluate(() => {
        const out = [];
        const t = document.querySelector('.sel-name');
        const r = t.getBoundingClientRect();
        if (!r.width) { out.push('the say line has no box while a card is raised'); return out; }
        const y = Math.round(r.top + r.height / 2);
        let covered = 0;
        for (let x = Math.ceil(r.left); x <= Math.floor(r.right); x++) {
          const e = document.elementFromPoint(x, y);
          if (e !== t && !t.contains(e)) covered++;
        }
        if (covered > 1)
          out.push(`${covered}px of the say line is drawn over while a card is raised `
            + `(${Math.round(r.width)}px wide)`);
        return out;
      }));
    }

    // The two rungs below the whole name, each rendered rather than described —
    // and the widest line the ladder keeps, which is the one where its two
    // conditions disagree: 39 characters is inside the count and outside a
    // 360px phone, so the answer depends on the screen and not on the string.
    const rungBad = [];
    const widest = w >= 375 ? WIDEST_SAY : CUT_SAY;
    for (const [pose, want] of [[poseLongSay, LONG_SAY], [poseUnnameable, UNNAMEABLE_SAY],
                                [poseWidestSay, widest]]) {
      await page.reload();
      await page.addStyleTag({ content: STILL });
      await page.click('#play');
      await page.evaluate(d => applyDeck(d), deck);
      await page.mouse.move(0, 0);
      await page.evaluate(pose);
      await page.waitForTimeout(40);
      rungBad.push(...await page.evaluate(exp => {
        const out = [];
        if (!document.querySelector('.hand--you .card[aria-pressed="true"]'))
          out.push(`the position meant to say "${exp}" played the card instead of raising it`);
        const said = document.querySelector('.sel-name').textContent;
        if (said !== exp) out.push(`the say line should name the capture "${exp}", it says "${said}"`);
        return out;
      }, want));
    }

    const all = [...bad, ...toastBad, ...crowdBad, ...sayBad, ...rungBad, ...errs];
    if (all.length) {
      failed++;
      console.log(`  FAIL  ${vname} / ${deck}`);
      all.slice(0, 5).forEach(b => console.log(`        ${b}`));
    }
    await page.close();
  }
  console.log(`  ${failed ? failed + ' case(s) failed' : 'pass'}  `
    + `${list.length} viewports, seven positions each`);
  return failed;
}

/* ---- pass 2c: the two states only playing can reach ------------------------ */

// The sweep and the beat. Both are moments the deal passes through rather than
// states it sits in, so neither can be posed: the toast over a table that still
// has cards on it is not a scopa, and two empty hands are a state the engine
// refuses to sit in at all — gioca() deals the next round before it returns.
// The page is told, in `nuovoGiro`, and a page that does not listen simply
// never draws the beat. Tressette shipped a finished trick that way.
async function checkStates(browser) {
  console.log('\nthe sweep, and the beat between rounds');
  let failed = 0;
  const list = QUICK ? ['Android small'] : SCREEN_VIEWPORTS;
  for (const [vi, vname] of list.entries()) {
    const [, w, h] = VIEWPORTS.find(v => v[0] === vname);
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !noise(m.text())) errs.push(m.text()); });
    await page.goto(URL_);
    await page.addStyleTag({ content: STILL });
    await page.click('#play');
    // A different deck each time round, as in checkChoice: one deck here was a
    // gap rather than a decision.
    const deck = DECKS[vi % DECKS.length];
    await page.evaluate(d => applyDeck(d), deck);
    await page.mouse.move(0, 0);

    await page.evaluate(playSweep);
    await page.waitForTimeout(40);
    // While it is running: the cards a capture took are still on the table,
    // going. Without this the only thing that says WHICH cards were taken is
    // that they are no longer there.
    const flying = await page.evaluate(() => {
      const out = [];
      // Two cards, not one: a sweep that takes a single card cannot tell a rule
      // that marks the right cards from one that marks every card it is given.
      const shown = document.querySelectorAll('.tavola .card').length;
      if (shown !== 2)
        out.push(`the capture was not drawn leaving the table: the middle shows ${shown} card(s)`);
      const going = document.querySelectorAll('.tavola .card--won-up, .tavola .card--won-down').length;
      if (going !== 2) out.push(`${going} card(s) marked as leaving, want 2`);
      // Down, because you took it. A sweep toward the wrong player is worse
      // than none: it says the other player captured.
      if (!document.querySelector('.tavola .card--won-down'))
        out.push('the capture is sweeping the wrong way');
      return out;
    });

    // The other direction. A sweep toward the wrong player says the other
    // player captured, and until now only one of the two was ever drawn.
    await page.reload();
    await page.addStyleTag({ content: STILL });
    await page.click('#play');
    await page.evaluate(d => applyDeck(d), deck);
    await page.mouse.move(0, 0);
    await page.evaluate(playSweepOpp);
    await page.waitForTimeout(40);
    const flyingOpp = await page.evaluate(() => {
      const out = [];
      const going = document.querySelectorAll('.tavola .card--won-up, .tavola .card--won-down').length;
      if (going !== 1) out.push(`${going} card(s) marked as leaving on the opponent's capture, want 1`);
      if (!document.querySelector('.tavola .card--won-up'))
        out.push("the opponent's capture is sweeping the wrong way");
      // And your hand is plainly not ready while the table is busy. It is your
      // turn the moment their capture resolves, so the cards look live — and
      // `tapped` refuses while the sweep runs. A card that takes a tap and does
      // nothing is worse than one that looks refused.
      const live = [...document.querySelectorAll('.hand--you .card')]
        .filter((c, i) => state.hands[0][i] && !c.disabled).length;
      if (live) out.push(`${live} card(s) in your hand are still tappable during the sweep`);
      return out;
    });

    await page.reload();
    await page.addStyleTag({ content: STILL });
    await page.click('#play');
    await page.evaluate(d => applyDeck(d), deck);
    await page.mouse.move(0, 0);
    await page.evaluate(playSweep);
    await page.waitForTimeout(SWEEP_MS);
    const sweep = await page.evaluate(() => {
      const out = [];
      const t = document.querySelector('.toast');
      if (t.hidden) out.push('a sweep was played and nothing announced it');
      else if (!/scopa/i.test(t.textContent)) out.push(`the toast says "${t.textContent}"`);
      // Not `state.tavola.length` — that is the engine's business and
      // tools/engine.test.mjs owns it. And not "nothing still carries the
      // sweep class": the class is written from `sweeping` on every render, so
      // it cannot outlive it, and an assertion that cannot fail reads like
      // cover and is not any. What can fail is the table not catching up.
      const shown = document.querySelectorAll('.tavola .card').length;
      if (shown) out.push(`the middle still draws ${shown} card(s) after the sweep`);
      const marks = document.querySelectorAll('#scopeYou .scopa-mark').length;
      if (marks !== state.scope[0]) out.push(`${marks} scopa mark(s) drawn, the engine counted ${state.scope[0]}`);

      // The middle keeps its row while it is empty, or the whole table
      // re-centres on the beat when the player is looking hardest.
      const tav = document.querySelector('.tavola').getBoundingClientRect();
      const card = document.querySelector('.hand--you .card').getBoundingClientRect();
      if (tav.height < card.height - 1)
        out.push(`the empty middle collapsed to ${Math.round(tav.height)}px, a card is ${Math.round(card.height)}px`);
      return out;
    });

    const reached = await page.evaluate(playToBeat);
    if (reached) await page.waitForFunction('beat === true', null, { timeout: 8000 })
      .catch(() => {});
    const between = await page.evaluate(() => {
      const out = [];
      const drawn = who => [...document.querySelectorAll(who)]
        .filter(c => c.dataset.empty !== 'true').length;
      const held = w => state.hands[w].filter(Boolean).length;
      if (!beat) { out.push('the round ended and the page never entered the beat'); return out; }
      if (held(0) !== 3 || held(1) !== 3)
        out.push(`the next round was not dealt: ${held(0)}/${held(1)} in hand`);
      if (drawn('.hand--you .card') || drawn('.hand--opp .card'))
        out.push(`the beat draws ${drawn('.hand--you .card')}/${drawn('.hand--opp .card')} cards, `
          + `it is the moment both hands are empty`);
      // And the empty hand still costs a card row. Not the hand's height —
      // three slot elements hold that up whatever the rule says — but the slots
      // themselves: hide them and the hand collapses, and every card on the
      // table moves between the last play of a round and the first of the next.
      const card = document.querySelector('.tavola .card');
      const ch = card ? card.getBoundingClientRect().height : 0;
      const slots = [...document.querySelectorAll('.hand--you .card')]
        .filter(c => c.getBoundingClientRect().height > ch - 1).length;
      if (ch && slots !== 3)
        out.push(`the empty hand keeps ${slots} card-sized slot(s), want 3 — it collapsed`);
      return out;
    });
    if (!reached) between.push('the driver never reached the end of a round');

    const all = [...flying, ...flyingOpp, ...sweep, ...between, ...errs];
    if (all.length) {
      failed++;
      console.log(`  FAIL  ${vname} / ${deck}`);
      all.slice(0, 6).forEach(b => console.log(`        ${b}`));
    }
    await page.close();
  }
  console.log(`  ${failed ? failed + ' case(s) failed' : 'pass'}  ${list.length} viewports`);
  return failed;
}

/* ---- pass 3: a whole deal, through the table ------------------------------- */

// The two passes above measure a table that has just been dealt. This is the
// only one that fails when the page and the engine come apart — and it reads
// the table as well as driving it, which is the whole of Tressette's issue #7:
// a pass that played twenty cards and never looked at the hand between them.
async function checkDeal(browser) {
  console.log('\na whole deal');
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !noise(m.text())) errs.push(m.text()); });
  await page.goto(URL_);
  await page.addStyleTag({ content: STILL });
  await page.click('#play');
  await page.mouse.move(0, 0);
  // A fixed deal, so a failure is reproducible — and **seed 16 rather than any
  // seed**, because §4's "Done when" needs a capture chosen by each path and an
  // ambiguous capture is not common: seed 7 played thirty-six cards without
  // offering one, and the assertion at the bottom said so.
  //
  // Searched for with a simulation of the driver below rather than guessed at,
  // and that mattered: a seed picked by a simpler simulation offered three
  // choices on paper and one in the page, because switching a proposal changes
  // which cards are captured and the deal diverges from there.
  //
  // `mazziere` is cleared first, and that is not a detail: newDeal ALTERNATES
  // the dealer from whatever the state already holds, and #play has already
  // dealt one. Seeding the rng alone therefore does not reproduce a cold start
  // — the dealer differs, so the lead differs, so the whole deal differs. The
  // seed searched for offline offered two capture choices and the page offered
  // none, and this was why.
  await page.evaluate(`(() => { epoch++; state.mazziere = null;
    newDeal(state, rngSeed(16)); state.speed = 1; render();
    if (state.deveGiocare === 1) computerPlay(); })()`);

  const bad = [];
  let plays = 0, chosenByTap = 0, chosenByAccept = 0, scopeSeen = 0;

  // Driving can throw — a slot that should hold a card and draws none is not
  // clickable, and Playwright waits for it and then gives up. That is a defect
  // the loop has already recorded, so it has to survive to be printed: an
  // exception here used to take the whole check's output with it and the
  // mutation harness saw a failure with nothing in it.
  try {
  for (let guard = 0; guard < 120 && plays < 36; guard++) {
    await page.waitForTimeout(25);
    const st = await page.evaluate(() => ({
      over: state.over, turn: state.deveGiocare, plays: state.plays, beat,
      sweeping: !!sweeping,
      tavola: state.tavola.length,
      domTavola: document.querySelectorAll('.tavola .card').length,
      badgeYou: document.querySelector('#countYou').textContent,
      badgeOpp: document.querySelector('#countOpp').textContent,
      badgeDeck: document.querySelector('#countMazzo').textContent,
      preseYou: state.prese[0].length, preseOpp: state.prese[1].length,
      deck: state.cards.length - state.next,
      scope: state.scope.slice(),
      marksYou: document.querySelectorAll('#scopeYou .scopa-mark').length,
      marksOpp: document.querySelectorAll('#scopeOpp .scopa-mark').length,
      hand: [...document.querySelectorAll('.hand--you .card')]
        .map(c => ({ empty: c.dataset.empty, disabled: c.disabled })),
      slots: state.hands[0].map(c => !!c),
    }));

    // --- read the table, every play ---------------------------------------
    // Except mid-sweep, when the middle is deliberately still showing the
    // table the capture was made from — checkStates is where that is asserted.
    if (!st.sweeping && st.domTavola !== st.tavola)
      bad.push(`play ${st.plays}: the middle shows ${st.domTavola} cards, the engine holds ${st.tavola}`);
    if (st.badgeYou !== String(st.preseYou) || st.badgeOpp !== String(st.preseOpp))
      bad.push(`play ${st.plays}: badges say ${st.badgeYou}/${st.badgeOpp}, the piles hold ${st.preseYou}/${st.preseOpp}`);
    if (st.badgeDeck !== String(st.deck))
      bad.push(`play ${st.plays}: the deck badge says ${st.badgeDeck}, the deck holds ${st.deck}`);
    if (st.marksYou !== st.scope[0] || st.marksOpp !== st.scope[1])
      bad.push(`play ${st.plays}: ${st.marksYou}/${st.marksOpp} scopa marks, the engine counted ${st.scope[0]}/${st.scope[1]}`);
    // Every card you hold is shown, and every slot you do not is empty —
    // except in the beat between rounds, which is the one moment the page draws
    // empty hands over a state that already holds the next three. checkStates
    // is where that is asserted; here it would be a race, because the beat is
    // half a millisecond long at this speed.
    if (!st.beat) st.hand.forEach((node, i) => {
      if (st.slots[i] && node.empty === 'true')
        bad.push(`play ${st.plays}: slot ${i} holds a card and shows none`);
      if (!st.slots[i] && node.empty === 'false')
        bad.push(`play ${st.plays}: slot ${i} is empty and shows a card`);
    });
    scopeSeen = Math.max(scopeSeen, st.scope[0] + st.scope[1]);

    if (st.over) break;
    if (st.beat || st.sweeping) continue;   // the table is busy; the hand is not tappable
    if (st.turn !== 0) continue;   // the opponent is thinking

    // --- drive it ----------------------------------------------------------
    // Prefer a card that offers a choice, so both paths through the capture
    // state are exercised in one deal. Playing whatever card came first met no
    // choice at all in thirty-six plays and the assertion below reported it —
    // which is the assertion working, and the driver not.
    const move = await page.evaluate(() => {
      let best = -1, bestN = -1;
      for (let i = 0; i < state.hands[0].length; i++){
        if (!state.hands[0][i]) continue;
        const n = prese(state.tavola, state.hands[0][i]).length;
        if (n > bestN){ bestN = n; best = i; }
      }
      return { slot: best, choices: bestN };
    });
    if (move.slot < 0) { await page.waitForTimeout(40); continue; }

    const card = await page.$(`.hand--you .card[data-slot="${move.slot}"]`);
    await card.click();

    if (move.choices > 1) {
      // A choice: the card is raised now. The first is taken by accepting the
      // proposal the table offers, the next by tapping a table card to switch
      // it — so both paths §3.7 describes are exercised in one deal, as §4's
      // "Done when" requires.
      if (chosenByAccept > chosenByTap) {
        const idx = await page.evaluate(() => {
          const opts = proposte();
          const other = opts.findIndex(s => JSON.stringify(s) !== JSON.stringify(propostaCorrente()));
          return other < 0 ? -1 : opts[other][0];
        });
        if (idx >= 0) {
          await page.click(`.tavola .card[data-index="${idx}"]`);
          chosenByTap++;
        }
      } else {
        chosenByAccept++;   // accept the proposal exactly as the table offers it
      }
      await page.click(`.hand--you .card[data-slot="${move.slot}"]`);
    }
    plays++;
  }
  } catch (e) {
    bad.push(`the deal could not be driven to the end: ${String(e).split('\n')[0].slice(0, 100)}`);
  }

  const end = await page.evaluate(() => ({
    over: state.over, plays: state.plays,
    domTavola: document.querySelectorAll('.tavola .card').length,
    tavola: state.tavola.length,
    piles: state.prese[0].length + state.prese[1].length,
    say: document.querySelector('.sel-name').textContent,
    punti: scoreDeal(state).punti,
  }));

  if (!end.over) bad.push(`the deal did not finish: ${end.plays} plays`);
  if (end.plays !== 36) bad.push(`${end.plays} plays, want 36`);
  // §3.7 row six: the table is empty in the DOM after the leftovers go.
  if (end.domTavola !== 0 || end.tavola !== 0)
    bad.push(`the table still shows ${end.domTavola} cards after the last play`);
  if (end.piles !== 40) bad.push(`${end.piles} cards in the piles, want 40`);
  // And the score the page shows is what scoreDeal returned.
  const want = `Fine: ${end.punti[0]} a ${end.punti[1]}`;
  if (end.say !== want) bad.push(`the page says "${end.say}", scoreDeal returned "${want}"`);
  if (!chosenByTap) bad.push('no capture was chosen by tapping a table card');
  if (!chosenByAccept) bad.push('no capture was chosen by accepting the proposal');

  const all = [...bad, ...errs];
  console.log(`  ${all.length ? 'FAIL' : 'pass'}  one deal, ${plays} of your plays, `
    + `${chosenByTap} capture(s) chosen by tapping, ${chosenByAccept} by accepting, ${scopeSeen} scopa(e)`);
  all.slice(0, 6).forEach(b => console.log(`        ${b}`));
  await page.close();
  return all.length ? 1 : 0;
}

/* ---- run ------------------------------------------------------------------ */

const browser = await chromium.launch({ ...(CHROME && { executablePath: CHROME }), args: ['--no-sandbox'] });
let failed = 0;
failed += await checkDocument(browser);
failed += await checkScreens(browser);
failed += await checkTable(browser, null, false);
failed += await checkTable(browser, TIGHT, true);
failed += await checkChoice(browser);
failed += await checkStates(browser);
failed += await checkDeal(browser);
await browser.close();

console.log(failed ? `\n${failed} case(s) failed` : '\nAll checks pass.');
process.exit(failed ? 1 : 0);
