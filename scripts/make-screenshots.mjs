// Captures App Store 6.5" screenshots (1242x2688 = 414x896 @3x) from the
// running expo web server on :8092 using headless Chrome.
// Run: node scripts/make-screenshots.mjs
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'screenshots', '6.5');
mkdirSync(OUT, { recursive: true });

const URL = 'http://localhost:8092';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--force-color-profile=srgb', '--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width: 414, height: 896, deviceScaleFactor: 3 });
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);

async function load(tally) {
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await page.evaluate((t) => {
    localStorage.clear();
    if (t) localStorage.setItem('coinflip.tally', JSON.stringify(t));
  }, tally ?? null);
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForFunction(() => document.body.innerText.includes('TAILS'), { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1200)); // fonts/layout settle
}

function resultShowing() {
  const first = document.body.innerText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)[0];
  return first === 'HEADS' || first === 'TAILS' ? first : null;
}

async function flipUntil(want) {
  for (let attempt = 0; attempt < 12; attempt++) {
    await page.evaluate(() => {
      document.elementFromPoint(207, 380).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForFunction(resultShowing, { timeout: 10000 });
    const got = await page.evaluate(resultShowing);
    if (got === want) {
      await new Promise((r) => setTimeout(r, 600)); // label fade + bounce settle
      return;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Never landed on ${want} in 12 flips (p = 1/4096, so something is broken)`);
}

// 01 — first-launch idle: coin + TAP TO FLIP
await load(null);
await page.screenshot({ path: join(OUT, '01-idle.png') });
console.log('01-idle.png');

// 02 — HEADS result with a modest tally
await load({ heads: 13, tails: 12 });
await flipUntil('HEADS');
await page.screenshot({ path: join(OUT, '02-heads.png') });
console.log('02-heads.png');

// 03 — TAILS result
await load({ heads: 20, tails: 20 });
await flipUntil('TAILS');
await page.screenshot({ path: join(OUT, '03-tails.png') });
console.log('03-tails.png');

// 04 — long-running tally
await load({ heads: 63, tails: 58 });
await flipUntil('HEADS');
await page.screenshot({ path: join(OUT, '04-tally.png') });
console.log('04-tally.png');

await browser.close();
console.log('done ->', OUT);
