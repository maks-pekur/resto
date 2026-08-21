import { betterAuth } from 'better-auth';
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../../src/config/env.schema';
import { buildAuthDrizzle } from '../../../src/contexts/identity/infrastructure/better-auth/auth-db';
import { buildBetterAuthDrizzleAdapter } from '../../../src/contexts/identity/infrastructure/better-auth/drizzle-adapter';

const baseEnv: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgres://app@localhost:5432/resto',
  NATS_URL: 'nats://localhost:4222',
};

describe('ADMIN_WEB_ORIGIN_WILDCARD env refine (D-24)', () => {
  it('rejects a wildcard that does not occupy the entire leftmost label', () => {
    expect(() => loadEnv({ ...baseEnv, ADMIN_WEB_ORIGIN_WILDCARD: 'https://*resto.app' })).toThrow(
      /ADMIN_WEB_ORIGIN_WILDCARD/,
    );
  });

  it('rejects a wildcard with fewer than two literal labels after it', () => {
    expect(() => loadEnv({ ...baseEnv, ADMIN_WEB_ORIGIN_WILDCARD: 'https://*.app' })).toThrow(
      /ADMIN_WEB_ORIGIN_WILDCARD/,
    );
  });

  it('accepts a wildcard occupying the entire leftmost label with two+ literal labels after it', () => {
    const env = loadEnv({
      ...baseEnv,
      ADMIN_WEB_ORIGIN_WILDCARD: 'https://*.admin.resto.app',
    });
    expect(env.ADMIN_WEB_ORIGIN_WILDCARD).toBe('https://*.admin.resto.app');
  });

  it('accepts local-dev shape with a port after the wildcard host', () => {
    const env = loadEnv({
      ...baseEnv,
      ADMIN_WEB_ORIGIN_WILDCARD: 'http://*.admin.localhost:4000',
    });
    expect(env.ADMIN_WEB_ORIGIN_WILDCARD).toBe('http://*.admin.localhost:4000');
  });
});

describe('Better Auth trustedOrigins wildcard matching (D-24)', () => {
  // The real drizzle adapter this repo's buildAuth() uses in production,
  // wired to a Drizzle client pointed at an unreachable Postgres URL.
  // postgres.js connects lazily; origin-check rejects (for the two
  // attacker cases) before any query is issued, so no live database is
  // needed and no server is bound (auth.handler() is called in-process).
  //
  // Built via the raw `betterAuth()` call, not this repo's `buildAuth()`
  // wrapper: BA's core disables origin-check whenever `NODE_ENV === 'test'`
  // (`@better-auth/core`'s `isTest()`, which vitest sets) UNLESS
  // `advanced.disableOriginCheck` is explicitly set — an option
  // `buildAuth()`'s BuildOpts does not expose. Setting it here forces the
  // real check regardless of NODE_ENV, without touching production wiring.
  const authDb = buildAuthDrizzle('postgres://nouser:nopass@127.0.0.1:1/nodb');
  const auth = betterAuth({
    database: buildBetterAuthDrizzleAdapter(authDb),
    secret: 'a'.repeat(32),
    baseURL: 'https://api.resto.app',
    trustedOrigins: ['https://admin.resto.app', 'https://*.admin.resto.app'],
    advanced: { disableOriginCheck: false },
  });

  const probeOrigin = async (origin: string): Promise<Response> =>
    auth.handler(
      new Request('https://api.resto.app/api/auth/sign-out', {
        method: 'POST',
        headers: {
          origin,
          cookie: 'better-auth.session_token=bogus',
          'content-type': 'application/json',
        },
        body: '{}',
      }),
    );

  it('accepts a legitimate per-organization admin host', async () => {
    const res = await probeOrigin('https://acme.admin.resto.app');
    expect(res.status).toBe(200);
  });

  it('rejects evil-admin.resto.app.attacker.com — a suffix-match spoof', async () => {
    const res = await probeOrigin('https://evil-admin.resto.app.attacker.com');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('INVALID_ORIGIN');
  });

  it('rejects admin.resto.app.attacker.com — a look-alike suffix spoof', async () => {
    const res = await probeOrigin('https://admin.resto.app.attacker.com');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('INVALID_ORIGIN');
  });
});
