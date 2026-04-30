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
    ignores: ['dist/**', 'dist-spec/**', 'migrations/**', 'eslint.config.mjs'],
  },
];
