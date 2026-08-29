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
      'src/components/app-sidebar.tsx',
      'src/components/nav-*.tsx',
      'src/components/team-switcher.tsx',
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
      'lib/**',
      'components/**',
      'test/**',
      'hooks/**',
    ],
  },
];
