import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir: string, results: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, results);
    } else if (/\.tsx?$/.test(entry.name)) {
      results.push(full);
    }
  }
}

function filesContainingHeader(): string[] {
  const files: string[] = [];
  for (const sub of ['lib', 'components', 'app']) {
    const dir = join(websiteRoot, sub);
    if (statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
      walk(dir, files);
    }
  }
  return files
    .filter((file) => /x-forwarded-host/i.test(readFileSync(file, 'utf8')))
    .map((file) => relative(websiteRoot, file).split('\\').join('/'))
    .sort();
}

describe('no-client-tenant-header', () => {
  it('only the server-only module sends x-forwarded-host', () => {
    expect(filesContainingHeader()).toEqual(['lib/api-client.ts']);
  });

  it('the allowed module is server-only', () => {
    const content = readFileSync(join(websiteRoot, 'lib/api-client.ts'), 'utf8');
    expect(content).toContain("import 'server-only'");
  });
});
