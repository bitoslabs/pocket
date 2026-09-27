'use strict';

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanTree } from './graph.mjs';
import { checkBuild } from '../scripts/check-build.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WANT_LIST = process.argv.includes('--list');
const tree = scanTree(ROOT);
const build = checkBuild();
const problems = [...tree.problems, ...tree.cssProblems, ...tree.missingLocals, ...build.problems];

const configPath = fileURLToPath(new URL('./pocket.bitos.space.conf', import.meta.url));
const notesPath = fileURLToPath(new URL('./site.md', import.meta.url));
let configRoot = null;
let notesRoot = null;
if (existsSync(configPath)) {
  const match = readFileSync(configPath, 'utf8').match(/^\s*root\s+([^;]+);/m);
  configRoot = match ? match[1].trim() : null;
}
if (existsSync(notesPath)) {
  const match = readFileSync(notesPath, 'utf8').match(/^(\/[^\s`]*)\/?\s*$/m);
  notesRoot = match ? match[1].replace(/\/$/, '') : null;
}
if (configRoot && notesRoot && configRoot !== notesRoot) {
  problems.push(`nginx serves ${configRoot}, while the notes say ${notesRoot}`);
}

if (WANT_LIST) {
  console.log('index.html manifest.json service-worker.js assets/ css/ js/');
} else {
  console.log('deploy check — pocket.bitos.space');
  console.log(`  source   ${tree.jsFiles.length} JS · ${tree.edges} imports`);
  console.log(`  output   ${build.files.length} files · ${(build.bytes / 1024).toFixed(0)} KiB raw · ${(build.gzipBytes / 1024).toFixed(0)} KiB gzip`);
  console.log('  upload   index.html manifest.json service-worker.js assets/ css/ js/');
  console.log(`  server   ${configRoot || '(missing nginx root)'}`);
}
if (problems.length) {
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exitCode = 1;
} else if (!WANT_LIST) console.log('deploy check OK');
