import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';

/**
 * Browser-side client for the api's Better Auth instance.
 *
 * `baseURL` is intentionally empty: requests fire as relative URLs
 * (`/api/auth/sign-in/email`, …) so they hit the admin's own origin.
 * Next.js rewrites in `next.config.mjs` proxy them to `apps/api`,
 * which keeps the BA session cookie same-origin in dev (localhost:3001
 * for everything) and aligns with the prod plan from ADR-0013 — admin
 * and api share the parent domain via `AUTH_COOKIE_DOMAIN=.resto.app`.
 *
 * The organization plugin is required for `setActive`, the operator
 * tenant-switch flow, and member listing later.
 */
export const authClient = createAuthClient({
  baseURL: '',
  plugins: [organizationClient()],
});
