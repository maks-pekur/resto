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
    files: ['seed/cli.ts', 'seed/commands/**/*.ts', 'erase-tenant/cli.ts'],
    rules: {
      'no-process-exit': 'off',
    },
  },
  {
    files: ['erase-tenant/cli.ts'],
    rules: {
      'no-console': 'off',
      '@nx/enforce-module-boundaries': 'off',
    },
  },
  {
    ignores: ['eslint.config.mjs', 'vitest.config.ts', 'audit/**/*.mjs'],
  },
];
