import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { base } from '../base.mjs';

const FIXTURES = resolve(import.meta.dirname, 'fixtures');

// Extract the `no-restricted-syntax` rule entries that the base config defines.
// We then build a minimal flat config that exercises ONLY this rule against
// the fixture files, avoiding the cost of running tsconfig-aware type-checked
// rules and Nx module-boundary lookups for a small TEN-15 assertion suite.
//
// `base` is a flat-config array assembled by `tseslint.config(...)`; multiple
// blocks may define `no-restricted-syntax`. Take the LAST one (later blocks
// override earlier blocks in flat-config semantics) so the test reflects what
// ESLint actually executes against consumer source files.
const extractNoRestrictedSyntax = (): Linter.RuleEntry => {
  let found: Linter.RuleEntry | undefined;
  for (const block of base as Linter.Config[]) {
    const rule = block.rules?.['no-restricted-syntax'];
    if (rule !== undefined) found = rule;
  }
  if (found === undefined) {
    throw new Error('TEN-15 fixture suite: no-restricted-syntax rule missing from base config');
  }
  return found;
};

const buildTestConfig = (): Linter.Config[] => [
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      'no-restricted-syntax': extractNoRestrictedSyntax(),
    },
  },
];

const PACKAGE_ROOT = resolve(import.meta.dirname, '..');

const newEslint = (): ESLint =>
  new ESLint({
    cwd: PACKAGE_ROOT,
    overrideConfigFile: true,
    overrideConfig: buildTestConfig(),
  });

const lintFile = async (file: string) => {
  const eslint = newEslint();
  const filePath = resolve(FIXTURES, file);
  const code = readFileSync(filePath, 'utf-8');
  const [result] = await eslint.lintText(code, { filePath });
  if (!result) throw new Error(`no result for ${file}`);
  return result;
};

describe('TEN-15: no-restricted-syntax rejects direct correlationId construction', () => {
  it('flags `correlationId: randomUUID()` with the TEN-15 message', async () => {
    const result = await lintFile('forbidden-random-uuid.ts');
    const offending = result.messages.filter((m) => m.ruleId === 'no-restricted-syntax');
    expect(offending).toHaveLength(1);
    expect(offending[0]?.message).toMatch(/TEN-15/);
    expect(offending[0]?.message).toMatch(/buildEnvelope/);
  });

  it('flags `correlationId: crypto.randomUUID()` with the TEN-15 message', async () => {
    const result = await lintFile('forbidden-crypto-random-uuid.ts');
    const offending = result.messages.filter((m) => m.ruleId === 'no-restricted-syntax');
    expect(offending).toHaveLength(1);
    expect(offending[0]?.message).toMatch(/TEN-15/);
    expect(offending[0]?.message).toMatch(/crypto/);
  });

  it('does NOT flag `correlationId: someVariable` (legal indirection)', async () => {
    const result = await lintFile('legal-build-envelope.ts');
    const offending = result.messages.filter((m) => m.ruleId === 'no-restricted-syntax');
    expect(offending).toHaveLength(0);
  });

  it('does NOT flag `randomUUID()` under a non-correlationId key', async () => {
    const result = await lintFile('legal-other-key.ts');
    const offending = result.messages.filter((m) => m.ruleId === 'no-restricted-syntax');
    expect(offending).toHaveLength(0);
  });
});
