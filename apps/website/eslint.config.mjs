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
      'components/ui/**/*.{ts,tsx}',
      'components/app-sidebar.tsx',
      'components/nav-*.tsx',
      'components/team-switcher.tsx',
      'hooks/use-mobile.ts',
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
    ignores: [
      '.next/**',
      'next-env.d.ts',
      'eslint.config.mjs',
      'next.config.mjs',
      'postcss.config.mjs',
      'vitest.config.ts',
    ],
  },
];
