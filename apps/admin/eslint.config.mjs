import { react } from '@resto/config-eslint/react';

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
