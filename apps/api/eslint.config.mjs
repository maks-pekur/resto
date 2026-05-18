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
    // ADR-0020 I-1: bypass-ScopedTx-by-default. Direct `tx.select/insert/
    // update/delete` is permitted only in repository adapters (where the
    // adapter takes responsibility for the tenant filter) and the audit
    // consumer (system context via `withoutTenant`; auditLog table is not
    // tenant-scoped). Everywhere else, route through ScopedTx.
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='tx'][callee.property.name=/^(select|insert|update|delete)$/]",
          message:
            'ADR-0020 I-1: direct tx.select/insert/update/delete bypasses ScopedTx auto-filter. Use scoped.selectFrom / insertInto / updateTable, or place this code in a *-drizzle.repository.ts where the rule is allow-listed (the adapter takes responsibility for the tenant filter).',
        },
        {
          selector: 'Literal[value=/^app\\.(current_tenant|is_system)$/]',
          message:
            'RES-243: literal string `app.current_tenant` / `app.is_system` is reserved for packages/db internals. Use db.withTenant / withTenantId / withoutTenant.',
        },
        {
          selector: 'TemplateElement[value.raw=/\\bset_config\\b/]',
          message:
            'RES-243: `set_config` is reserved for packages/db/src/client.ts. Use db.withTenant / withTenantId / withoutTenant.',
        },
        {
          selector: "Identifier[name='set_config']",
          message:
            'RES-243: `set_config` is reserved for packages/db/src/client.ts. Use db.withTenant / withTenantId / withoutTenant.',
        },
      ],
    },
  },
  {
    // Sole legitimate callers of raw tx.* in api production code per
    // ADR-0020 I-1. The brand repo still uses raw tx.* pending migration
    // (future RES-235d); the catalog repo retains a single manual brands
    // projection query that carries an explicit `eq(brands.tenantId, ...)`.
    // record-audit.service.ts writes to the platform-wide auditLog table
    // (no tenant_id column) inside withoutTenant.
    files: [
      'src/contexts/**/infrastructure/*-drizzle.repository.ts',
      'src/contexts/**/infrastructure/*-drizzle.reader.ts',
      'src/contexts/audit/application/record-audit.service.ts',
    ],
    rules: {
      'no-restricted-syntax': 'off',
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
      // tenant-aware paths — they may legitimately call runInTenantContext
      // and seed via raw tx.* inside withoutTenant.
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  {
    ignores: ['dist/**', 'dist-spec/**', 'eslint.config.mjs', 'vitest.config.ts', 'build.mjs'],
  },
];
