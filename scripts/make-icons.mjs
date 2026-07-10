// Generates assets/icon.png (1024), assets/splash-icon.png (1024, transparent),
// assets/favicon.png (48) from inline SVG. Run: node scripts/make-icons.mjs
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'assets'), { recursive: true });

const C = 512;

function rays() {
  let out = '';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const long = i % 2 === 0;
    const rBase = 122;
    const rTip = long ? 208 : 172;
    const spread = 0.085;
    const x1 = C + Math.cos(a - spread) * rBase;
    const y1 = C + Math.sin(a - spread) * rBase;
    const x2 = C + Math.cos(a + spread) * rBase;
    const y2 = C + Math.sin(a + spread) * rBase;
    const xt = C + Math.cos(a) * rTip;
    const yt = C + Math.sin(a) * rTip;
    out += `<path d="M ${x1} ${y1} L ${xt} ${yt} L ${x2} ${y2} Z" fill="url(#emblem)"/>`;
  }
  return out;
}

function beads(radius, count, r) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    out += `<circle cx="${C + Math.cos(a) * radius}" cy="${C + Math.sin(a) * radius}" r="${r}" fill="#A87A1D" opacity="0.75"/>`;
  }
  return out;
}

const defs = `
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="80%">
      <stop offset="0%" stop-color="#201d16"/>
      <stop offset="100%" stop-color="#0d0e12"/>
    </radialGradient>
    <radialGradient id="face" cx="38%" cy="30%" r="85%">
      <stop offset="0%" stop-color="#FCEFB8"/>
      <stop offset="45%" stop-color="#EFC75E"/>
      <stop offset="78%" stop-color="#D9A537"/>
      <stop offset="100%" stop-color="#9C7118"/>
    </radialGradient>
    <radialGradient id="rim" cx="38%" cy="30%" r="90%">
      <stop offset="0%" stop-color="#F3D678"/>
      <stop offset="70%" stop-color="#C6913A"/>
      <stop offset="100%" stop-color="#7A5510"/>
    </radialGradient>
    <linearGradient id="emblem" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#B98B2A"/>
      <stop offset="100%" stop-color="#8F6414"/>
    </linearGradient>
  </defs>`;

// coin scaled to fill most of the 1024 box (radius 430)
const coin = `
  <circle cx="${C}" cy="${C}" r="430" fill="url(#rim)"/>
  <circle cx="${C}" cy="${C}" r="396" fill="url(#face)"/>
  <circle cx="${C}" cy="${C}" r="390" fill="none" stroke="#8F6414" stroke-width="4" opacity="0.6"/>
  ${beads(362, 56, 7)}
  ${rays()}
  <circle cx="${C}" cy="${C}" r="98" fill="url(#emblem)"/>
  <circle cx="${C - 26}" cy="${C - 30}" r="86" fill="rgba(255,244,200,0.18)"/>
  <circle cx="${C - 90}" cy="${C - 110}" r="400" fill="rgba(255,255,255,0.09)"/>`;

const iconSvg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
  ${defs}
  <rect width="1024" height="1024" fill="url(#bg)"/>
  ${coin}
</svg>`;

const splashSvg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
  ${defs}
  ${coin}
</svg>`;

await sharp(Buffer.from(iconSvg)).resize(1024, 1024).png().toFile(join(root, 'assets', 'icon.png'));
await sharp(Buffer.from(splashSvg)).resize(1024, 1024).png().toFile(join(root, 'assets', 'splash-icon.png'));
await sharp(Buffer.from(iconSvg)).resize(48, 48).png().toFile(join(root, 'assets', 'favicon.png'));
console.log('Wrote icon.png, splash-icon.png, favicon.png');
