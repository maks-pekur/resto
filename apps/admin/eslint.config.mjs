import { react } from '@resto/config-eslint/react';
import { FORBIDDEN_CORRELATION_ID_LITERALS } from '@resto/config-eslint/base';

const SWITCH_TENANT_MESSAGE =
  '07.4 D-04: a tenant switch must stay a full document load, confined to ' +
  'src/lib/switch-tenant.ts. Same enforcement family as runInTenantContext ' +
  '(ADR-0020 I-6) and the withoutTenant allowlist (RES-252 I-1).';

export default [
  ...react,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: [
      'src/components/ui/**/*.{ts,tsx}',
      'src/components/layout/app-sidebar.tsx',
      'src/components/layout/nav-*.tsx',
      'src/hooks/use-mobile.ts',
    ],
    rules: {
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unnecessary-template-expression': 'off',
      '@typescript-eslint/no-unnecessary-type-conversion': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
    },
  },
  {
    files: ['test/**/*.{ts,tsx}'],
    rules: {
      // Test doubles are empty on purpose, and a mocked handler is async because the real
      // one is, not because it awaits anything.
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['src/routes/**/*.{ts,tsx}'],
    rules: {
      // TanStack Router's throw redirect() / throw notFound() are not Error instances
      '@typescript-eslint/only-throw-error': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    // signup.tsx binds a freshly created organization for the first time — no prior tenant's
    // cache exists to discard, the same reasoning that keeps login.tsx's pre-switch branch soft.
    ignores: ['src/lib/switch-tenant.ts', 'src/routes/(auth)/signup.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...FORBIDDEN_CORRELATION_ID_LITERALS,
        {
          selector: "Literal[value='/api/auth/switch-organization']",
          message: SWITCH_TENANT_MESSAGE,
        },
        {
          selector: "TemplateElement[value.raw='/api/auth/switch-organization']",
          message: SWITCH_TENANT_MESSAGE,
        },
        {
          selector: "CallExpression[callee.property.name='setActive']",
          message: SWITCH_TENANT_MESSAGE,
        },
      ],
    },
  },
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'eslint.config.mjs',
      'vite.config.ts',
      'vitest.config.ts',
      'app/**',
    ],
  },
];
