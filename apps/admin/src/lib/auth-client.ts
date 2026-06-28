import { createAuthClient } from 'better-auth/react';
import { organizationClient, twoFactorClient } from 'better-auth/client/plugins';
import { VITE_API_ORIGIN } from '../env';

export const authClient = createAuthClient({
  baseURL: VITE_API_ORIGIN,
  fetchOptions: { credentials: 'include' },
  plugins: [organizationClient(), twoFactorClient()],
});
