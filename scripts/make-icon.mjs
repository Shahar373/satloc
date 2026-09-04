// Generates src-tauri/icon-source.png (1024x1024): a shaded blue planet with an orbit ring
// and a satellite dot. No dependencies; writes the PNG by hand. `npm run icons` then lets
// the Tauri CLI derive every platform icon from it.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 1024;
const SS = 2; // supersampling per axis
const out = join(dirname(dirname(fileURLToPath(import.meta.url))), 'src-tauri', 'icon-source.png');

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (edge, width, v) => clamp01((edge - v) / width + 0.5); // 1 inside, 0 outside
const mix = (a, b, t) => a.map((c, i) => c + (b[i] - c) * t);

const BG = [11, 18, 32];
const OCEAN = [24, 96, 200];
const OCEAN_LIGHT = [92, 200, 255];
const OCEAN_DARK = [6, 26, 70];
const RING = [232, 241, 255];
const SAT = [255, 207, 90];

const R_BG = 500;
const R_EARTH = 300;
const RING_A = 440;
const RING_B = 150;
const RING_T = 12;
const RING_ANGLE = (-25 * Math.PI) / 180;
const SAT_T = (35 * Math.PI) / 180; // parametric angle on the ring, front half
const SAT_R = 26;

const cosA = Math.cos(RING_ANGLE);
const sinA = Math.sin(RING_ANGLE);
const satLocal = [RING_A * Math.cos(SAT_T), RING_B * Math.sin(SAT_T)];
const satPos = [
  satLocal[0] * cosA - satLocal[1] * sinA,
  satLocal[0] * sinA + satLocal[1] * cosA,
];

function shade(x, y) {
  // Returns [r, g, b, a] for a point in centred coordinates.
  const r = Math.hypot(x, y);
  let color = [0, 0, 0];
  let alpha = smooth(R_BG, 1.5, r);
  color = BG;

  // Atmosphere glow
  const glow = clamp01(1 - (r - R_EARTH) / 45) * (r > R_EARTH ? 1 : 0);
  color = mix(color, OCEAN_LIGHT, glow * glow * 0.45);

  // Planet with a light source at the upper left
  const inEarth = smooth(R_EARTH, 1.5, r);
  if (inEarth > 0) {
    const nx = x / R_EARTH;
    const ny = y / R_EARTH;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const light = clamp01(nx * -0.55 + ny * -0.6 + nz * 0.58);
    let earth = mix(OCEAN_DARK, OCEAN, clamp01(light * 1.4));
    earth = mix(earth, OCEAN_LIGHT, Math.pow(light, 6) * 0.6);
    color = mix(color, earth, inEarth);
  }

  // Orbit ring: local ellipse coordinates
  const lx = x * cosA + y * sinA;
  const ly = -x * sinA + y * cosA;
  const f = Math.sqrt((lx * lx) / (RING_A * RING_A) + (ly * ly) / (RING_B * RING_B));
  const ringDist = Math.abs(f - 1) * Math.min(RING_A, RING_B) * 1.6;
  const behindEarth = ly < 0 && r < R_EARTH;
  const ring = behindEarth ? 0 : smooth(RING_T / 2, 1.5, ringDist);
  color = mix(color, RING, ring * 0.92);

  // Satellite
  const sd = Math.hypot(x - satPos[0], y - satPos[1]);
  const satGlow = clamp01(1 - (sd - SAT_R) / 22);
  color = mix(color, SAT, satGlow * satGlow * 0.35);
  color = mix(color, SAT, smooth(SAT_R, 1.5, sd));

  return [color[0], color[1], color[2], alpha];
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let py = 0; py < SIZE; py++) {
  raw[py * (SIZE * 4 + 1)] = 0; // filter: none
  for (let px = 0; px < SIZE; px++) {
    let acc = [0, 0, 0, 0];
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const x = px + (sx + 0.5) / SS - SIZE / 2;
        const y = py + (sy + 0.5) / SS - SIZE / 2;
        const s = shade(x, y);
        acc = acc.map((v, i) => v + s[i]);
      }
    }
    const n = SS * SS;
    const o = py * (SIZE * 4 + 1) + 1 + px * 4;
    raw[o] = Math.round(acc[0] / n);
    raw[o + 1] = Math.round(acc[1] / n);
    raw[o + 2] = Math.round(acc[2] / n);
    raw[o + 3] = Math.round((acc[3] / n) * 255);
  }
}

const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(out, png);
console.log(`[make-icon] wrote ${out} (${png.length} bytes)`);
