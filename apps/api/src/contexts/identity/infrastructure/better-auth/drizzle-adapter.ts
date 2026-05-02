import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import * as authSchema from '@resto/db/schema';
import type { AuthDrizzle } from './auth-db';

/**
 * Wires BA's Drizzle adapter against our schema. The `organization`
 * symbol in `authSchema` is a re-export of `tenants` (Task 2), so BA
 * reads/writes the tenants table directly. No remapping needed.
 */
export const buildBetterAuthDrizzleAdapter = (auth: AuthDrizzle) =>
  drizzleAdapter(auth.db, {
    provider: 'pg',
    schema: authSchema,
  });
