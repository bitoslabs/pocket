/**
 * Static integrity checks (no dependencies):
 *   1. every service-worker precache entry exists on disk;
 *   2. every js/css file is actually precached for offline use;
 *   3. every relative import resolves to an existing file.
 *
 * Run with `npm run check` (also part of `npm test`).
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';

const root = process.cwd();
const errors = [];

const posix = (p) => p.split('\\').join('/');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// ---- 1. precache entries exist + 2. all js/css is precached ----------------

const sw = readFileSync(join(root, 'service-worker.js'), 'utf8');
const block = sw.match(/const STATIC_ASSETS = \[([\s\S]*?)\];/);
if (!block) {
  console.error('Could not find STATIC_ASSETS in service-worker.js');
  process.exit(1);
}
const precache = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
const precacheSet = new Set(precache);

for (const entry of precache) {
  if (entry === './') continue;
  if (!existsSync(join(root, entry))) errors.push(`precache entry missing on disk: ${entry}`);
}

for (const dir of ['js', 'css']) {
  const dirPath = join(root, dir);
  if (!existsSync(dirPath)) continue;
  for (const file of walk(dirPath)) {
    const rel = posix(relative(root, file));
    if (!precacheSet.has(rel)) errors.push(`not precached for offline use: ${rel}`);
  }
}

// ---- 3. relative imports resolve ------------------------------------------

const jsFiles = walk(join(root, 'js')).filter((f) => f.endsWith('.js'));
const importRe = /(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g;

for (const file of jsFiles) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(importRe)) {
    const target = resolve(dirname(file), m[1]);
    if (!existsSync(target)) {
      errors.push(`unresolved import in ${posix(relative(root, file))}: ${m[1]}`);
    }
  }
}

if (errors.length) {
  console.error(`Integrity check failed (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `Integrity OK — ${precache.length} precache entries, ${jsFiles.length} modules, all imports resolve.`
);
