'use strict';

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * The module graph, read rather than assumed.
 *
 * Development uses native ES modules and production uses Vite. Check the source
 * graph before bundling so missing imports are reported with their module paths.
 * This is shared by the deploy check and tests/imports.test.mjs.
 */

/** Files that hang off the graph by design (see tests/imports.test.mjs). */
export const DEV_TOOLS = Object.freeze([]);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]
  ));
}

/**
 * Every specifier a module asks for, in every form the language allows: a
 * side-effect import (`import './story-chapter1.js'`), a named import or re-export,
 * and a dynamic import. The story chapters are wired with the side-effect form.
 */
export function specifiersOf(file) {
  const text = readFileSync(file, 'utf8');
  const sideEffect = [...text.matchAll(/(?:^|\n)[ \t]*import\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
  const named = [...text.matchAll(/(?:^|\n)[ \t]*(?:import|export)\s+[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
  const dynamic = [...text.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((match) => match[1]);
  return [...sideEffect, ...named, ...dynamic];
}

/** Read the whole tree: what it imports, what resolves, what is left unwired. */
export function scanTree(root) {
  const jsFiles = walk(join(root, 'js')).filter((file) => file.endsWith('.js'));
  const cssFiles = walk(join(root, 'css')).filter((file) => file.endsWith('.css'));

  const problems = [];
  let edges = 0;
  for (const file of jsFiles) {
    for (const specifier of specifiersOf(file)) {
      edges += 1;
      const where = relative(root, file);
      if (!specifier.startsWith('.')) {
        problems.push(`${where} imports '${specifier}', which no browser can resolve without a bundler`);
        continue;
      }
      if (!existsSync(resolve(dirname(file), specifier))) {
        problems.push(`${where} imports '${specifier}', which does not exist`);
      }
    }
  }

  const cssProblems = [];
  for (const file of cssFiles) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue; // a font CDN is a choice, not a bug
      if (!existsSync(resolve(dirname(file), specifier))) {
        cssProblems.push(`${relative(root, file)} imports '${specifier}', which does not exist`);
      }
    }
  }

  const entry = join(root, 'js', 'app.js');
  const reachable = new Set();
  const queue = [entry, ...DEV_TOOLS.map((path) => join(root, path))];
  while (queue.length) {
    const file = queue.pop();
    if (reachable.has(file)) continue;
    reachable.add(file);
    for (const specifier of specifiersOf(file)) {
      if (!specifier.startsWith('.')) continue;
      const target = resolve(dirname(file), specifier);
      if (!reachable.has(target)) queue.push(target);
    }
  }
  const orphans = jsFiles.filter((file) => !reachable.has(file)).map((file) => relative(root, file));

  const html = existsSync(join(root, 'index.html')) ? readFileSync(join(root, 'index.html'), 'utf8') : '';
  const locals = [];
  const externals = [];
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const url = match[1];
    if (/^(https?:)?\/\//.test(url) || /^(data:|#|mailto:)/.test(url)) { externals.push(url); continue; }
    locals.push(url.replace(/^\.\//, ''));
  }
  const missingLocals = locals.filter((path) =>
    !existsSync(join(root, path))
  );

  return {
    jsFiles, cssFiles, edges, problems, cssProblems, orphans, reachable, entry, locals, externals, missingLocals,
  };
}

/** Production upload is the validated static site root. */
export function uploadList(root) {
  return existsSync(join(root, 'index.html')) ? ['index.html', 'manifest.json', 'service-worker.js', 'assets/', 'css/', 'js/'] : [];
}

/** How many bytes those directories weigh, for the deploy notes. */
export function payloadBytes(root, entries = ['index.html', 'src']) {
  let total = 0;
  for (const entry of entries) {
    const path = join(root, entry);
    if (!existsSync(path)) continue;
    if (statSync(path).isDirectory()) {
      for (const file of walk(path)) total += statSync(file).size;
    } else {
      total += statSync(path).size;
    }
  }
  return total;
}
