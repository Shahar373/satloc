// Prints the CHANGELOG.md section for a tag (vX.Y.Z), plus the install notes every release needs.
// The text becomes the GitHub release body and, through latest.json, the notes shown in the app.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tag = process.argv[2] ?? '';
const version = tag.replace(/^v/, '');
const lines = readFileSync(join(root, 'CHANGELOG.md'), 'utf8').split('\n');

const start = lines.findIndex((l) => l.trim() === `## ${version}`);
let body = `SatLoc ${version}.`;
if (start !== -1) {
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (end === -1) end = lines.length;
  body = lines.slice(start + 1, end).join('\n').trim() || body;
}

console.log(`${body}

Windows: run the .exe (NSIS) installer. The build is not code-signed yet, so SmartScreen may warn: choose "More info" and then "Run anyway". Installed copies update themselves from this release.`);
