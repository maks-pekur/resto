import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import nxPlugin from '@nx/eslint-plugin';

/**
 * Module-boundary rule. Promised in ADR-0001 / ADR-0007: enforce who
 * may import whom across the workspace using Nx tags declared in each
 * `project.json`. Apps cannot be imported by other projects; tenant-aware
 * scopes can only depend on the shared scope.
 *
 * Tag legend (see `apps/*\/project.json`, `packages/*\/project.json`):
 *   - scope:api / scope:qr-menu — the deployable apps
 *   - scope:shared — packages that any app may consume
 *   - type:app / type:lib — coarse "is this a deployable" axis
 */
const moduleBoundariesRule = [
  'error',
  {
    enforceBuildableLibDependency: true,
    allow: [],
    depConstraints: [
      // Apps and CLIs may consume libraries but never each other.
      { sourceTag: 'type:app', onlyDependOnLibsWithTags: ['type:lib'] },
      { sourceTag: 'type:cli', onlyDependOnLibsWithTags: ['type:lib'] },
      // Libs may depend only on other libs (never on apps).
      { sourceTag: 'type:lib', onlyDependOnLibsWithTags: ['type:lib'] },
      // App-scoped projects (api / qr-menu / admin / future website / …)
      // consume only the shared scope.
      { sourceTag: 'scope:api', onlyDependOnLibsWithTags: ['scope:shared'] },
      { sourceTag: 'scope:qr-menu', onlyDependOnLibsWithTags: ['scope:shared'] },
      { sourceTag: 'scope:admin', onlyDependOnLibsWithTags: ['scope:shared'] },
      // Tooling (seed CLI etc.) consumes shared libs.
      { sourceTag: 'scope:tools', onlyDependOnLibsWithTags: ['scope:shared'] },
      // Shared libs depend only on each other.
      { sourceTag: 'scope:shared', onlyDependOnLibsWithTags: ['scope:shared'] },
    ],
  },
];

/**
 * Base ESLint flat config for all Resto TypeScript projects.
 * Apps should spread this and add `languageOptions.parserOptions.tsconfigRootDir`
 * pointing at their own directory so type-aware rules pick up the right tsconfig.
 */
export const base = tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/.nx/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.generated.ts',
      '**/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.es2023,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  // Nx module boundaries — applied to TS sources only (skipping config and
  // test files keeps the rule's project-graph lookups fast).
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { '@nx': nxPlugin },
    rules: {
      '@nx/enforce-module-boundaries': moduleBoundariesRule,
    },
  },
  prettier,
);

export default base;
