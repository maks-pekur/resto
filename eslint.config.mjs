import js from '@eslint/js';

/**
 * Workspace-root ESLint flat config.
 *
 * Apps and packages each provide their own `eslint.config.mjs` that imports
 * from `@resto/config-eslint/*`. The root config only applies a minimal
 * untyped preset to the few config files that live at the root (this file,
 * commitlint.config.cjs). Type-aware rules require an associated tsconfig
 * and are handled per project, not globally.
 */
export default [
  {
    ignores: [
      'apps/**',
      'packages/**',
      'tools/**',
      'infra/**',
      'docs/**',
      '.nx/**',
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        module: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
];
