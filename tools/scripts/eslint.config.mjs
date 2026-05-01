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
    files: ['seed/cli.ts', 'seed/commands/**/*.ts'],
    rules: {
      // The CLI legitimately exits with non-zero on user error.
      'no-process-exit': 'off',
    },
  },
  {
    ignores: ['eslint.config.mjs', 'vitest.config.ts', 'keycloak-seed.mjs'],
  },
];
