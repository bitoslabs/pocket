import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const root = process.cwd();
const required = ['index.html', 'manifest.json', 'service-worker.js', 'assets', 'css', 'js'];
const missing = required.filter((path) => !existsSync(join(root, path)));

function walk(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path, files);
    else files.push(path);
  }
  return files;
}

const files = missing.length ? [] : ['index.html', 'manifest.json', 'service-worker.js', ...walk(join(root, 'assets')), ...walk(join(root, 'css')), ...walk(join(root, 'js'))];
const bytes = files.reduce((total, file) => total + statSync(file.startsWith(root) ? file : join(root, file)).size, 0);
const gzipBytes = gzipSync(Buffer.concat(files.map((file) => readFileSync(file.startsWith(root) ? file : join(root, file))))).length;
const problems = missing.map((path) => `required deploy path is missing: ${path}`);

export function checkBuild() {
  return { files, bytes, gzipBytes, problems };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (problems.length) {
    for (const problem of problems) console.error(`  ✗ ${problem}`);
    process.exitCode = 1;
  } else {
    console.log(`Build check OK — ${files.length} files · ${(bytes / 1024).toFixed(0)} KiB`);
  }
}