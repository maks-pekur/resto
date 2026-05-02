import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as authSchema from '@resto/db/schema';

/**
 * Construct the BA-only drizzle client. Connects under resto_auth
 * (BYPASSRLS) — see ADR-0013 §"Hybrid RLS exception". Single connection
 * pool sized for BA's expected load (sessions, members, invitations).
 *
 * The runtime app's TenantAwareDb (NOBYPASSRLS, RLS-bound) is independent
 * — they share the database instance but use distinct pg roles.
 */
export const buildAuthDrizzle = (databaseUrl: string) => {
  const client = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 5,
  });
  const db = drizzle(client, { schema: authSchema });
  return { client, db };
};

export type AuthDrizzle = ReturnType<typeof buildAuthDrizzle>;
