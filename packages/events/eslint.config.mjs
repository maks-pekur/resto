import { node } from '@resto/config-eslint/node';

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
      ],
    },
  },
  {
    // RES-252: system-context callers in packages/events — inbox dedup
    // wrapper and outbox dispatcher perform cross-tenant operations that
    // cannot bind an ALS tenant.
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
