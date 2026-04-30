import tseslint from 'typescript-eslint';
import globals from 'globals';
import { base } from './base.mjs';

export const node = tseslint.config(...base, {
  languageOptions: {
    globals: {
      ...globals.node,
    },
  },
  rules: {
    'no-process-exit': 'error',
  },
});

export default node;
