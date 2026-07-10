// Synthesizes assets/sounds/flip.wav (bright metallic ping, like a coin
// launched off a thumbnail) and catch.wav (soft palm-catch thud).
// Pure Node, no dependencies. Run: node scripts/make-sounds.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SR = 44100;

function writeWav(name, buf) {
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  const norm = 0.79 / (peak || 1);
  const fadeStart = Math.floor(buf.length - 0.01 * SR);
  const dataLen = buf.length * 2;
  const wav = Buffer.alloc(44 + dataLen);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataLen, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(SR, 24);
  wav.writeUInt32LE(SR * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < buf.length; i++) {
    let v = buf[i] * norm;
    if (i > fadeStart) v *= (buf.length - i) / (buf.length - fadeStart);
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2);
  }
  mkdirSync(join(root, 'assets', 'sounds'), { recursive: true });
  writeFileSync(join(root, 'assets', 'sounds', name), wav);
  console.log('Wrote assets/sounds/' + name, wav.length, 'bytes');
}

// --- flip.wav: inharmonic metallic partials, ~0.5s ring ---
{
  const dur = 0.55;
  const buf = new Float64Array(Math.floor(dur * SR));
  // partial ratios loosely modeled on a struck metal disc
  const set = [
    [2093, 1.0, 0.17],
    [2841, 0.55, 0.12],
    [3520, 0.35, 0.09],
    [4699, 0.2, 0.06],
    [1318, 0.25, 0.2],
  ];
  for (let i = 0; i < buf.length; i++) {
    const t = i / SR;
    const attack = Math.min(1, t / 0.002);
    let s = 0;
    for (const [f, g, decay] of set) {
      s += Math.sin(2 * Math.PI * f * t + Math.sin(t * 40) * 0.06) * g * Math.exp(-t / decay);
    }
    // tiny noise transient for the "strike"
    if (t < 0.012) s += (Math.random() * 2 - 1) * 0.5 * (1 - t / 0.012);
    buf[i] = s * attack;
  }
  writeWav('flip.wav', buf);
}

// --- catch.wav: low soft thud, ~0.14s ---
{
  const dur = 0.16;
  const buf = new Float64Array(Math.floor(dur * SR));
  for (let i = 0; i < buf.length; i++) {
    const t = i / SR;
    const attack = Math.min(1, t / 0.003);
    const pitch = 165 * Math.exp(-t * 9); // falling pitch = soft impact
    let s =
      Math.sin(2 * Math.PI * pitch * t) * Math.exp(-t / 0.045) +
      Math.sin(2 * Math.PI * 88 * t) * 0.5 * Math.exp(-t / 0.06);
    if (t < 0.008) s += (Math.random() * 2 - 1) * 0.25 * (1 - t / 0.008);
    buf[i] = s * attack;
  }
  writeWav('catch.wav', buf);
}
