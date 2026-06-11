import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WITHOUT_TENANT_ALLOWLIST } from '../../src/withoutTenant.allowlist';

const ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');

interface ConfigSource {
  readonly relPath: string;
  readonly packagePrefix: string;
}

const CONFIGS: readonly ConfigSource[] = [
  { relPath: 'apps/api/eslint.config.mjs', packagePrefix: 'apps/api/' },
  { relPath: 'packages/db/eslint.config.mjs', packagePrefix: 'packages/db/' },
  { relPath: 'packages/events/eslint.config.mjs', packagePrefix: 'packages/events/' },
];

/**
 * Matches override blocks tagged with `@withoutTenant-allowlist` that
 * disable `no-restricted-syntax`. Only these blocks are considered part of
 * the withoutTenant allowlist — other `no-restricted-syntax: 'off'` blocks
 * (e.g. for `set_config` callers) are intentionally excluded.
 *
 * Pattern: `@withoutTenant-allowlist` comment ... `files: [...]` ...
 * `'no-restricted-syntax': 'off'`
 */
const ALLOWLIST_BLOCK_RE =
  /@withoutTenant-allowlist[\s\S]*?files:\s*\[([^\]]*?)\][\s\S]*?'no-restricted-syntax':\s*'off'/gm;
const STRING_LITERAL_RE = /['"]([^'"]+)['"]/g;

const extractAllowlistedFiles = (configText: string, packagePrefix: string): string[] => {
  const out: string[] = [];
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = ALLOWLIST_BLOCK_RE.exec(configText)) !== null) {
    const arrayBody = blockMatch[1] ?? '';
    let strMatch: RegExpExecArray | null;
    while ((strMatch = STRING_LITERAL_RE.exec(arrayBody)) !== null) {
      const path = strMatch[1] ?? '';
      if (path.startsWith('src/') && !path.startsWith('test/') && !path.includes('**')) {
        out.push(`${packagePrefix}${path}`);
      }
    }
  }
  return out;
};

describe('RES-252 Phase 2b: withoutTenant allowlist parity', () => {
  it('TS const matches the union of @withoutTenant-allowlist override-block `files:` literals across all three ESLint configs', () => {
    const fromConfigs = CONFIGS.flatMap((c) =>
      extractAllowlistedFiles(readFileSync(resolve(ROOT, c.relPath), 'utf-8'), c.packagePrefix),
    );

    const tsConst = [...WITHOUT_TENANT_ALLOWLIST].sort();
    const extracted = [...new Set(fromConfigs)].sort();

    expect(extracted).toEqual(tsConst);
  });

  it('TS const contains exactly eleven entries (sanity check on scope creep)', () => {
    // Phase 3 / AUTH-10 (Plan 03-01) adds
    // packages/events/src/infrastructure/nats-subscriber.ts — DLQ branch.
    // Phase 3 / AUTH-01 (Plan 03-02) adds
    // apps/api/src/contexts/identity/infrastructure/email/resend.adapter.ts
    // — terminal-failure outbox emission for the BA pre-org-bind path.
    // Phase 4a / Plan 06 (CAT-10 / D-4a-07) adds the catalog Redis cache
    // adapter — `nextval('menu_versions_seq')` fallback on Redis outage.
    //
    // The two GDPR retention sweep schedulers (invitation + verification) are
    // NOT on the allowlist: they sweep BA-owned auth tables via resto_auth
    // (AuthDrizzle, which owns those tables), not resto_app's `withoutTenant`
    // (whose privileges on those tables are revoked — migration 0027).
    expect(WITHOUT_TENANT_ALLOWLIST).toHaveLength(11);
  });
});
