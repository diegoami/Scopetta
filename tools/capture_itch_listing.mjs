#!/usr/bin/env node
// Capture the released game and compose listing art from its original bitmaps.
// No game files or card art are edited. Run: node tools/capture_itch_listing.mjs
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildZip } from './zip_lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '1.0.4';
const TAG = `v${VERSION}`;
const SOURCE = 'c5d8a57dbe6f85fa2dc58b6adf08ccdc2c717f2c';
const EXPECTED_ZIP_HASH = '7c9e81d128b6c3b79b5ee9a99091d32048ee92ce13e93aac2793309af9cebccc';
const ZIP = path.join(ROOT, 'dist-itch', TAG, `Scopetta-${VERSION}-itch-html5.zip`);
const OUT = path.join(ROOT, 'itch-listing', TAG);
const SCRATCH = mkdtempSync(path.join(tmpdir(), 'scopetta-listing-'));
const SITE = path.join(SCRATCH, 'site');
const sha = data => createHash('sha256').update(data).digest('hex');
const images = [];
const errors = [];
let browser;
let server;

const STILL = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';

function artHtml(base, banner = false) {
  // Same Napoletane 11x4 sprite grid and Bodoni face as the shipped game.
  // Scaling is nearest-neighbour; the 1997 source bitmaps remain untouched.
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face{font-family:Bodoni;src:url('${base}fonts/bodoni-moda.woff2')}
  @font-face{font-family:Barlow;src:url('${base}fonts/barlow-500.woff2')}
  @font-face{font-family:Condensed;src:url('${base}fonts/barlow-condensed-500.woff2')}
  *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}
  body{background:#12332a;color:#f2ebdc}
  .art{width:630px;height:500px;position:relative;overflow:hidden;
    background:radial-gradient(ellipse at 50% 57%,#2a6b54 0%,#1e5140 43%,#12332a 100%)}
  .art:before{content:'';position:absolute;inset:16px;border:1px solid #c8a24a88}
  .art:after{content:'';position:absolute;inset:20px;border:1px solid #c8a24a22;pointer-events:none}
  .eyebrow{position:absolute;top:45px;width:100%;text-align:center;font:500 12px Condensed;
    letter-spacing:4px;color:#c8a24a}
  h1{position:absolute;top:75px;margin:0;width:100%;text-align:center;
    font:700 88px/1.08 Bodoni;letter-spacing:.01em;text-shadow:0 3px 24px #0004}
  .rule{position:absolute;left:calc(50% - 108px);top:190px;width:216px;height:1px;background:#c8a24a77}
  .rule:after{content:'◆';position:absolute;left:100px;top:-7px;font:12px Barlow;color:#c8a24a;background:#1f5140;padding:0 4px}
  .cards{position:absolute;left:0;top:219px;width:630px;height:235px}
  .card{position:absolute;left:calc(50% - 66.42px);width:132.84px;height:218px;
    background-image:url('${base}decks/napoletane.png');background-size:1461.24px 872px;
    background-position:calc(-132.84px * var(--col)) calc(-218px * var(--row));
    border-radius:7px;image-rendering:pixelated;box-shadow:0 12px 20px #071b16aa,0 0 0 1px #0004;
    transform-origin:50% 88%}
  .left{--col:9;--row:3;transform:translateX(-91px) rotate(-15deg);top:11px}
  .right{--col:0;--row:2;transform:translateX(91px) rotate(15deg);top:11px}
  .centre{--col:6;--row:0;top:-5px;box-shadow:0 16px 26px #071b16bb,0 0 0 1px #e3c58077}
  .footer{position:absolute;bottom:27px;width:100%;text-align:center;font:500 10px Condensed;
    letter-spacing:2.5px;color:#d0c6af}
  ${banner ? `
  .art{width:1600px;height:500px;background:radial-gradient(ellipse at 72% 50%,#2a6b54 0%,#1e5140 42%,#12332a 100%)}
  .art:before{inset:21px}.art:after{inset:26px}
  .eyebrow{top:108px;left:94px;width:auto;font-size:19px;letter-spacing:7px;text-align:left}
  h1{top:153px;left:87px;width:auto;font-size:132px;text-align:left}
  .rule{top:322px;left:97px;width:540px}.rule:after{left:252px}
  .cards{top:97px;left:859px;transform:scale(1.37);transform-origin:50% 0}
  .footer{left:98px;top:353px;width:auto;bottom:auto;font-size:15px;letter-spacing:3px;text-align:left}
  ` : ''}
  </style></head><body><main class="art">
  <div class="eyebrow">SCOPA A DUE</div><h1>Scopetta</h1><div class="rule"></div>
  <div class="cards"><div class="card left"></div><div class="card right"></div><div class="card centre"></div></div>
  <div class="footer">QUATTRO AVVERSARI · SEI MAZZI REGIONALI</div>
  </main></body></html>`;
}

async function save(page, name, description) {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(OUT, name), animations: 'disabled' });
  const png = readFileSync(path.join(OUT, name));
  const item = { file: name, width: png.readUInt32BE(16), height: png.readUInt32BE(20), bytes: png.length, sha256: sha(png), description };
  images.push(item);
  console.log(`${name}: ${item.width}x${item.height}, ${item.bytes} bytes`);
}

async function gamePage(base, locale, viewport, deck) {
  const context = await browser.newContext({ viewport, locale, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: STILL });
  await page.locator(`[data-deck="${deck}"]`).click();
  await page.mouse.move(0, 0);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page;
}

async function deal(page, seed) {
  await page.click('#play');
  await page.evaluate(seed => {
    epoch++;
    state.mazziere = null;
    newDeal(state, rngSeed(seed));
    state.speed = 1;
    state.sound = false;
    render();
    if (state.deveGiocare === 1) computerPlay();
  }, seed);
}

async function ready(page) {
  await page.waitForFunction(() => state.over || (!beat && !sweeping && state.deveGiocare === 0), null, { timeout: 10000 });
}

async function nextMove(page) {
  return page.evaluate(() => {
    let slot = -1, choices = -1;
    for (let i = 0; i < state.hands[0].length; i++) {
      if (!state.hands[0][i]) continue;
      const n = prese(state.tavola, state.hands[0][i]).length;
      if (n > choices) { slot = i; choices = n; }
    }
    return { slot, choices, over: state.over, plays: state.plays, cards: state.hands[0].filter(Boolean).length };
  });
}

try {
  if (!existsSync(ZIP) || sha(readFileSync(ZIP)) !== EXPECTED_ZIP_HASH)
    throw new Error('The verified v1.0.4 HTML5 release ZIP is required; refusing to capture another build.');
  mkdirSync(SITE);
  mkdirSync(OUT, { recursive: true });
  const extractor = process.platform === 'win32' ? path.join(process.env.SystemRoot, 'System32', 'tar.exe') : 'unzip';
  const args = process.platform === 'win32' ? ['-xf', ZIP, '-C', SITE] : ['-q', ZIP, '-d', SITE];
  const extracted = spawnSync(extractor, args, { encoding: 'utf8' });
  if (extracted.status !== 0) throw new Error(extracted.stderr || 'Release ZIP extraction failed.');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
  server = createServer((req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(SITE, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
      const rel = path.relative(SITE, file);
      if (rel.startsWith('..') || path.isAbsolute(rel) || !existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404).end(); return;
      }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(readFileSync(file));
    } catch { res.writeHead(400).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();

  // The cover is native HTML/CSS composition, not an altered screenshot.
  for (const scale of [1, 2]) {
    const context = await browser.newContext({ viewport: { width: 630, height: 500 }, deviceScaleFactor: scale });
    const page = await context.newPage();
    await page.setContent(artHtml(base));
    await page.evaluate(() => document.fonts.ready);
    await save(page, `cover-${630 * scale}x${500 * scale}.png`, 'Cover: original Napoletane cards and the game typography/colours.');
    await context.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 500 } });
    await page.setContent(artHtml(base, true));
    await page.evaluate(() => document.fonts.ready);
    await save(page, 'banner-1600x500.png', 'Optional itch.io page header.');
    await page.close();
  }

  const start = await gamePage(base, 'en-GB', { width: 1280, height: 1000 }, 'Napoletane');
  const clippedStart = await start.evaluate(() => {
    const sheet = document.querySelector('#viewStart .sheet-body');
    return sheet.scrollHeight > sheet.clientHeight + 1;
  });
  if (clippedStart) throw new Error('Start-screen listing image would omit controls below the fold.');
  await save(start, '04-opponents-and-decks.png', 'Released English start screen: the four opponents and six regional decks.');
  await start.context().close();

  const desktop = await gamePage(base, 'en-GB', { width: 1280, height: 800 }, 'Napoletane');
  await deal(desktop, 16);
  let tableSaved = false, choiceSaved = false;
  for (let guard = 0; guard < 40; guard++) {
    await ready(desktop);
    const move = await nextMove(desktop);
    if (move.over) break;
    if (!tableSaved && move.plays >= 12 && move.cards === 3) {
      await save(desktop, '01-gameplay.png', 'Real seeded deal after twelve legal plays, English, Napoletane deck.');
      tableSaved = true;
    }
    if (move.slot < 0) throw new Error('No playable player card.');
    const selector = `.hand--you .card[data-slot="${move.slot}"]`;
    await desktop.click(selector);
    if (move.choices > 1) {
      if (!choiceSaved) {
        await save(desktop, '02-choose-a-capture.png', 'Real legal capture choice: selected hand card and highlighted proposed capture.');
        choiceSaved = true;
      }
      await desktop.click(selector);
    }
    if (tableSaved && choiceSaved) break;
  }
  if (!tableSaved || !choiceSaved) throw new Error('The legal-play capture did not reach both listing states.');
  await desktop.context().close();

  const portrait = await gamePage(base, 'it-IT', { width: 480, height: 800 }, 'Romagnole');
  await deal(portrait, 16);
  for (let guard = 0; guard < 20; guard++) {
    await ready(portrait);
    const move = await nextMove(portrait);
    if (move.over) throw new Error('Portrait deal ended before capture.');
    if (move.plays >= 6 && move.cards === 3) break;
    const selector = `.hand--you .card[data-slot="${move.slot}"]`;
    await portrait.click(selector);
    if (move.choices > 1) await portrait.click(selector);
  }
  await save(portrait, '03-phone-italian.png', 'Actual portrait layout, Italian, Romagnole deck, after legal play.');
  await portrait.context().close();
  if (errors.length) throw new Error(errors.join('\n'));

  const uploadNotes = `Scopetta ${TAG} - itch.io images\n\n` +
    `Cover image: cover-630x500.png (or the 2x cover-1260x1000.png).\n` +
    `Screenshots: upload 01-gameplay.png, 02-choose-a-capture.png, 03-phone-italian.png, 04-opponents-and-decks.png in that order.\n` +
    `Optional header: banner-1600x500.png goes in Edit theme > Banner/Header image.\n\n` +
    `The screenshots are the released ${TAG} game, captured from its verified ZIP. Seed 16 makes the legal-play sequence reproducible. No game UI, scores or cards were invented or retouched.\n` +
    `The cover/banner reuse the original 1997 Napoletane bitmaps, the bundled Bodoni Moda/Barlow fonts and the game's felt/brass colours.\n` +
    `Source: ${SOURCE}\nHTML5 ZIP SHA256: ${EXPECTED_ZIP_HASH}\n`;
  writeFileSync(path.join(OUT, 'UPLOAD.txt'), uploadNotes);
  writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ version: VERSION, source: SOURCE, releaseZipSha256: EXPECTED_ZIP_HASH, images }, null, 2) + '\n');

  const packageFiles = [...images.map(i => i.file), 'UPLOAD.txt', 'manifest.json'];
  const archive = buildZip(packageFiles.map(name => ({ name, data: readFileSync(path.join(OUT, name)) })));
  const archivePath = path.join(ROOT, 'dist-itch', `Scopetta-${VERSION}-itch-images.zip`);
  writeFileSync(archivePath, archive);
  console.log(`Upload pack: ${archivePath} (${archive.length} bytes)`);
} finally {
  await browser?.close();
  server?.close();
  const tempRoot = path.resolve(tmpdir()) + path.sep;
  if (!path.resolve(SCRATCH).startsWith(tempRoot)) throw new Error('Scratch cleanup escaped the temporary directory.');
  rmSync(SCRATCH, { recursive: true, force: true });
}
