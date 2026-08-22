import { createAuthClient } from 'better-auth/react';
import { organizationClient, twoFactorClient } from 'better-auth/client/plugins';

// No `baseURL`: Better Auth's client falls back to `window.location.origin`
// + `/api/auth` (better-auth/dist/utils/url.mjs:getBaseURL), which is what
// vite.config.ts's `/api` proxy (dev) and the production reverse proxy
// (see 10.2-17-SUMMARY.md) require for the session cookie to be first-party.
export const authClient = createAuthClient({
  fetchOptions: { credentials: 'include' },
  plugins: [organizationClient(), twoFactorClient()],
});
