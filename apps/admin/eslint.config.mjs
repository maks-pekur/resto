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
    /*
     * shadcn-managed surface — primitives under `components/ui/**`,
     * blocks scaffolded by the CLI (sidebar-07 lays down `app-sidebar`,
     * `nav-{main,projects,user}`, `team-switcher`), and the
     * `use-mobile` hook. shadcn's output uses idioms our base preset
     * forbids (`type` aliases for prop unions, void-returning arrow
     * shorthands for handlers). We relax the rules ONLY here so
     * `shadcn add …` stays a clean upgrade path and our app code
     * doesn't drift.
     */
    files: [
      'components/ui/**/*.{ts,tsx}',
      'components/app-sidebar.tsx',
      'components/nav-*.tsx',
      'components/team-switcher.tsx',
      'hooks/use-mobile.ts',
    ],
    rules: {
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      // Rules below also fire on stock shadcn templates (e.g. `form`,
      // `progress`) — relaxing them here keeps `pnpm dlx shadcn add …`
      // a clean upgrade path per apps/CLAUDE.md.
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unnecessary-template-expression': 'off',
      '@typescript-eslint/no-unnecessary-type-conversion': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
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
