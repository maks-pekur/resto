#!/usr/bin/env node
// Regex-based census: cannot see decorators applied via a custom composite
// decorator, decorators inherited from a base class, or routes registered
// outside a `*.controller.ts` file (e.g. dynamically in a module).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..');
const CONTROLLERS_ROOT = path.join(REPO_ROOT, 'apps/api/src');
const BASELINE_PATH = path.join(SCRIPT_DIR, 'tenant-context-route-census.baseline.json');

const HTTP_VERBS = ['Get', 'Post', 'Put', 'Patch', 'Delete'];
const CLASS_DECLARATION_RE = /^\s*(?:export\s+)?class\s+([A-Za-z0-9_]+)/;
const SINGLE_LINE_DECORATOR_RE = /^@[A-Za-z][A-Za-z0-9]*\(.*\)$/;
const VERB_DECORATOR_RE = new RegExp(
  `^@(${HTTP_VERBS.join('|')})\\(\\s*(?:'([^']*)'|"([^"]*)")?\\s*\\)$`,
);
const CONTROLLER_DECORATOR_RE = /@Controller\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/;

function findControllerFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...findControllerFiles(full));
    } else if (entry.endsWith('.controller.ts')) {
      results.push(full);
    }
  }
  return results;
}

function normalizePath(segments) {
  const parts = segments
    .filter((s) => typeof s === 'string' && s.length > 0)
    .flatMap((s) => s.split('/').filter(Boolean));
  return '/' + parts.join('/');
}

function collectDecoratorBlockUpward(lines, fromIndex, lowerBoundExclusive) {
  const block = [];
  let i = fromIndex;
  while (i > lowerBoundExclusive && SINGLE_LINE_DECORATOR_RE.test(lines[i].trim())) {
    block.unshift(lines[i].trim());
    i -= 1;
  }
  return { block, start: i + 1 };
}

function collectDecoratorBlockDownward(lines, fromIndex, upperBoundExclusive) {
  const block = [];
  let i = fromIndex;
  while (i < upperBoundExclusive && SINGLE_LINE_DECORATOR_RE.test(lines[i].trim())) {
    block.push(lines[i].trim());
    i += 1;
  }
  return block;
}

function parseControllerFile(absPath, lines) {
  const classDeclLineIndices = [];
  lines.forEach((line, idx) => {
    if (CLASS_DECLARATION_RE.test(line)) classDeclLineIndices.push(idx);
  });

  const routes = [];

  classDeclLineIndices.forEach((declIdx, classPos) => {
    const prevClassDeclIdx = classPos > 0 ? classDeclLineIndices[classPos - 1] : -1;
    const { block: classDecoratorLines } = collectDecoratorBlockUpward(
      lines,
      declIdx - 1,
      prevClassDeclIdx,
    );
    const classDecoratorText = classDecoratorLines.join('\n');
    const controllerMatch = classDecoratorText.match(CONTROLLER_DECORATOR_RE);
    if (!controllerMatch) return; // not a @Controller class (e.g. a co-located DTO/class)

    const controllerPrefix = controllerMatch[1] ?? controllerMatch[2] ?? '';
    const classRequiresTenantContext = /@RequiresTenantContext\(/.test(classDecoratorText);
    const classPermissions = /@Permissions\(/.test(classDecoratorText);

    const nextClassBlockStart =
      classPos + 1 < classDeclLineIndices.length
        ? collectDecoratorBlockUpward(lines, classDeclLineIndices[classPos + 1] - 1, declIdx).start
        : lines.length;
    const bodyEnd = nextClassBlockStart - 1;

    for (let i = declIdx; i <= bodyEnd; i += 1) {
      const trimmed = lines[i].trim();
      const verbMatch = trimmed.match(VERB_DECORATOR_RE);
      if (!verbMatch) continue;

      const verb = verbMatch[1].toUpperCase();
      const methodPath = verbMatch[2] ?? verbMatch[3] ?? '';

      const { block: upBlock } = collectDecoratorBlockUpward(lines, i - 1, declIdx - 1);
      const downBlock = collectDecoratorBlockDownward(lines, i + 1, bodyEnd + 1);
      const methodDecoratorText = [...upBlock, trimmed, ...downBlock].join('\n');

      const requiresTenantContext =
        classRequiresTenantContext || /@RequiresTenantContext\(/.test(methodDecoratorText);
      const permissions = classPermissions || /@Permissions\(/.test(methodDecoratorText);

      routes.push({
        file: path.relative(REPO_ROOT, absPath).split(path.sep).join('/'),
        verb,
        path: normalizePath([controllerPrefix, methodPath]),
        requiresTenantContext,
        permissions,
      });
    }
  });

  return routes;
}

function collectCensus() {
  const files = findControllerFiles(CONTROLLERS_ROOT).sort();
  const allRoutes = files.flatMap((file) => {
    const content = readFileSync(file, 'utf8');
    return parseControllerFile(file, content.split('\n'));
  });

  return allRoutes
    .filter((r) => r.requiresTenantContext && !r.permissions)
    .map((r) => ({ file: r.file, verb: r.verb, path: r.path }))
    .sort(
      (a, b) =>
        a.file.localeCompare(b.file) ||
        a.verb.localeCompare(b.verb) ||
        a.path.localeCompare(b.path),
    );
}

function printMarkdownTable(rows) {
  if (rows.length === 0) {
    console.log('No routes carry `@RequiresTenantContext` without `@Permissions`.');
    return;
  }
  console.log('| File | Verb | Path |');
  console.log('|---|---|---|');
  for (const r of rows) {
    console.log(`| ${r.file} | ${r.verb} | ${r.path} |`);
  }
}

function keyOf(r) {
  return `${r.verb} ${r.path} (${r.file})`;
}

function runCheck(current) {
  let baselineRaw;
  try {
    baselineRaw = readFileSync(BASELINE_PATH, 'utf8');
  } catch {
    console.error(`Baseline not found at ${BASELINE_PATH}`);
    process.exit(1);
  }
  const baseline = JSON.parse(baselineRaw);

  const currentJson = JSON.stringify(current);
  const baselineJson = JSON.stringify(baseline);
  if (currentJson === baselineJson) {
    process.exit(0);
  }

  const baselineKeys = new Set(baseline.map(keyOf));
  const currentKeys = new Set(current.map(keyOf));

  const added = current.filter((r) => !baselineKeys.has(keyOf(r)));
  const removed = baseline.filter((r) => !currentKeys.has(keyOf(r)));

  console.error('Census drift detected against tenant-context-route-census.baseline.json:');
  for (const r of added) console.error(`  + ${keyOf(r)}`);
  for (const r of removed) console.error(`  - ${keyOf(r)}`);
  process.exit(1);
}

function main() {
  const args = process.argv.slice(2);
  const current = collectCensus();

  if (args.includes('--check')) {
    runCheck(current);
    return;
  }
  if (args.includes('--json')) {
    console.log(JSON.stringify(current, null, 2));
    return;
  }
  printMarkdownTable(current);
}

main();
