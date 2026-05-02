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
    ignores: ['dist/**', 'eslint.config.mjs', 'vite.config.ts', 'vitest.config.ts'],
  },
];
