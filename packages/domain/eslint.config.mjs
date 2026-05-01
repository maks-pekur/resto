import { base } from '@resto/config-eslint/base';

export default [
  ...base,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: ['dist/**', 'dist-spec/**', 'eslint.config.mjs'],
  },
];
