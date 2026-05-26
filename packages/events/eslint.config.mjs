import { node } from '@resto/config-eslint/node';
import { FORBIDDEN_CORRELATION_ID_LITERALS } from '@resto/config-eslint/base';

export default [
  ...node,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // RES-252 I-1: withoutTenant bypasses tenant filter + RLS. Callers in
    // packages/events must be in the allowlist
    // (packages/db/src/withoutTenant.allowlist.ts).
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='withoutTenant']",
          message:
            "RES-252 I-1: `withoutTenant` bypasses tenant filter + RLS. Allowed only in packages/events' allowlist (packages/db/src/withoutTenant.allowlist.ts: src/inbox/run-deduped.ts). Add the file path there + update this config's allow-block, or use db.withTenant / db.withTenantId.",
        },
        ...FORBIDDEN_CORRELATION_ID_LITERALS,
      ],
      // TEN-12 / D-09 parity: ban importing `runInTenantContext` from
      // `@resto/db` inside packages/events. Mirrors the same rule in
      // apps/api/eslint.config.mjs and packages/db/eslint.config.mjs.
      // Background-context paths (inbox, outbox dispatcher, NATS handlers)
      // must use db.withTenant / db.withoutTenant per ADR-0020 I-6.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@resto/db',
              importNames: ['runInTenantContext'],
              message:
                'ADR-0020 I-6: runInTenantContext is HTTP-middleware-only. Use db.withTenant / db.withTenantId / db.withoutTenant instead.',
            },
          ],
        },
      ],
    },
  },
  {
    // @withoutTenant-allowlist — RES-252: system-context callers in
    // packages/events. Mirrors packages/db/src/withoutTenant.allowlist.ts.
    files: ['src/inbox/run-deduped.ts', 'src/outbox/dispatcher.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    // Tests deliberately exercise tenant-aware paths and may call
    // withoutTenant to seed system-context fixtures.
    files: ['test/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    ignores: ['dist/**', 'dist-spec/**', 'eslint.config.mjs'],
  },
];
