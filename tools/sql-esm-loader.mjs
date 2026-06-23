// ESM hook: transform *.sql imports to empty string exports for tsx/Node ESM.
// Used by openapi:emit (AppModule -> @resto/db/roles.ts -> sql/*.sql).
// Production bundling uses esbuild loader: { '.sql': 'text' } (build.mjs).
export function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('.sql')) {
    return { url: `data:text/javascript,export default '';`, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
