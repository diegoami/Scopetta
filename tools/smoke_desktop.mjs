#!/usr/bin/env node
/**
 * Smoke-test the built desktop app: the real scopetta.exe, not public/ in a
 * browser.
 *
 *   node tools/smoke_desktop.mjs                 # desktop/src-tauri/target/release/scopetta.exe
 *   node tools/smoke_desktop.mjs path/to/scopetta.exe
 *
 * tools/check_ui.mjs measures public/ over file://, and the app embeds those
 * same bytes, so the layout is already checked. What the check cannot see is
 * what only the wrapper can break: the page served from the app's own origin,
 * the decks and fonts over the asset protocol, and localStorage surviving a
 * restart. Nothing is injected into the build. WebView2 opens a DevTools port
 * when WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS asks for one, and playwright-core,
 * the one dev dependency, attaches to it over CDP. The harness is Tressette's,
 * which took the wrapper from Discola (DESKTOP.md); the deal it plays is Scopa's.
 *
 * Two launches. The first plays a whole deal and changes the deck; the second
 * has to find both. WEBVIEW2_USER_DATA_FOLDER points the app at a temporary
 * profile, so the smoke never writes into the player's own history, and every
 * run starts from empty storage.
 *
 * Windows only, like the build. Exit code 0 means every check passed.
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXE = process.argv[2] || join(ROOT, 'desktop/src-tauri/target/release/scopetta.exe');
const PORT = 9333;
const ORIGIN = 'http://tauri.localhost';
const DECKS = ['bresciane.jpg', 'francesi.png', 'napoletane.png',
               'piacentine.png', 'romagnole.png', 'trevisane.png'];
// A deal is 36 cards between two players, so a whole deal is 18 plays of yours.
const YOUR_PLAYS = 18;

if (!existsSync(EXE)) {
  console.error(`no app at ${EXE}: build it first (cd desktop && npm run build)`);
  process.exit(2);
}

const profile = mkdtempSync(join(tmpdir(), 'scopetta-smoke-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (ok, what, detail = '') => {
  if (!ok) failed++;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${what}${detail ? `  (${detail})` : ''}`);
};

async function launch() {
  const proc = spawn(EXE, [], {
    stdio: 'ignore',
    env: { ...process.env,
           WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
           WEBVIEW2_USER_DATA_FOLDER: profile },
  });
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    try { await fetch(`http://127.0.0.1:${PORT}/json/version`); break; } catch {}
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  let page;
  for (let i = 0; i < 60 && !page; i++) {
    page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith(ORIGIN));
    if (!page) await sleep(250);
  }
  if (!page) throw new Error(`no page at ${ORIGIN} in the app`);
  await page.waitForFunction(() => typeof state === 'object' && document.readyState === 'complete');
  return { proc, browser, page };
}

// Closed the way a player closes it: taskkill without /F posts WM_CLOSE to
// the window, so the restart finds what a real restart would. A hard kill is
// the fallback if the window does not close.
async function quit({ proc, browser }) {
  await browser.close().catch(() => {});
  const exited = new Promise(r => proc.once('exit', r));
  spawn('taskkill', ['/PID', String(proc.pid)], { stdio: 'ignore' });
  await Promise.race([exited, sleep(10000).then(() => proc.kill())]);
  await sleep(1500);   // WebView2's own processes let go of the profile after the host
}

// Your card, the way a player plays it: one tap plays it, and where the rules
// leave a choice of capture the tap raises it and a second tap on it accepts
// the capture the table proposes (PLAN.md §0, decision 6). Located by slot, as
// check_ui.mjs's deal pass does. The taps go to measured points through
// page.mouse rather than locator.click: attached to WebView2 over CDP,
// Playwright's visibility check does not pass for cards that are on screen at
// full size (Tressette found it on its fan), and the page takes the taps.
//
// The card played is the one with the most captures on offer, as check_ui.mjs
// drives it, so the second tap is reached whenever the hand allows it — and on
// the deal set up below it always does. Returns how many choices were met.
async function playDeal(page) {
  let plays = 0, choices = 0;
  for (let i = 0; i < 1200 && plays < YOUR_PLAYS; i++) {
    await sleep(60);
    const move = await page.evaluate(() => {
      if (state.over || state.deveGiocare !== 0 || beat || sweeping) return null;
      let slot = -1, n = -1;
      state.hands[0].forEach((c, i) => {
        if (!c) return;
        const k = prese(state.tavola, c).length;
        if (k > n){ n = k; slot = i; }
      });
      return slot < 0 ? null : { slot, choices: n };
    });
    if (!move) {
      if (await page.evaluate(() => state.over)) break;
      continue;
    }
    const card = page.locator(`.hand--you .card[data-slot="${move.slot}"]`);
    const tap = async () => {
      const box = await card.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    };
    await tap();
    if (move.choices > 1) { await sleep(120); await tap(); choices++; }
    plays++;
    await page.waitForFunction(() => state.deveGiocare !== 0 || state.over,
                               null, { timeout: 5000 }).catch(() => {});
  }
  return choices;
}

try {
  console.log(`first launch  ${EXE}`);
  let app = await launch();
  let { page } = app;
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  const origin = await page.evaluate(() => location.origin);
  check(origin === ORIGIN, 'served from the app origin', origin);
  // The window's size is the webview's viewport. 1280x800 is the size the UI
  // check's 'desktop window' row measures, so it has to be what opens.
  const inner = await page.evaluate(() => [innerWidth, innerHeight]);
  check(inner[0] === 1280 && inner[1] === 800, 'the window opens at 1280x800',
        `${inner[0]}x${inner[1]}`);
  const sheets = await page.evaluate(decks => Promise.all(decks.map(d => new Promise(r => {
    const i = new Image();
    i.onload = () => r([d, i.naturalWidth]);
    i.onerror = () => r([d, 0]);
    i.src = 'decks/' + d;
  }))), DECKS);
  const missing = sheets.filter(([, w]) => !w).map(([d]) => d);
  check(!missing.length, `all ${DECKS.length} decks load over the asset protocol`,
        missing.join(', '));

  // Not the default deck, Trevisane, or a lost setting would still pass; and
  // spelt as the page spells it, since an unknown name is a state no player
  // can reach. The pace is quickened as check_ui.mjs's deal pass does it, so a
  // whole deal takes seconds rather than minutes; it is saved with the deck,
  // which does not matter to anything the second launch checks.
  await page.evaluate(() => { applyDeck('Napoletane'); state.speed = 150; save(); });
  await page.click('#play');
  await page.waitForFunction(
    () => document.querySelectorAll('.hand--you .card:not([data-empty="true"])').length === 3,
    null, { timeout: 5000 }).catch(() => {});
  const dealt = await page.locator('.hand--you .card:not([data-empty="true"])').count();
  check(dealt === 3, 'a deal puts three cards in your hand', String(dealt));
  // Then the deal is replaced by a known one, because a random deal meets a
  // choice of capture about a third of the time, and a smoke that never makes
  // the second tap prints the same as one that does. Seed 16 with the dealer
  // cleared is check_ui.mjs's deal pass (its comment says why the dealer has to
  // be cleared); under the driver above its first choice comes before anything
  // this driver does differently, so every run meets at least one.
  await page.evaluate(`(() => { epoch++; state.mazziere = null;
    newDeal(state, rngSeed(16)); render();
    if (state.deveGiocare === 1) computerPlay(); })()`);
  const choices = await playDeal(page);
  const over = await page.waitForFunction(() => state.over, null, { timeout: 8000 })
    .then(() => true, () => false);
  // Read from the page, not counted here: a tap that did nothing would still
  // have been counted by the driver.
  const played = await page.evaluate(() => state.plays);
  check(over && played === 2 * YOUR_PLAYS, 'a whole deal plays through',
        `${played} of ${2 * YOUR_PLAYS} cards played`);
  check(choices > 0, 'a choice of capture is accepted with a second tap',
        choices ? `${choices} choice(s)` : 'the deal met no choice, so the second tap was never made');
  await page.waitForFunction(() => !document.querySelector('#result').hidden,
                             null, { timeout: 8000 }).catch(() => {});
  const title = await page.evaluate(() => document.querySelector('#resultTitle')?.textContent.trim());
  const shown = await page.evaluate(() => !document.querySelector('#result').hidden);
  check(shown && !!title, 'the end of the deal shows its result', title);
  const recorded = await page.evaluate(() => JSON.parse(localStorage.getItem(HKEY) || '[]').length);
  check(recorded === 1, 'the deal is recorded in the history', `${recorded} deals`);

  // Every face the page declares, loaded from the app and not the network.
  // Fonts load on use, so they are asked for explicitly first.
  const fonts = await page.evaluate(async () => {
    await Promise.all([...document.fonts].map(f => f.load().catch(() => {})));
    return [...document.fonts].map(f => `${f.family} ${f.weight} ${f.status}`);
  });
  const unloaded = fonts.filter(f => !f.endsWith('loaded'));
  check(fonts.length && !unloaded.length, `all ${fonts.length} @font-face rules load`,
        unloaded.join(', '));
  const foreign = await page.evaluate(o => performance.getEntriesByType('resource')
    .map(e => e.name).filter(n => !n.startsWith(o)), ORIGIN);
  check(!foreign.length, 'nothing is fetched from outside the app', foreign.join(', '));
  check(!errors.length, 'no script errors', errors.join(' | '));
  await quit(app);

  console.log('second launch');
  app = await launch();
  ({ page } = app);
  const kept = await page.evaluate(() => ({
    history: JSON.parse(localStorage.getItem(HKEY) || '[]').length,
    deck: state.deck,
  }));
  check(kept.history === 1, 'the deal is in the history after a restart', `${kept.history} deals`);
  check(kept.deck === 'Napoletane', 'the deck chosen before the restart is still chosen', kept.deck);
  await quit(app);
  check(readdirSync(profile).length > 0, 'the app wrote to the temporary profile, not the player\'s');
} catch (e) {
  failed++;
  console.log(`  FAIL  ${e.message}`);
} finally {
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks pass.');
process.exit(failed ? 1 : 0);
