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
    files: ['src/**/*.ts'],
    rules: {
      // NestJS controllers and providers rely on parameter decorators —
      // injected dependencies appear "unused" to the type-only checker.
      '@typescript-eslint/parameter-properties': 'off',
    },
  },
  {
    // ADR-0020 I-6: `runInTenantContext` binds tenant in AsyncLocalStorage
    // and is HTTP-middleware-only. Non-HTTP code paths (BA hooks, NATS
    // subscribers, outbox dispatcher, CLI, background jobs) must use
    // `db.withTenant` (ALS-bound) or `db.withTenantId(id, op)` (explicit)
    // or `db.withoutTenant(reason, op)` (system) — see
    // packages/db/src/client.ts.
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@resto/db',
              importNames: ['runInTenantContext'],
              message:
                'ADR-0020 I-6: runInTenantContext is HTTP-middleware-only. Use db.withTenant / db.withTenantId / db.withoutTenant instead. Sole legitimate caller: apps/api/src/shared/tenant-context.middleware.ts.',
            },
          ],
        },
      ],
    },
  },
  {
    // Sole legitimate caller of runInTenantContext per ADR-0020 I-6.
    files: ['src/shared/tenant-context.middleware.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // NestJS modules are class-based markers for the DI container; an
    // empty class is the idiomatic shape and not a code smell here.
    files: ['src/**/*.module.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
  {
    // Bootstrap entrypoints terminate on fatal errors via process.exit —
    // the surrounding script tooling expects non-zero exit codes.
    files: ['src/main.ts', 'src/openapi.ts'],
    rules: {
      'no-process-exit': 'off',
    },
  },
  {
    // Test files lean on Vitest's `vi.fn()` mocks and lambda-style
    // assertion expressions; the type-aware checks fight with idiomatic
    // test code where mock return types are intentionally untyped (the
    // test asserts the shape rather than declares it).
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      // Test files simulate HTTP middleware behavior to exercise
      // tenant-aware paths — they may legitimately call runInTenantContext.
      'no-restricted-imports': 'off',
    },
  },
  {
    ignores: ['dist/**', 'dist-spec/**', 'eslint.config.mjs', 'vitest.config.ts', 'build.mjs'],
  },
];
