import tseslint from 'typescript-eslint';
import globals from 'globals';
import { base } from './base.mjs';

export const react = tseslint.config(...base, {
  languageOptions: {
    globals: {
      ...globals.browser,
    },
  },
});

export default react;
