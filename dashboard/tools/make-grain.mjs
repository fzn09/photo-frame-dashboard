// Writes public/bg/grain.png: a 160 px tile of black and white specks at 4-10% alpha, repeated over the stage
// gradient (css/base.css). Seeded, so a rerun gives the same bytes. Run: node tools/make-grain.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const N = 160;
let s = 7;
const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0, o = 0; y < N; y++) {
  raw[o++] = 0; // filter: none
  for (let x = 0; x < N; x++) {
    const v = rnd() < 0.5 ? 0 : 255;
    raw[o++] = v; raw[o++] = v; raw[o++] = v; raw[o++] = Math.round(10 + rnd() * 16);
  }
}
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = ~0; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (~c) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
writeFileSync(new URL('../public/bg/grain.png', import.meta.url), png);
console.log('grain.png', png.length, 'bytes');
