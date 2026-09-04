// Copies the CesiumJS runtime assets (workers, widgets, textures) into public/cesium
// so Vite serves them in dev and bundles them into dist/ for Tauri.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cesiumPkg = join(root, 'node_modules', 'cesium');
const source = join(cesiumPkg, 'Build', 'Cesium');
const target = join(root, 'public', 'cesium');

if (!existsSync(source)) {
  console.warn('[copy-cesium] cesium package not found, skipping');
  process.exit(0);
}

const version = JSON.parse(readFileSync(join(cesiumPkg, 'package.json'), 'utf8')).version;
const marker = join(target, '.version');
if (existsSync(marker) && readFileSync(marker, 'utf8').trim() === version) {
  console.log(`[copy-cesium] public/cesium already at ${version}`);
  process.exit(0);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const dir of ['Assets', 'ThirdParty', 'Widgets', 'Workers']) {
  cpSync(join(source, dir), join(target, dir), { recursive: true });
}
writeFileSync(marker, version + '\n');
console.log(`[copy-cesium] copied Cesium ${version} assets to public/cesium`);
