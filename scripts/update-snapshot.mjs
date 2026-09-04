// Refreshes src/data/isi-snapshot.json with the latest element sets for the ISI preset.
// Runs on the developer machine or in the update-snapshot GitHub workflow (the remote dev sandbox
// cannot reach any orbital-data host).
//
// Sources, in order: CelesTrak GP by catalogue number, CelesTrak GP by name, then the TLE API
// mirror (tle.ivanstanojevic.me) as a last resort. OMM records go to `records`, TLE lines to `tles`.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const presetPath = join(root, 'src', 'data', 'isi.json');
const snapshotPath = join(root, 'src', 'data', 'isi-snapshot.json');

const USER_AGENT = 'Mozilla/5.0 (compatible; SatLoc/0.1; +https://github.com/Shahar373/satloc)';
const CELESTRAK = 'https://celestrak.org/NORAD/elements/gp.php';
const TLE_API = 'https://tle.ivanstanojevic.me/api/tle';

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json, text/plain' } });
  const text = (await res.text()).trim();
  console.log(`[update-snapshot] GET ${url} -> ${res.status}${res.ok ? '' : ` ${text.slice(0, 200).replace(/\s+/g, ' ')}`}`);
  return { ok: res.ok, status: res.status, text };
}

function parseGp(text) {
  if (!text.startsWith('[')) return [];
  const data = JSON.parse(text);
  return Array.isArray(data) ? data : [];
}

async function fromCelestrakCatnr(sat) {
  const { ok, text } = await get(`${CELESTRAK}?CATNR=${sat.noradId}&FORMAT=json`);
  return ok ? parseGp(text).find((r) => r.NORAD_CAT_ID === sat.noradId) : undefined;
}

async function fromCelestrakName(sat) {
  const { ok, text } = await get(`${CELESTRAK}?NAME=${encodeURIComponent(sat.name.replace('-', ' '))}&FORMAT=json`);
  return ok ? parseGp(text).find((r) => r.NORAD_CAT_ID === sat.noradId) : undefined;
}

async function fromTleApi(sat) {
  const { ok, text } = await get(`${TLE_API}/${sat.noradId}`);
  if (!ok) return undefined;
  const data = JSON.parse(text);
  if (typeof data.line1 !== 'string' || typeof data.line2 !== 'string') return undefined;
  return { noradId: sat.noradId, name: data.name ?? sat.name, line1: data.line1, line2: data.line2 };
}

const preset = JSON.parse(readFileSync(presetPath, 'utf8'));
const records = [];
const tles = [];

for (const sat of preset.satellites) {
  let omm;
  try {
    omm = (await fromCelestrakCatnr(sat)) ?? (await fromCelestrakName(sat));
  } catch (err) {
    console.warn(`[update-snapshot] ${sat.name}: CelesTrak failed: ${err.message}`);
  }
  if (omm) {
    records.push(omm);
    console.log(`[update-snapshot] ${sat.name}: OMM epoch ${omm.EPOCH}`);
    continue;
  }
  try {
    const tle = await fromTleApi(sat);
    if (tle) {
      tles.push(tle);
      console.log(`[update-snapshot] ${sat.name}: TLE from mirror`);
      continue;
    }
  } catch (err) {
    console.warn(`[update-snapshot] ${sat.name}: TLE mirror failed: ${err.message}`);
  }
  console.warn(`[update-snapshot] ${sat.name}: no element set from any source`);
}

if (records.length + tles.length === 0) {
  throw new Error('No element sets fetched from any source; snapshot left unchanged');
}

const previous = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const unchanged =
  JSON.stringify(previous.records ?? []) === JSON.stringify(records) &&
  JSON.stringify(previous.tles ?? []) === JSON.stringify(tles);
if (unchanged) {
  console.log('[update-snapshot] element sets unchanged');
  process.exit(0);
}

writeFileSync(
  snapshotPath,
  JSON.stringify({ fetchedAt: new Date().toISOString(), records, tles }, null, 2) + '\n',
);
console.log(`[update-snapshot] wrote ${records.length} OMM + ${tles.length} TLE records to ${snapshotPath}`);
