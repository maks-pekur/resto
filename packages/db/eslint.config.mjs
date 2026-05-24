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
    files: ['src/cli/**/*.ts'],
    rules: {
      'no-process-exit': 'off',
    },
  },
  {
    // RES-243: `app.current_tenant` / `app.is_system` literals and the
    // `set_config` identifier belong only inside `client.ts` and
    // `preflight.ts`. Anywhere else is a forge primitive or contract
    // violation.
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^app\\.(current_tenant|is_system)$/]',
          message:
            'RES-243: literal `app.current_tenant` / `app.is_system` belongs only in client.ts / preflight.ts.',
        },
        {
          selector: 'TemplateElement[value.raw=/\\bset_config\\b/]',
          message: 'RES-243: `set_config` belongs only in client.ts.',
        },
        {
          selector: "Identifier[name='set_config']",
          message: 'RES-243: `set_config` belongs only in client.ts.',
        },
        {
          selector: "CallExpression[callee.property.name='withoutTenant']",
          message:
            "RES-252 I-1: `withoutTenant` bypasses tenant filter + RLS. Allowed only in packages/db's allowlist (packages/db/src/withoutTenant.allowlist.ts: src/cli/audit-fks.ts). Add the file path there + update this config's allow-block, or use db.withTenant / db.withTenantId.",
        },
      ],
    },
  },
  {
    // Wrapper invocations and drift-sentinel query live here.
    // audit-fks.ts is a system-context CLI tool (RES-252 allowlist).
    files: ['src/client.ts', 'src/preflight.ts', 'src/cli/audit-fks.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    // Tests deliberately exercise the forge / forge-detection paths.
    files: ['test/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    ignores: ['dist/**', 'dist-spec/**', 'migrations/**', 'eslint.config.mjs'],
  },
];
