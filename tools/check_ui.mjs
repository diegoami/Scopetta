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
 *    then the tightest five again with the spacing tokens inflated. The card
 *    size is a budget and when it is wrong nothing throws: the cards quietly
 *    overlap, or your seat slides below the fold, or the rows drift apart.
 *    **It renders the table at 0, 4, 8 and 13 cards**, because the number of
 *    cards in the middle is this game's own way to fail and a freshly dealt
 *    table only ever shows four.
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
];

const SCREEN_VIEWPORTS = ['Android small', 'iPhone Pro Max', 'tablet portrait',
                          'phone landscape', 'laptop'];

const TIGHT = ['phone landscape', 'laptop short', 'iPad', 'tablet portrait', 'Android small'];

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
  const open = [...document.querySelectorAll('.view')].filter(v => !v.hidden);
  if (open.length !== 1) out.push(`${open.length} screens visible at once`);

  if (document.documentElement.scrollWidth > window.innerWidth + 1)
    out.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${window.innerWidth})`);

  // Sideways scroll is not enough on its own. The table sets `overflow: hidden
  // auto`, so anything too wide is clipped rather than scrollable and the
  // document width never betrays it — Discola cut the opponent's third card off
  // a phone screen through nineteen viewports while that assertion passed. Ask
  // the elements directly. The table row is in this list because it is the one
  // this game added.
  const past = [...document.querySelectorAll('.hand, .tavola, .tavola-row, .seat__cards, .plate, .toast')]
    .filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
    });
  for (const el of past.slice(0, 3)) {
    const r = el.getBoundingClientRect();
    out.push(`${name(el)} runs off the screen (${Math.round(r.left)}…${Math.round(r.right)} `
      + `vs 0…${window.innerWidth})`);
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
  { name: 'table, a scopa announced', open: async p => {
      await p.click('#play');
      await p.evaluate(`toast("Scopa!")`);
    } },
  { name: 'table, hands empty between rounds', open: async p => {
      await p.click('#play');
      await p.evaluate(`(() => {
        state.hands[0] = [null, null, null];
        state.hands[1] = [null, null, null];
        render();
      })()`);
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
  for (const vname of (QUICK ? ['Android small'] : SCREEN_VIEWPORTS)) {
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
  const oppHand = r('.hand--opp'), youHand = r('.hand--you');
  const middle = r('.middle'), tavola = r('.tavola');
  const card = r('.hand--you .card');
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
      lastWidth: Math.round(cs[cs.length - 1].width),
    };
  }).filter(Boolean);

  const cw = card ? card.width : 0;

  // Nothing in the middle may land on either hand. In Scopa the middle row can
  // grow to thirteen cards and two rows deep, so this is the assertion the
  // whole iteration is about.
  const cardsInTavola = [...document.querySelectorAll('.tavola .card')].map(c => c.getBoundingClientRect());
  const overlapsHand = cardsInTavola.filter(c =>
    (oppHand && c.top < oppHand.bottom - 1 && c.bottom > oppHand.top + 1) ||
    (youHand && c.top < youHand.bottom - 1 && c.bottom > youHand.top + 1)).length;

  return {
    sayShown,
    sayH: say ? Math.round(say.height) : 0,
    cw: Math.round(cw),
    rowStats,
    overlapsHand,
    // Your whole seat, not just your cards: in portrait the plate is below the
    // hand, and Tressette's hung 15px past the bottom of the screen while the
    // check printed `pass`, because it measured the hand.
    youSeatBottom: youSeat ? Math.round(youSeat.bottom) : 0,
    viewportH: window.innerHeight,
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
}`;

async function checkTable(browser, only, inflate) {
  console.log(inflate ? '\ntable, spacing inflated' : '\ntable');
  let failed = 0;
  let list = only ? VIEWPORTS.filter(v => only.includes(v[0])) : VIEWPORTS;
  if (QUICK) list = list.filter(v => ['phone landscape', 'Android small', 'laptop'].includes(v[0]));

  for (const [vname, w, h] of list) {
    for (const deck of (QUICK ? ['Trevisane'] : DECKS)) {
      for (const n of (QUICK ? [4, 13] : TABLE_SIZES)) {
        const page = await browser.newPage({ viewport: { width: w, height: h } });
        const errs = [];
        page.on('pageerror', e => errs.push(String(e)));
        page.on('console', m => { if (m.type() === 'error' && !noise(m.text())) errs.push(m.text()); });
        await page.goto(URL_);
        await page.addStyleTag({ content: STILL });
        if (inflate) await page.addStyleTag({ content: INFLATE });
        await page.click('#play');
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

        if (m.overlapsHand)
          bad.push(`${m.overlapsHand} table card(s) land on a hand`);

        if (m.youSeatBottom > m.viewportH + 1)
          bad.push(`your seat runs ${m.youSeatBottom - m.viewportH}px below the fold `
            + `(${m.youSeatBottom} vs ${m.viewportH})`);

        if (m.tavolaInsideTable > 1)
          bad.push(`the table row runs ${m.tavolaInsideTable}px outside the table`);

        if (m.tavolaCount !== m.engineCount)
          bad.push(`the middle shows ${m.tavolaCount} cards, the engine holds ${m.engineCount}`);

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
          if (row.lastWidth < m.cw - 1)
            bad.push(`the last card of a table row is ${row.lastWidth}px, not a whole ${m.cw}px card`);
        }

        // The rows must not drift apart: cards hit their cap and the grid hands
        // the leftover height to the gaps until a third of the table is empty.
        if (m.gapSpread > Math.max(24, m.cw * 0.5))
          bad.push(`the rows drift apart — gaps differ by ${m.gapSpread}px`);

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
  console.log(`  ${failed ? failed + ' case(s) failed' : 'pass'}  `
    + `${list.length} viewports x ${DECKS.length} decks x ${TABLE_SIZES.length} table sizes`);
  return failed;
}

/* ---- pass 2b: the capture choice and the toast ----------------------------- */

// The states §3.7 adds, measured rather than merely rendered. A capture with a
// choice in it is the one interaction this game has that neither ancestor did.
async function checkChoice(browser) {
  console.log('\nthe capture choice, and the toast');
  let failed = 0;
  for (const vname of (QUICK ? ['Android small'] : SCREEN_VIEWPORTS)) {
    const [, w, h] = VIEWPORTS.find(v => v[0] === vname);
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !noise(m.text())) errs.push(m.text()); });
    await page.goto(URL_);
    await page.addStyleTag({ content: STILL });
    await page.click('#play');
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
        const idx = proposte()[other][0];
        document.querySelector(`.tavola .card[data-index="${idx}"]`).click();
        const now = marked();
        const wantNow = [...propostaCorrente()].sort((a, b) => a - b);
        if (JSON.stringify(now) !== JSON.stringify(wantNow))
          out.push(`after tapping a table card the marks are ${JSON.stringify(now)}, want ${JSON.stringify(wantNow)}`);
        if (JSON.stringify(now) === JSON.stringify([...want].sort((a, b) => a - b)))
          out.push('tapping a table card did not change the proposal');
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

    const all = [...bad, ...toastBad, ...errs];
    if (all.length) {
      failed++;
      console.log(`  FAIL  ${vname}`);
      all.slice(0, 5).forEach(b => console.log(`        ${b}`));
    }
    await page.close();
  }
  console.log(`  ${failed ? failed + ' case(s) failed' : 'pass'}  ${SCREEN_VIEWPORTS.length} viewports`);
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

  for (let guard = 0; guard < 120 && plays < 36; guard++) {
    await page.waitForTimeout(25);
    const st = await page.evaluate(() => ({
      over: state.over, turn: state.deveGiocare, plays: state.plays,
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
    if (st.domTavola !== st.tavola)
      bad.push(`play ${st.plays}: the middle shows ${st.domTavola} cards, the engine holds ${st.tavola}`);
    if (st.badgeYou !== String(st.preseYou) || st.badgeOpp !== String(st.preseOpp))
      bad.push(`play ${st.plays}: badges say ${st.badgeYou}/${st.badgeOpp}, the piles hold ${st.preseYou}/${st.preseOpp}`);
    if (st.badgeDeck !== String(st.deck))
      bad.push(`play ${st.plays}: the deck badge says ${st.badgeDeck}, the deck holds ${st.deck}`);
    if (st.marksYou !== st.scope[0] || st.marksOpp !== st.scope[1])
      bad.push(`play ${st.plays}: ${st.marksYou}/${st.marksOpp} scopa marks, the engine counted ${st.scope[0]}/${st.scope[1]}`);
    // Every card you hold is shown, and every slot you do not is empty.
    st.hand.forEach((node, i) => {
      if (st.slots[i] && node.empty === 'true')
        bad.push(`play ${st.plays}: slot ${i} holds a card and shows none`);
      if (!st.slots[i] && node.empty === 'false')
        bad.push(`play ${st.plays}: slot ${i} is empty and shows a card`);
    });
    scopeSeen = Math.max(scopeSeen, st.scope[0] + st.scope[1]);

    if (st.over) break;
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
failed += await checkDeal(browser);
await browser.close();

console.log(failed ? `\n${failed} case(s) failed` : '\nAll checks pass.');
process.exit(failed ? 1 : 0);
