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
