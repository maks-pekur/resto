import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WITHOUT_TENANT_ALLOWLIST } from '../../src/withoutTenant.allowlist';

const ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');

const WALK_ROOTS = ['apps/api/src', 'packages/db/src', 'packages/events/src'] as const;

const SKIP_DIRS = new Set(['node_modules', 'dist', '.nx', 'coverage', 'generated']);

const ALLOWLIST_SOURCE = 'packages/db/src/withoutTenant.allowlist.ts';

const CALL_RE = /\.withoutTenant\s*\(/;

const isSkippedFile = (relPath: string): boolean => {
  if (relPath === ALLOWLIST_SOURCE) return true;
  if (relPath.endsWith('.spec.ts') || relPath.endsWith('.test.ts')) return true;
  if (relPath.split('/').includes('test')) return true;
  if (!relPath.endsWith('.ts')) return true;
  if (relPath.endsWith('.d.ts')) return true;
  return false;
};

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const walkTsFiles = (absDir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const abs = join(absDir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...walkTsFiles(abs));
    } else if (entry.isFile()) {
      out.push(abs);
    }
  }
  return out;
};

const collectCallSites = (): string[] => {
  const callers = new Set<string>();
  for (const walkRoot of WALK_ROOTS) {
    const absRoot = resolve(ROOT, walkRoot);
    for (const absFile of walkTsFiles(absRoot)) {
      const relPath = relative(ROOT, absFile).split(sep).join('/');
      if (isSkippedFile(relPath)) continue;
      const code = stripComments(readFileSync(absFile, 'utf-8'));
      if (CALL_RE.test(code)) callers.add(relPath);
    }
  }
  return [...callers].sort();
};

describe('AUDIT #16: withoutTenant call-site enforcement', () => {
  it('the set of real `.withoutTenant(` callers EQUALS the allowlist (strict bidirectional)', () => {
    const callers = collectCallSites();
    const allowlist = [...WITHOUT_TENANT_ALLOWLIST].sort();

    const callerSet = new Set(callers);
    const allowlistSet = new Set<string>(WITHOUT_TENANT_ALLOWLIST);

    const unaccounted = callers.filter((c) => !allowlistSet.has(c));
    const stale = allowlist.filter((a) => !callerSet.has(a));

    expect(
      { unaccounted, stale },
      `withoutTenant call-sites and WITHOUT_TENANT_ALLOWLIST (packages/db/src/withoutTenant.allowlist.ts) ` +
        `must be set-equal.\n` +
        `Unaccounted callers (call exists, NOT on allowlist — add + justify, or remove the call):\n` +
        (unaccounted.length ? unaccounted.map((c) => `  - ${c}`).join('\n') : '  (none)') +
        `\nStale grants (on allowlist, NO real .withoutTenant( call — drop the entry + its ESLint override):\n` +
        (stale.length ? stale.map((c) => `  - ${c}`).join('\n') : '  (none)'),
    ).toEqual({ unaccounted: [], stale: [] });

    expect(callers).toEqual(allowlist);
  });

  it('allowlist has no entry whose file is missing from disk', () => {
    const allowlist = [...WITHOUT_TENANT_ALLOWLIST];
    const missing = allowlist.filter((rel) => {
      try {
        readFileSync(resolve(ROOT, rel), 'utf-8');
        return false;
      } catch {
        return true;
      }
    });
    expect(missing, `Allowlisted file(s) not found on disk:\n${missing.join('\n')}`).toEqual([]);
  });
});
