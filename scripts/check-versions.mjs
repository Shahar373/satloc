// The version lives in three files (package.json feeds the UI, tauri.conf.json the updater and the
// release tag, Cargo.toml the binary). CI fails when they disagree.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const conf = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8')).version;
const cargo = /^version\s*=\s*"([^"]+)"/m.exec(readFileSync(join(root, 'src-tauri', 'Cargo.toml'), 'utf8'))?.[1];

const versions = { 'package.json': pkg, 'src-tauri/tauri.conf.json': conf, 'src-tauri/Cargo.toml': cargo };
const distinct = new Set(Object.values(versions));
if (distinct.size !== 1) {
  console.error('[check-versions] versions disagree:', versions);
  process.exit(1);
}
console.log(`[check-versions] ${pkg} in all three files`);
