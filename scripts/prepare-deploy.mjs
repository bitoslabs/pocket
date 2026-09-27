import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const root = new URL('../', import.meta.url);
const destination = process.argv[2];
if (!destination) throw new Error('Usage: node scripts/prepare-deploy.mjs OUTPUT_DIR');

const paths = ['index.html', 'manifest.json', 'service-worker.js', 'assets', 'css', 'js'];
mkdirSync(destination, { recursive: true });
for (const path of paths) {
  cpSync(new URL(path, root), join(destination, path), {
    recursive: true,
    filter: (source) => basename(source) !== '.DS_Store',
  });
}

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

const hash = createHash('sha256');
for (const file of files(destination).sort()) {
  hash.update(relative(destination, file));
  hash.update('\0');
  hash.update(readFileSync(file));
}
const release = hash.digest('hex').slice(0, 16);
const workerPath = join(destination, 'service-worker.js');
const worker = readFileSync(workerPath, 'utf8');
if (!worker.includes('zap-journal-__DEPLOY_HASH__')) {
  throw new Error('Service worker deploy hash placeholder is missing');
}
const indexPath = join(destination, 'index.html');
const index = readFileSync(indexPath, 'utf8');
if (!index.includes('service-worker.__DEPLOY_HASH__.js')) {
  throw new Error('Service worker filename placeholder is missing from index.html');
}

writeFileSync(workerPath, worker.replaceAll('__DEPLOY_HASH__', release));
renameSync(workerPath, join(destination, `service-worker.${release}.js`));
writeFileSync(indexPath, index.replace('__DEPLOY_HASH__', release));
console.log(`Prepared release ${release}`);
