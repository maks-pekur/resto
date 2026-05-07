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
    ignores: ['dist/**', 'src/generated/**', 'eslint.config.mjs'],
  },
];
