import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema, TenantAwareDb } from '@resto/db';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import {
  provisionTenant,
  runBootstrap,
  signInAsOperator,
  extractCookies,
} from './helpers/operator-fixture';
import { AUTH_DRIZZLE_TOKEN } from '../../src/contexts/identity/identity.tokens';
import type { AuthDrizzle } from '../../src/contexts/identity/infrastructure/better-auth/auth-db';

const INTERNAL_TOKEN = 'integration-test-token-1234567890';
const PASSWORD = 'Sup3r-Secret-Pw!';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[location-isolation.e2e] Docker not available — skipping.');
}

// LOW-11 (08.5, ACCEPTED not fixed): afterUpdateMemberRole does not reset
// activeLocationId on role change. Demoted owner->staff fails closed (null
// pin -> 404 until re-login). Promoted staff->owner is neutralized by this
// phase's own design — owners derive location authority from the URL and
// bypass LocationScopeGuard entirely, so a stale staff pin on a promoted
// owner has no effect.
suite('Location isolation e2e (Plan 08.4-11, success criterion #2)', () => {
  let stack: RealStack;
  let tenantId: string;
  let locationAId: string;
  let locationBId: string;
  let locationCId: string;
  let ownerCookie: string;
  let staffCookie: string;

  const createLocation = async (name: string): Promise<string> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/tenancy/locations',
      headers: { cookie: ownerCookie, 'x-tenant-id': tenantId },
      payload: { name },
    });
    expect(res.statusCode).toBe(200);
    return res.json<{ id: string }>().id;
  };

  const seedScopedStaff = async (email: string, locationId: string): Promise<string> => {
    const throwawaySlug = `loc-iso-member-${randomUUID().slice(0, 8)}`;
    await provisionTenant(stack.app, throwawaySlug, INTERNAL_TOKEN);
    const user = await runBootstrap({
      tenantSlug: throwawaySlug,
      email,
      password: PASSWORD,
      name: 'Scoped Staff',
    });
    const authDb = stack.app.get<AuthDrizzle>(AUTH_DRIZZLE_TOKEN);
    const memberId = randomUUID();
    await authDb.db.insert(schema.member).values({
      id: memberId,
      tenantId,
      userId: user.userId,
      role: 'admin',
      createdAt: new Date(),
    });
    const db = stack.app.get(TenantAwareDb);
    await db.withoutTenant('seed member location scope', (tx) =>
      tx.insert(schema.memberLocationScope).values({ memberId, locationId, tenantId }),
    );
    return signInAsOperator(stack.app, email, PASSWORD, tenantId);
  };

  const getStopList = (cookie: string, locationId: string) =>
    stack.app.inject({
      method: 'GET',
      url: '/v1/catalog/stop-list',
      headers: {
        cookie,
        'x-tenant-id': tenantId,
        'x-location-id': locationId,
      },
    });

  const setActiveLocation = async (
    cookie: string,
    locationId: string | null,
  ): Promise<{
    cookie: string;
    status: number;
    body: { code?: string; locationId?: string | null };
  }> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/me/set-active-location',
      headers: { cookie, 'x-tenant-id': tenantId },
      payload: { locationId },
    });
    return {
      cookie: extractCookies(res.headers['set-cookie']) || cookie,
      status: res.statusCode,
      body: res.json(),
    };
  };

  beforeAll(async () => {
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
    process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    stack = await startRealStack({ natsEnabledInApp: false });

    const tenantSlug = `loc-iso-${randomUUID().slice(0, 8)}`;
    const ownerEmail = `owner-${randomUUID().slice(0, 8)}@example.com`;
    const tenant = await provisionTenant(stack.app, tenantSlug, INTERNAL_TOKEN);
    tenantId = tenant.id;
    await runBootstrap({ tenantSlug, email: ownerEmail, password: PASSWORD, name: 'Owner' });
    ownerCookie = await signInAsOperator(stack.app, ownerEmail, PASSWORD, tenantId);

    locationAId = await createLocation('Location A');
    locationBId = await createLocation('Location B');
    locationCId = await createLocation('Location C');

    // Sign-in's built-in onInitialLocationPin hook (auth.config.ts) auto-pins
    // the single reachable location from member_location_scope.
    const staffEmail = `staff-${randomUUID().slice(0, 8)}@example.com`;
    staffCookie = await seedScopedStaff(staffEmail, locationAId);
  }, 240_000);

  afterAll(async () => {
    if (stack) await stopRealStack(stack);
  });

  describe('Task 1 — out-of-scope 404/403, owner bypass', () => {
    describe('D-05 non-owner forged x-location-id (session-vs-request mismatch)', () => {
      it('staff pinned to A requesting B on a location-scoped route returns 404 (not 403)', async () => {
        const res = await getStopList(staffCookie, locationBId);
        expect(res.statusCode).toBe(404);
      });
    });

    describe('D-04 non-owner requesting an unscoped location is refused', () => {
      it('staff pinned to A hitting C (no location scope there) returns 404 (existence-hiding)', async () => {
        const res = await getStopList(staffCookie, locationCId);
        expect(res.statusCode).toBe(404);
      });
    });

    describe('positive control — non-owner in-scope access', () => {
      it('staff pinned to A reaching A on the location-scoped route succeeds (200)', async () => {
        const res = await getStopList(staffCookie, locationAId);
        expect(res.statusCode).toBe(200);
      });
    });

    describe('owner bypass — unrestricted across locations', () => {
      it('owner reaches location A', async () => {
        const res = await getStopList(ownerCookie, locationAId);
        expect(res.statusCode).toBe(200);
      });

      it('owner reaches location B', async () => {
        const res = await getStopList(ownerCookie, locationBId);
        expect(res.statusCode).toBe(200);
      });

      it('owner reaches location C', async () => {
        const res = await getStopList(ownerCookie, locationCId);
        expect(res.statusCode).toBe(200);
      });
    });

    describe('GET /v1/me/locations — non-owner sees only their scoped location', () => {
      it('staff sees exactly [locationA]', async () => {
        const res = await stack.app.inject({
          method: 'GET',
          url: '/v1/me/locations',
          headers: { cookie: staffCookie, 'x-tenant-id': tenantId },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json<{ locations: { id: string }[] }>();
        expect(body.locations.map((l) => l.id)).toEqual([locationAId]);
      });
    });
  });

  describe('Task 2 — staff no-self-switch + archive access-loss', () => {
    describe('D-11 non-owner cannot self-switch active location without re-login', () => {
      it('staff already pinned to A re-pinning to B returns 403 location.already_pinned', async () => {
        const result = await setActiveLocation(staffCookie, locationBId);
        expect(result.status).toBe(403);
        expect(result.body.code).toBe('location.already_pinned');
      });
    });

    describe('D-13 owner server-side location pin retired — set-active-location is a no-op', () => {
      it('owner posting a valid location id gets 200 with locationId: null (no server pin; URL is the authority)', async () => {
        const result = await setActiveLocation(ownerCookie, locationAId);
        expect(result.status).toBe(200);
        expect(result.body.locationId).toBeNull();
      });

      it('owner posting null also gets 200 with locationId: null', async () => {
        const result = await setActiveLocation(ownerCookie, null);
        expect(result.status).toBe(200);
        expect(result.body.locationId).toBeNull();
      });
    });

    describe('D-17 archiving a location removes scoped-only staff access (default-deny)', () => {
      it('after owner archives location A, staff loses access on the next request (their only location was also their only reachable scope)', async () => {
        const archiveRes = await stack.app.inject({
          method: 'PATCH',
          url: `/v1/tenancy/locations/${locationAId}/archive`,
          headers: { cookie: ownerCookie, 'x-tenant-id': tenantId },
        });
        expect(archiveRes.statusCode).toBe(200);
        expect(archiveRes.json<{ scopedMemberCount: number }>().scopedMemberCount).toBe(1);

        const res = await getStopList(staffCookie, locationAId);
        expect(res.statusCode).toBe(403);
        expect(res.json<{ code?: string }>().code).toBe('location.access_denied');
      });
    });
  });
});
