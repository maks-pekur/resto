/**
 * Read each var by its literal name: Vite replaces `import.meta.env.VITE_X` with the value at
 * build time, while a dynamic lookup makes it inline the whole env object — which is how a
 * dev-only override like `VITE_TENANT_SLUG` would end up in a guest bundle (see
 * `test/bundle-no-dev-leak.spec.ts`).
 */
export const VITE_STRIPE_PUBLISHABLE_KEY: string =
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '';
