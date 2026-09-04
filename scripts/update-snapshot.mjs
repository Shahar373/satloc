// Refreshes src/data/isi-snapshot.json with the latest CelesTrak element sets for the ISI preset.
// Runs on the developer machine or in the update-snapshot GitHub workflow (the remote dev sandbox
// cannot reach celestrak.org).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const presetPath = join(root, 'src', 'data', 'isi.json');
const snapshotPath = join(root, 'src', 'data', 'isi-snapshot.json');

const preset = JSON.parse(readFileSync(presetPath, 'utf8'));
const records = [];

for (const sat of preset.satellites) {
  const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${sat.noradId}&FORMAT=json`;
  const res = await fetch(url, { headers: { 'user-agent': 'SatLoc snapshot updater' } });
  if (!res.ok) throw new Error(`${sat.name}: HTTP ${res.status} from CelesTrak`);
  const text = (await res.text()).trim();
  if (!text.startsWith('[')) {
    console.warn(`[update-snapshot] ${sat.name} (${sat.noradId}): ${text.slice(0, 80)}`);
    continue;
  }
  const found = JSON.parse(text);
  if (!Array.isArray(found) || found.length === 0) {
    console.warn(`[update-snapshot] ${sat.name}: no records`);
    continue;
  }
  records.push(found[0]);
  console.log(`[update-snapshot] ${sat.name}: epoch ${found[0].EPOCH}`);
}

if (records.length === 0) throw new Error('No element sets fetched; snapshot left unchanged');

const previous = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const unchanged =
  JSON.stringify(previous.records) === JSON.stringify(records);
if (unchanged) {
  console.log('[update-snapshot] element sets unchanged');
  process.exit(0);
}

writeFileSync(
  snapshotPath,
  JSON.stringify({ fetchedAt: new Date().toISOString(), records }, null, 2) + '\n',
);
console.log(`[update-snapshot] wrote ${records.length} records to ${snapshotPath}`);
