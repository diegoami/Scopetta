#!/usr/bin/env node
/**
 * Cut the app icon out of the Napoletane sheet.
 *
 *   node tools/make_icons.mjs            # writes public/icons/
 *
 * The icon is the settebello, the seven of denari: the one card Scopa scores on
 * its own, and the card this game is named for. It is cut from the Napoletane
 * sheet, whose cell is the largest of the five decks (78x128), so the crop is
 * the same measure tools/import_bresciane.mjs would use and a coin reads as an
 * object at any size.
 *
 * Nothing here redraws anything. The crop is nearest-neighbour scaled
 * (`image-rendering: pixelated`), so every output pixel is one source pixel
 * repeated — the 1997 bitmap, larger. Interpolation invents pixels, which is
 * redrawing by another name, and CLAUDE.md is explicit that the card art is
 * not to be redrawn.
 *
 * Two crops, not one. The half card is the icon everywhere it is drawn at
 * 48px or more; at 32px seven coins in one square are a smudge, so the favicon
 * is the centre coin alone, filling it. The card is still what a tab shows
 * when the tab is large enough to show anything.
 *
 * Outputs, and who consumes them:
 *
 *   public/icons/icon-512.png     512  web app manifest
 *   public/icons/icon-192.png     192  web app manifest
 *   public/icons/apple-touch-icon.png  180
 *   public/icons/favicon-32.png    32  <link rel=icon>, and what stops the
 *                                      browser asking for /favicon.ico
 *
 * playwright-core does the drawing, as it does in tools/check_ui.mjs: it is
 * already the one dev dependency, and a browser screenshot is an exact PNG of
 * an exact box. No image library enters the project for this.
 */
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHEET = 'data:image/png;base64,' +
  readFileSync(ROOT + 'public/decks/napoletane.png').toString('base64');

// The Napoletane cell, on pack_cards.py's 11x4 grid: columns 0..9 are card
// numbers 1..10, rows 0..3 are the suits in TSeme order (Denari, Coppe, Spade,
// Bastoni). The settebello is column 6, row 0.
const CW = 78, CH = 128, COL = 6, ROW = 0;

// Crops inside that cell, in card pixels, measured off the 78x128 cell with a
// coordinate grid. HALF is the top half of the card — five of the seven coins —
// taken just inside its printed border so the rounded corners do not clip into
// the felt; COIN is the centre coin alone.
const HALF = { x: 5, y: 5, w: 68, h: 49 };
const COIN = { x: 28, y: 34, w: 18, h: 18 };

// The ground under the card. --felt and --felt-lit from public/index.html: the
// icon is the same table, lit the same way.
const FELT = '#1e5140', FELT_LIT = '#2a6b54';

// pad is the share of the square left as felt on each side.
const OUT = [
  ['public/icons/icon-512.png',         512, HALF, 0.12],
  ['public/icons/icon-192.png',         192, HALF, 0.12],
  ['public/icons/apple-touch-icon.png', 180, HALF, 0.12],
  ['public/icons/favicon-32.png',        32, COIN, 0.08],
];

const square = (size, crop, pad) => {
  // Scale the crop so its longest side fills what the padding leaves.
  const inner = size * (1 - 2 * pad);
  const k = Math.min(inner / crop.w, inner / crop.h);
  return `<body style="margin:0;width:${size}px;height:${size}px;display:flex;
    align-items:center;justify-content:center;
    background:radial-gradient(120% 120% at 50% 0%, ${FELT_LIT}, ${FELT} 70%)">
    <div style="width:${crop.w * k}px;height:${crop.h * k}px;
      background-image:url(${SHEET});
      background-size:${CW * 11 * k}px ${CH * 4 * k}px;
      background-position:-${(COL * CW + crop.x) * k}px -${(ROW * CH + crop.y) * k}px;
      image-rendering:pixelated"></div></body>`;
};

mkdirSync(ROOT + 'public/icons', { recursive: true });

const browser = await chromium.launch();
for (const [file, size, crop, pad] of OUT) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(square(size, crop, pad));
  await page.screenshot({ path: ROOT + file });
  await page.close();
  console.log(`wrote ${file}  ${size}x${size}`);
}
await browser.close();
