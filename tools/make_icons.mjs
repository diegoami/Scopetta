#!/usr/bin/env node
/**
 * Cut the app icon out of the Napoletane sheet.
 *
 *   node tools/make_icons.mjs            # writes public/icons/, assets/, desktop/src-tauri/icons/
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
 *   assets/icon-only.png         1024  @capacitor/assets -> every Android density
 *   assets/icon-foreground.png   1024  the adaptive icon's foreground layer
 *   assets/icon-background.png   1024  the adaptive icon's background layer
 *   desktop/src-tauri/icons/32x32.png         32  Tauri bundle.icon
 *   desktop/src-tauri/icons/128x128.png      128  Tauri bundle.icon
 *   desktop/src-tauri/icons/128x128@2x.png   256  Tauri bundle.icon
 *   desktop/src-tauri/icons/icon.png         512  Tauri bundle.icon
 *   desktop/src-tauri/icons/icon.ico  16/32/48/256  the Windows resource: the
 *                                      window, the taskbar and the .exe itself
 *
 * The .ico is a real multi-size icon, PNG frames in an ICO container (Windows
 * reads those since Vista), so Windows picks the frame it needs instead of
 * scaling one. Its 16 and 32 frames are the coin, like the favicon, for the
 * same reason: below 48px the half card is a smudge. The ICO writer is
 * Tressette's, which took the wrapper from Discola (DESKTOP.md).
 *
 * The three `assets/` files exist for the Android wrapper (mobile/): Capacitor's
 * asset tool turns them into the launcher icons at every density. Nothing else
 * reads them, and a web-only checkout can ignore the directory.
 *
 * playwright-core does the drawing, as it does in tools/check_ui.mjs: it is
 * already the one dev dependency, and a browser screenshot is an exact PNG of
 * an exact box. No image library enters the project for this.
 */
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
  // The adaptive icon's foreground needs much more felt around it: Android
  // masks an adaptive icon to a shape that can cut a quarter off every edge.
  ['assets/icon-only.png',             1024, HALF, 0.12],
  ['assets/icon-foreground.png',       1024, HALF, 0.26],
  ['desktop/src-tauri/icons/32x32.png',        32, COIN, 0.08],
  ['desktop/src-tauri/icons/128x128.png',     128, HALF, 0.12],
  ['desktop/src-tauri/icons/128x128@2x.png',  256, HALF, 0.12],
  ['desktop/src-tauri/icons/icon.png',        512, HALF, 0.12],
];

// The .ico's frames: the crop each size gets follows the same 48px line.
const ICO = 'desktop/src-tauri/icons/icon.ico';
const ICO_FRAMES = [[16, COIN, 0.08], [32, COIN, 0.08], [48, HALF, 0.12], [256, HALF, 0.12]];

// An ICO of PNG frames: a 6-byte header, a 16-byte entry per frame, then the
// PNGs back to back. A size of 256 is written as 0, which is how the format
// spells it in a byte.
const ico = frames => {
  const header = Buffer.alloc(6 + 16 * frames.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  frames.forEach(([size, png], i) => {
    const e = 6 + 16 * i, dim = size >= 256 ? 0 : size;
    header.writeUInt8(dim, e);
    header.writeUInt8(dim, e + 1);
    header.writeUInt16LE(1, e + 4);            // colour planes
    header.writeUInt16LE(32, e + 6);           // bits per pixel
    header.writeUInt32LE(png.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...frames.map(([, png]) => png)]);
};

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
mkdirSync(ROOT + 'assets', { recursive: true });
mkdirSync(ROOT + 'desktop/src-tauri/icons', { recursive: true });

const browser = await chromium.launch();
const shoot = async (size, crop, pad, path) => {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(square(size, crop, pad));
  const png = await page.screenshot(path ? { path } : {});
  await page.close();
  return png;
};
for (const [file, size, crop, pad] of OUT) {
  await shoot(size, crop, pad, ROOT + file);
  console.log(`wrote ${file}  ${size}x${size}`);
}
const frames = [];
for (const [size, crop, pad] of ICO_FRAMES) frames.push([size, await shoot(size, crop, pad)]);
writeFileSync(ROOT + ICO, ico(frames));
console.log(`wrote ${ICO}  ${ICO_FRAMES.map(([s]) => s).join('/')}`);

// The adaptive icon's background layer is the felt alone — no card, because
// Android slides the two layers against each other and anything drawn here
// would drift out from under the foreground.
{
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0;width:1024px;height:1024px;
    background:radial-gradient(120% 120% at 50% 0%, ${FELT_LIT}, ${FELT} 70%)"></body>`);
  await page.screenshot({ path: ROOT + 'assets/icon-background.png' });
  await page.close();
  console.log('wrote assets/icon-background.png  1024x1024');
}
await browser.close();
