// Builds public/models/eros-c3.glb: a schematic EROS-C3 / OptSat-3000-class imaging satellite.
// Dimensions follow the published envelope (about 4.6 m span with both solar wings deployed,
// ~1.2 m bus). No dependencies; writes glTF 2.0 binary by hand.
//
// Model axes (glTF, metres): +Y up = away from Earth, so the telescope points along -Y (nadir);
// solar wings extend along ±X; +Z is the direction of flight.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'public', 'models', 'eros-c3.glb');

const materials = [
  { name: 'mli-gold', pbrMetallicRoughness: { baseColorFactor: [0.85, 0.62, 0.18, 1], metallicFactor: 0.7, roughnessFactor: 0.45 } },
  { name: 'solar-cell', pbrMetallicRoughness: { baseColorFactor: [0.06, 0.12, 0.35, 1], metallicFactor: 0.3, roughnessFactor: 0.25 } },
  { name: 'baffle-black', pbrMetallicRoughness: { baseColorFactor: [0.08, 0.08, 0.09, 1], metallicFactor: 0.2, roughnessFactor: 0.8 } },
  { name: 'structure', pbrMetallicRoughness: { baseColorFactor: [0.75, 0.76, 0.78, 1], metallicFactor: 0.9, roughnessFactor: 0.35 } },
  { name: 'radiator-white', pbrMetallicRoughness: { baseColorFactor: [0.92, 0.93, 0.95, 1], metallicFactor: 0.1, roughnessFactor: 0.6 } },
];
const M = Object.fromEntries(materials.map((m, i) => [m.name, i]));

// --- geometry builders: each returns { positions: number[], normals: number[], indices: number[] }
function box(cx, cy, cz, sx, sy, sz) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const faces = [
    { n: [1, 0, 0], v: [[hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz]] },
    { n: [-1, 0, 0], v: [[-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-hx, -hy, -hz]] },
    { n: [0, 1, 0], v: [[-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz]] },
    { n: [0, -1, 0], v: [[-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz]] },
    { n: [0, 0, 1], v: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
    { n: [0, 0, -1], v: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
  ];
  const positions = [], normals = [], indices = [];
  for (const f of faces) {
    const base = positions.length / 3;
    for (const [x, y, z] of f.v) {
      positions.push(x + cx, y + cy, z + cz);
      normals.push(...f.n);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions, normals, indices };
}

/** Prism / cylinder along Y with `segments` sides, from y0 to y1, radius r. */
function prismY(cx, cz, y0, y1, r, segments, capped = true) {
  const positions = [], normals = [], indices = [];
  for (let i = 0; i < segments; i++) {
    const a0 = (2 * Math.PI * i) / segments, a1 = (2 * Math.PI * (i + 1)) / segments;
    const am = (a0 + a1) / 2;
    const n = [Math.cos(am), 0, Math.sin(am)];
    const quad = [
      [cx + r * Math.cos(a0), y0, cz + r * Math.sin(a0)],
      [cx + r * Math.cos(a1), y0, cz + r * Math.sin(a1)],
      [cx + r * Math.cos(a1), y1, cz + r * Math.sin(a1)],
      [cx + r * Math.cos(a0), y1, cz + r * Math.sin(a0)],
    ];
    const base = positions.length / 3;
    for (const p of quad) {
      positions.push(...p);
      normals.push(...n);
    }
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  if (capped) {
    for (const [y, ny] of [[y1, 1], [y0, -1]]) {
      const base = positions.length / 3;
      positions.push(cx, y, cz);
      normals.push(0, ny, 0);
      for (let i = 0; i < segments; i++) {
        const a = (2 * Math.PI * i) / segments;
        positions.push(cx + r * Math.cos(a), y, cz + r * Math.sin(a));
        normals.push(0, ny, 0);
      }
      for (let i = 0; i < segments; i++) {
        const b = base + 1 + i, c = base + 1 + ((i + 1) % segments);
        if (ny > 0) indices.push(base, c, b);
        else indices.push(base, b, c);
      }
    }
  }
  return { positions, normals, indices };
}

function merge(parts) {
  const positions = [], normals = [], indices = [];
  for (const p of parts) {
    const base = positions.length / 3;
    positions.push(...p.positions);
    normals.push(...p.normals);
    indices.push(...p.indices.map((i) => i + base));
  }
  return { positions, normals, indices };
}

// --- the satellite
const BUS_R = 0.62, BUS_Y0 = -0.75, BUS_Y1 = 0.85;
const primitives = [
  // hexagonal bus with gold multilayer insulation
  { material: M['mli-gold'], geom: prismY(0, 0, BUS_Y0, BUS_Y1, BUS_R, 6) },
  // white radiator panel on the +Z (velocity) face region
  { material: M['radiator-white'], geom: box(0, 0.05, BUS_R * 0.87 + 0.01, 0.55, 0.9, 0.02) },
  // telescope baffle pointing to nadir (-Y), with a dark aperture ring
  { material: M['baffle-black'], geom: prismY(0, 0, BUS_Y0 - 0.55, BUS_Y0 + 0.02, 0.36, 24) },
  { material: M['structure'], geom: prismY(0, 0, BUS_Y0 - 0.58, BUS_Y0 - 0.54, 0.40, 24) },
  // solar wings: yoke + three panels each side, spanning ~4.6 m tip to tip
  ...[-1, 1].flatMap((side) => {
    const yoke = box(side * (BUS_R + 0.12), 0.1, 0, 0.24, 0.06, 0.06);
    const panels = [0, 1, 2].map((i) =>
      box(side * (BUS_R + 0.24 + 0.51 * i + 0.255), 0.1, 0, 0.5, 0.02, 0.95),
    );
    const rail = box(side * (BUS_R + 0.24 + 0.765), 0.1 + 0.02, 0, 1.53, 0.02, 0.06);
    return [
      { material: M['structure'], geom: merge([yoke, rail]) },
      { material: M['solar-cell'], geom: merge(panels) },
    ];
  }),
  // star tracker and an S-band antenna on the zenith face
  { material: M['structure'], geom: prismY(0.25, -0.2, BUS_Y1, BUS_Y1 + 0.22, 0.07, 12) },
  { material: M['structure'], geom: prismY(-0.3, 0.25, BUS_Y1, BUS_Y1 + 0.12, 0.12, 16) },
];

// Cesium's entity models treat glTF +X as the forward axis; rotate the whole satellite a quarter
// turn about Y so the solar wings end up across-track and the radiator faces the direction of flight.
for (const { geom } of primitives) {
  for (let i = 0; i < geom.positions.length; i += 3) {
    const x = geom.positions[i], z = geom.positions[i + 2];
    geom.positions[i] = z;
    geom.positions[i + 2] = -x;
    const nx = geom.normals[i], nz = geom.normals[i + 2];
    geom.normals[i] = nz;
    geom.normals[i + 2] = -nx;
  }
}

// --- glTF assembly
const bufferParts = [];
let byteLength = 0;
const bufferViews = [];
const accessors = [];
function pushView(bytes, target) {
  while (byteLength % 4) {
    bufferParts.push(Buffer.alloc(1));
    byteLength += 1;
  }
  bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length, target });
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
  const idx = new Uint16Array(geom.indices);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], pos[i + k]);
      max[k] = Math.max(max[k], pos[i + k]);
    }
  }
  const vPos = pushView(Buffer.from(pos.buffer), 34962);
  const vNor = pushView(Buffer.from(nor.buffer), 34962);
  const vIdx = pushView(Buffer.from(idx.buffer), 34963);
  return {
    attributes: {
      POSITION: accessor(vPos, 5126, pos.length / 3, 'VEC3', { min, max }),
      NORMAL: accessor(vNor, 5126, nor.length / 3, 'VEC3', {}),
    },
    indices: accessor(vIdx, 5123, idx.length, 'SCALAR', {}),
    material,
    mode: 4,
  };
});

const bin = Buffer.concat(bufferParts);
const json = {
  asset: { version: '2.0', generator: 'SatLoc make-satellite-model' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'EROS-C3' }],
  meshes: [{ name: 'EROS-C3', primitives: meshPrimitives }],
  materials,
  buffers: [{ byteLength: bin.length }],
  bufferViews,
  accessors,
};
let jsonBuf = Buffer.from(JSON.stringify(json));
while (jsonBuf.length % 4) jsonBuf = Buffer.concat([jsonBuf, Buffer.from(' ')]);
let binBuf = bin;
while (binBuf.length % 4) binBuf = Buffer.concat([binBuf, Buffer.alloc(1)]);

const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); // 'glTF'
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonBuf.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(binBuf.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4); // 'BIN'

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([header, jsonHeader, jsonBuf, binHeader, binBuf]));
console.log(`[make-satellite-model] wrote ${out} (${meshPrimitives.length} primitives, ${header.readUInt32LE(8)} bytes)`);
