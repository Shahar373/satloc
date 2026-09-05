// Builds public/models/eros-c3.glb: EROS-C3 modelled after ISI's published renderings.
//
//   - long cylindrical telescope tube wrapped in crinkled gold MLI, with a silver band
//   - open aperture (dark interior, secondary mirror on a spider) and a round cover door
//     hinged open below the aperture, gold outside, dark red with a cross inside
//   - avionics box at the rear with a grey radiator plate and a star tracker
//   - two solar wings of three blue cell panels each, attached at the rear, in the plane
//     of the tube axis (as in the renderings)
//   - two thin gold antenna booms reaching forward, ending in small white boxes
//
// Dimensions follow the published OptSat-3000 envelope (~4.6 m span, ~1.2 m diameter,
// ~3.3 m long). Model axes (glTF, metres): +Y = away from Earth, telescope points -Y.
// The whole model is finally rotated a quarter turn about Y because Cesium treats glTF +X as
// the entity's forward axis; that puts the wings across-track in flight.
// No dependencies: glTF 2.0 binary and PNG textures are written by hand.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'public', 'models', 'eros-c3.glb');

// ---------------------------------------------------------------- PNG encoder (RGBA)
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
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Deterministic value noise for the crinkled foil.
function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function valueNoise(x, y, cell, seed) {
  const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
  const fx = x / cell - gx, fy = y / cell - gy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(gx, gy, seed), b = hash(gx + 1, gy, seed), c = hash(gx, gy + 1, seed), d = hash(gx + 1, gy + 1, seed);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}
const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

const TEX = 256;
const goldTexture = encodePng(TEX, (x, y) => {
  // Crinkled foil: fine creases (ridges of a noise field) over a gentle large-scale variation.
  const n1 = valueNoise(x, y, 12, 7), n2 = valueNoise(x, y, 5, 11), n3 = valueNoise(x, y, 40, 19);
  const ridge = 1 - Math.abs(n1 * 2 - 1); // bright along creases
  const shade = 0.78 + 0.22 * (0.5 * ridge + 0.3 * n2 + 0.2 * n3) - 0.06;
  return [clamp255(236 * shade), clamp255(176 * shade), clamp255(62 * shade)];
});
const solarTexture = encodePng(TEX, (x, y) => {
  const cell = 32;
  const onGrid = x % cell < 2 || y % cell < 2;
  if (onGrid) return [196, 204, 220];
  // Sun-sensor cut-out: a small white square near one corner.
  if (x >= 200 && x < 228 && y >= 28 && y < 56) return [235, 238, 242];
  const gx = (x % cell) / cell, gy = (y % cell) / cell;
  const shine = 0.85 + 0.15 * (1 - Math.hypot(gx - 0.35, gy - 0.35));
  return [clamp255(22 * shine), clamp255(44 * shine), clamp255(120 * shine)];
});
const doorTexture = encodePng(TEX, (x, y) => {
  // Inside of the cover: dark red, with a lighter cross and rim.
  const cx = x - 128, cy = y - 128, r = Math.hypot(cx, cy);
  if (r > 118) return [200, 160, 70];
  if (Math.abs(cx) < 7 || Math.abs(cy) < 7 || Math.abs(r - 100) < 4) return [226, 190, 110];
  return [168, 62, 40];
});

// ---------------------------------------------------------------- geometry
// A primitive: flat arrays of positions, normals, uvs (optional) and indices.
function empty() {
  return { positions: [], normals: [], uvs: [], indices: [] };
}
function pushVertex(g, p, n, uv) {
  g.positions.push(p[0], p[1], p[2]);
  g.normals.push(n[0], n[1], n[2]);
  g.uvs.push(uv ? uv[0] : 0, uv ? uv[1] : 0);
  return g.positions.length / 3 - 1;
}
/** Quad a-b-c-d with normal n; the winding is fixed up so the front face agrees with n. */
function quad(g, a, b, c, d, n, uvs) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  const flip = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] < 0;
  const i0 = pushVertex(g, a, n, uvs?.[0]), i1 = pushVertex(g, b, n, uvs?.[1]), i2 = pushVertex(g, c, n, uvs?.[2]), i3 = pushVertex(g, d, n, uvs?.[3]);
  if (flip) g.indices.push(i0, i2, i1, i0, i3, i2);
  else g.indices.push(i0, i1, i2, i0, i2, i3);
}
function box(sx, sy, sz, uvScale = 1) {
  const g = empty();
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const faces = [
    { n: [1, 0, 0], v: [[hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz]], uv: [[0, 0], [0, sy], [sz, sy], [sz, 0]] },
    { n: [-1, 0, 0], v: [[-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-hx, -hy, -hz]], uv: [[0, 0], [0, sy], [sz, sy], [sz, 0]] },
    { n: [0, 1, 0], v: [[-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz]], uv: [[0, 0], [0, sz], [sx, sz], [sx, 0]] },
    { n: [0, -1, 0], v: [[-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz]], uv: [[0, 0], [0, sz], [sx, sz], [sx, 0]] },
    { n: [0, 0, 1], v: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]], uv: [[0, 0], [sx, 0], [sx, sy], [0, sy]] },
    { n: [0, 0, -1], v: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]], uv: [[0, 0], [sx, 0], [sx, sy], [0, sy]] },
  ];
  for (const f of faces) quad(g, f.v[0], f.v[1], f.v[2], f.v[3], f.n, f.uv.map((t) => [t[0] * uvScale, t[1] * uvScale]));
  return g;
}
/** Cylinder along Y from y0 to y1, radius r0 at y0 and r1 at y1; uv wraps around. */
function cylinderY(y0, y1, r0, r1, segments, opts = {}) {
  const g = empty();
  const { inward = false, uvRepeatU = 3, uvRepeatV = 2 } = opts;
  const slope = (r0 - r1) / (y1 - y0);
  for (let i = 0; i < segments; i++) {
    const a0 = (2 * Math.PI * i) / segments, a1 = (2 * Math.PI * (i + 1)) / segments;
    const ring = (a, y, r) => [r * Math.cos(a), y, r * Math.sin(a)];
    const nrm = (a) => {
      const n = [Math.cos(a), slope, Math.sin(a)];
      const l = Math.hypot(...n);
      const s = inward ? -1 : 1;
      return [(s * n[0]) / l, (s * n[1]) / l, (s * n[2]) / l];
    };
    const u0 = (i / segments) * uvRepeatU, u1 = ((i + 1) / segments) * uvRepeatU;
    const p = [ring(a0, y0, r0), ring(a1, y0, r0), ring(a1, y1, r1), ring(a0, y1, r1)];
    const n = nrm((a0 + a1) / 2);
    const uv = [[u0, 0], [u1, 0], [u1, uvRepeatV], [u0, uvRepeatV]];
    if (inward) quad(g, p[0], p[3], p[2], p[1], n, [uv[0], uv[3], uv[2], uv[1]]);
    else quad(g, p[0], p[1], p[2], p[3], n, uv);
  }
  return g;
}
/** Disk in the XZ plane at height y, radius r (inner radius rIn for a ring), facing +Y or -Y. */
function diskY(y, r, segments, facing = 1, rIn = 0) {
  const g = empty();
  const n = [0, facing, 0];
  for (let i = 0; i < segments; i++) {
    const a0 = (2 * Math.PI * i) / segments, a1 = (2 * Math.PI * (i + 1)) / segments;
    const p = (a, rr) => [rr * Math.cos(a), y, rr * Math.sin(a)];
    const uv = (a, rr) => [0.5 + (rr / r) * 0.5 * Math.cos(a), 0.5 + (rr / r) * 0.5 * Math.sin(a)];
    const pts = [p(a0, rIn), p(a1, rIn), p(a1, r), p(a0, r)];
    const uvs = [uv(a0, rIn), uv(a1, rIn), uv(a1, r), uv(a0, r)];
    if (facing > 0) quad(g, pts[0], pts[3], pts[2], pts[1], n, [uvs[0], uvs[3], uvs[2], uvs[1]]);
    else quad(g, pts[0], pts[1], pts[2], pts[3], n, uvs);
  }
  return g;
}
function translate(g, dx, dy, dz) {
  for (let i = 0; i < g.positions.length; i += 3) {
    g.positions[i] += dx;
    g.positions[i + 1] += dy;
    g.positions[i + 2] += dz;
  }
  return g;
}
/** Rotate by a 3x3 matrix (row-major) about the origin. */
function rotate(g, m) {
  const apply = (arr) => {
    for (let i = 0; i < arr.length; i += 3) {
      const x = arr[i], y = arr[i + 1], z = arr[i + 2];
      arr[i] = m[0] * x + m[1] * y + m[2] * z;
      arr[i + 1] = m[3] * x + m[4] * y + m[5] * z;
      arr[i + 2] = m[6] * x + m[7] * y + m[8] * z;
    }
  };
  apply(g.positions);
  apply(g.normals);
  return g;
}
const rotX = (t) => [1, 0, 0, 0, Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t)];
const rotY = (t) => [Math.cos(t), 0, Math.sin(t), 0, 1, 0, -Math.sin(t), 0, Math.cos(t)];
const rotZ = (t) => [Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t), 0, 0, 0, 1];
function merge(parts) {
  const g = empty();
  for (const p of parts) {
    const base = g.positions.length / 3;
    g.positions.push(...p.positions);
    g.normals.push(...p.normals);
    g.uvs.push(...p.uvs);
    g.indices.push(...p.indices.map((i) => i + base));
  }
  return g;
}
/** Thin cylinder from point a to point b (a boom). */
function strut(a, b, r, segments = 10) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...d);
  const g = cylinderY(0, len, r, r, segments, { uvRepeatU: 1, uvRepeatV: 1 });
  // rotate +Y onto d
  const u = d.map((v) => v / len);
  const axis = [u[2], 0, -u[0]]; // Y x u
  const al = Math.hypot(...axis);
  const angle = Math.acos(Math.max(-1, Math.min(1, u[1])));
  if (al > 1e-9) {
    const [ax, ay, az] = axis.map((v) => v / al);
    const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
    rotate(g, [
      t * ax * ax + c, t * ax * ay - s * az, t * ax * az + s * ay,
      t * ax * ay + s * az, t * ay * ay + c, t * ay * az - s * ax,
      t * ax * az - s * ay, t * ay * az + s * ax, t * az * az + c,
    ]);
  } else if (u[1] < 0) {
    rotate(g, rotX(Math.PI));
  }
  return translate(g, a[0], a[1], a[2]);
}

// ---------------------------------------------------------------- materials
const materials = [
  { name: 'mli-gold', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.75, roughnessFactor: 0.5 } },
  { name: 'solar', pbrMetallicRoughness: { baseColorTexture: { index: 1 }, baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.35, roughnessFactor: 0.3 } },
  { name: 'door-inside', pbrMetallicRoughness: { baseColorTexture: { index: 2 }, baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.2, roughnessFactor: 0.7 } },
  { name: 'silver', pbrMetallicRoughness: { baseColorFactor: [0.78, 0.8, 0.83, 1], metallicFactor: 0.95, roughnessFactor: 0.3 } },
  { name: 'black', pbrMetallicRoughness: { baseColorFactor: [0.02, 0.02, 0.025, 1], metallicFactor: 0.1, roughnessFactor: 0.95 } },
  { name: 'mirror', pbrMetallicRoughness: { baseColorFactor: [0.55, 0.6, 0.68, 1], metallicFactor: 1, roughnessFactor: 0.05 } },
  { name: 'grey-plate', pbrMetallicRoughness: { baseColorFactor: [0.55, 0.57, 0.6, 1], metallicFactor: 0.4, roughnessFactor: 0.6 } },
  { name: 'white', pbrMetallicRoughness: { baseColorFactor: [0.9, 0.9, 0.92, 1], metallicFactor: 0.1, roughnessFactor: 0.6 } },
  { name: 'dark-gold', pbrMetallicRoughness: { baseColorFactor: [0.6, 0.42, 0.14, 1], metallicFactor: 0.8, roughnessFactor: 0.45 } },
];
const M = Object.fromEntries(materials.map((m, i) => [m.name, i]));

// ---------------------------------------------------------------- the satellite (metres)
const R = 0.56; // tube radius
const Y_APERTURE = -1.35; // open end (nadir)
const Y_REAR = 1.15; // rear of the tube, where the avionics box starts
const SEG = 40;

const primitives = [];
const add = (material, geom) => primitives.push({ material, geom });

// Telescope tube (gold MLI) and its rear cap.
add(M['mli-gold'], cylinderY(Y_APERTURE, Y_REAR, R, R, SEG, { uvRepeatU: 4, uvRepeatV: 3 }));
// Silver band around the tube, a third of the way from the aperture.
add(M['silver'], merge([cylinderY(-0.45, -0.3, R + 0.015, R + 0.015, SEG), diskY(-0.3, R + 0.015, SEG, 1, R), diskY(-0.45, R + 0.015, SEG, -1, R)]));
// Aperture: silver rim, black interior wall, black bottom, secondary mirror on a spider.
add(M['silver'], merge([diskY(Y_APERTURE, R, SEG, -1, R - 0.04), cylinderY(Y_APERTURE - 0.03, Y_APERTURE, R, R, SEG)]));
add(M['black'], merge([cylinderY(Y_APERTURE, Y_APERTURE + 0.75, R - 0.04, R - 0.04, SEG, { inward: true }), diskY(Y_APERTURE + 0.75, R - 0.04, SEG, -1)]));
add(M['mirror'], diskY(Y_APERTURE + 0.74, R - 0.06, SEG, -1)); // primary mirror seen at the bottom of the tube
add(M['black'], merge([diskY(Y_APERTURE + 0.25, 0.13, 20, -1), cylinderY(Y_APERTURE + 0.25, Y_APERTURE + 0.33, 0.13, 0.13, 20)])); // secondary mirror housing
for (let i = 0; i < 3; i++) {
  const a = (2 * Math.PI * i) / 3 + 0.4;
  add(M['black'], strut([0, Y_APERTURE + 0.29, 0], [(R - 0.05) * Math.cos(a), Y_APERTURE + 0.29, (R - 0.05) * Math.sin(a)], 0.012, 6));
}

// Cover door: hinged at the +Z side of the rim, swung open ~110 degrees, hanging below the aperture.
{
  const DOOR_R = R + 0.02;
  // Closed, the door sits on the aperture: outer gold skin faces space (-Y), the red inside faces the tube (+Y).
  const doorOutside = diskY(-0.02, DOOR_R, SEG, -1);
  const doorInside = diskY(0.02, DOOR_R, SEG, 1);
  const doorEdge = cylinderY(-0.02, 0.02, DOOR_R, DOOR_R, SEG);
  const hinge = merge([box(0.16, 0.05, 0.12), translate(box(0.05, 0.05, 0.1), 0, 0, 0)]);
  const parts = [
    [M['mli-gold'], doorOutside],
    [M['door-inside'], doorInside],
    [M['dark-gold'], doorEdge],
  ];
  const open = rotX(-1.95); // ~112 degrees
  for (const [mat, g] of parts) {
    translate(g, 0, 0, -DOOR_R); // hinge point to the origin
    rotate(g, open);
    translate(g, 0, Y_APERTURE, DOOR_R);
    add(mat, g);
  }
  add(M['dark-gold'], translate(hinge, 0, Y_APERTURE - 0.02, DOOR_R + 0.02));
}

// Avionics box at the rear, with a grey radiator plate and a star tracker.
add(M['mli-gold'], translate(box(0.95, 0.72, 0.95, 1.2), 0, Y_REAR + 0.36, 0));
add(M['grey-plate'], translate(box(0.5, 0.52, 0.03), 0, Y_REAR + 0.4, 0.49));
add(M['grey-plate'], translate(box(0.34, 0.03, 0.4), 0.2, Y_REAR + 0.735, -0.1));
add(M['black'], translate(rotate(cylinderY(0, 0.22, 0.07, 0.05, 14), rotZ(-Math.PI / 2)), 0.47, Y_REAR + 0.15, -0.25)); // star tracker baffle on the +X side
// Small sensor on the tube.
add(M['black'], translate(rotate(cylinderY(0, 0.12, 0.05, 0.05, 12), rotZ(Math.PI / 2)), -R, 0.4, 0.15));

// Solar wings: yoke + three panels per side, in the plane of the tube axis (normals along Z).
for (const side of [-1, 1]) {
  const yokeStart = side * 0.47, yokeEnd = side * (R + 0.2);
  add(M['silver'], strut([yokeStart, Y_REAR + 0.35, 0], [yokeEnd, Y_REAR + 0.35, 0], 0.03, 8));
  const panelW = 0.5, panelH = 0.98, gap = 0.05;
  for (let i = 0; i < 3; i++) {
    const cx = side * (R + 0.2 + gap + panelW / 2 + i * (panelW + gap));
    add(M['solar'], translate(box(panelW, panelH, 0.02, 1), cx, Y_REAR + 0.35, 0));
    if (i < 2) add(M['silver'], translate(box(gap + 0.02, 0.05, 0.03), cx + side * (panelW / 2 + gap / 2), Y_REAR + 0.35, 0));
  }
  // Back-side frame rail
  add(M['silver'], translate(box(3 * panelW + 2 * gap, 0.04, 0.02), side * (R + 0.2 + gap + (3 * panelW + 2 * gap) / 2), Y_REAR + 0.35, -0.02));
}

// Two antenna booms reaching forward from the tube, ending in small white boxes.
for (const side of [-1, 1]) {
  const a = [side * 0.5, -0.55, -0.25];
  const b = [side * 1.15, -1.95, -0.7];
  add(M['dark-gold'], strut(a, b, 0.025, 8));
  add(M['white'], translate(box(0.24, 0.1, 0.22), b[0], b[1], b[2]));
  add(M['grey-plate'], translate(box(0.2, 0.02, 0.18), b[0], b[1] - 0.06, b[2]));
}

// Cesium's entity models treat glTF +X as forward: rotate a quarter turn about Y so the wings
// end up across-track in flight.
for (const { geom } of primitives) rotate(geom, rotY(Math.PI / 2));

// ---------------------------------------------------------------- glTF assembly
const bufferParts = [];
let byteLength = 0;
const bufferViews = [];
const accessors = [];
function pushView(bytes, target) {
  while (byteLength % 4) {
    bufferParts.push(Buffer.alloc(1));
    byteLength += 1;
  }
  const view = { buffer: 0, byteOffset: byteLength, byteLength: bytes.length };
  if (target) view.target = target;
  bufferViews.push(view);
  bufferParts.push(bytes);
  byteLength += bytes.length;
  return bufferViews.length - 1;
}
function accessor(view, componentType, count, type, minMax) {
  accessors.push({ bufferView: view, componentType, count, type, ...minMax });
  return accessors.length - 1;
}

const meshPrimitives = primitives.map(({ material, geom }) => {
  const pos = new Float32Array(geom.positions);
  const nor = new Float32Array(geom.normals);
  const uv = new Float32Array(geom.uvs);
  const idx = new Uint16Array(geom.indices);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], pos[i + k]);
      max[k] = Math.max(max[k], pos[i + k]);
    }
  }
  return {
    attributes: {
      POSITION: accessor(pushView(Buffer.from(pos.buffer), 34962), 5126, pos.length / 3, 'VEC3', { min, max }),
      NORMAL: accessor(pushView(Buffer.from(nor.buffer), 34962), 5126, nor.length / 3, 'VEC3', {}),
      TEXCOORD_0: accessor(pushView(Buffer.from(uv.buffer), 34962), 5126, uv.length / 2, 'VEC2', {}),
    },
    indices: accessor(pushView(Buffer.from(idx.buffer), 34963), 5123, idx.length, 'SCALAR', {}),
    material,
    mode: 4,
  };
});
const imageViews = [goldTexture, solarTexture, doorTexture].map((png) => pushView(png));

const bin = Buffer.concat(bufferParts);
const json = {
  asset: { version: '2.0', generator: 'SatLoc make-satellite-model' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'EROS-C3' }],
  meshes: [{ name: 'EROS-C3', primitives: meshPrimitives }],
  materials,
  images: imageViews.map((bufferView) => ({ bufferView, mimeType: 'image/png' })),
  samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
  textures: imageViews.map((_, i) => ({ sampler: 0, source: i })),
  buffers: [{ byteLength: bin.length }],
  bufferViews,
  accessors,
};
let jsonBuf = Buffer.from(JSON.stringify(json));
while (jsonBuf.length % 4) jsonBuf = Buffer.concat([jsonBuf, Buffer.from(' ')]);
let binBuf = bin;
while (binBuf.length % 4) binBuf = Buffer.concat([binBuf, Buffer.alloc(1)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonBuf.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(binBuf.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([header, jsonHeader, jsonBuf, binHeader, binBuf]));
console.log(`[make-satellite-model] wrote ${out} (${meshPrimitives.length} primitives, ${(header.readUInt32LE(8) / 1024).toFixed(0)} KB)`);
