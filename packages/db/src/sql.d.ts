// G-01: esbuild text loader inlines *.sql files as strings at build time.
// This declaration lets tsc accept `import SQL from '../sql/roles.sql'`
// in non-bundled contexts (vitest, tsc typecheck).
declare module '*.sql' {
  const content: string;
  export default content;
}
