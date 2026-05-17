import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const GENERATED_PATH = resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'api-client',
  'src',
  'generated',
  'api.ts',
);

describe('I-7 — generated api-client has no `unknown` in DTO fields', () => {
  it('emits typed primitives for all request DTO fields', () => {
    const source = readFileSync(GENERATED_PATH, 'utf8');
    // `  fieldName: unknown;` or `  fieldName?: unknown;` at the
    // start of an indented line. Excludes `[name: string]: unknown`
    // (response headers — NestJS default, not in ADR-0020 I-7 scope).
    const offenders = source
      .split('\n')
      .filter((line) => /^\s+[a-zA-Z_$][\w$]*\??: unknown;/.test(line));
    expect(
      offenders,
      `I-7 violation: ${offenders.length} DTO field(s) typed as 'unknown' — ` +
        `fix upstream via a non-branded Zod sibling (ADR-0020 I-7,` +
        ` packages/domain/CLAUDE.md):\n` +
        offenders.map((l) => '  ' + l.trim()).join('\n'),
    ).toHaveLength(0);
  });
});
