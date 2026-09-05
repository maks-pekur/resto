import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema, TenantAwareDb } from '@resto/db';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import { provisionTenant, runBootstrap, signInAsOperator } from './helpers/operator-fixture';
import { AUTH_DRIZZLE_TOKEN } from '../../src/contexts/identity/identity.tokens';
import type { AuthDrizzle } from '../../src/contexts/identity/infrastructure/better-auth/auth-db';

const INTERNAL_TOKEN = 'integration-test-token-1234567890';
const PASSWORD = 'Sup3r-Secret-Pw!';
const TABLE_READER_ROLE_SLUG = 'table-reader';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[table-zones.e2e] Docker not available — skipping.');
}

interface TableWire {
  readonly id: string;
  readonly number: string;
  readonly ordinal: number;
  readonly status: 'active' | 'archived';
  readonly qrUrl: string;
}

interface TableZoneWire {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'archived';
  readonly tables: readonly TableWire[];
}

suite('Table zones and tables e2e (Plan 10.3-07)', () => {
  let stack: RealStack;
  let tenantId: string;
  let tenantSlug: string;
  let locationAId: string;
  let locationBId: string;
  let zoneBId: string;
  let ownerCookie: string;
  let updaterCookie: string;
  let readerCookie: string;
  let mainZoneId: string;

  const headersFor = (cookie: string, locationId: string) => ({
    cookie,
    'x-tenant-id': tenantId,
    'x-location-id': locationId,
  });

  const createLocation = async (name: string): Promise<string> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/tenancy/locations',
      headers: { cookie: ownerCookie, 'x-tenant-id': tenantId },
      payload: { name, address: '1 Test Street, London', latitude: 51.5074, longitude: -0.1278 },
    });
    expect(res.statusCode).toBe(200);
    return res.json<{ id: string }>().id;
  };

  const seedCustomRole = async (
    slug: string,
    permission: Record<string, string[]>,
  ): Promise<void> => {
    const authDb = stack.app.get<AuthDrizzle>(AUTH_DRIZZLE_TOKEN);
    await authDb.db.insert(schema.tenantRole).values({
      id: randomUUID(),
      tenantId,
      role: slug,
      permission: JSON.stringify(permission),
    });
  };

  // Bootstraps a fresh user (via a throwaway tenant, mirroring location-isolation.e2e.spec.ts),
  // attaches them to the real tenant as a member, and scopes them to one location. `locationRole`
  // adds permissions on top of `baseRole` for requests made at that location (D-06); the sign-in
  // flow auto-pins a member scoped to exactly one location.
  const seedScopedMember = async (
    email: string,
    baseRole: 'admin' | 'staff',
    locationId: string,
    locationRole: string | null,
  ): Promise<string> => {
    const throwawaySlug = `tz-member-${randomUUID().slice(0, 8)}`;
    await provisionTenant(stack.app, throwawaySlug, INTERNAL_TOKEN);
    const user = await runBootstrap({
      tenantSlug: throwawaySlug,
      email,
      password: PASSWORD,
      name: 'Scoped Member',
    });
    const authDb = stack.app.get<AuthDrizzle>(AUTH_DRIZZLE_TOKEN);
    const memberId = randomUUID();
    await authDb.db.insert(schema.member).values({
      id: memberId,
      tenantId,
      userId: user.userId,
      role: baseRole,
      createdAt: new Date(),
    });
    const db = stack.app.get(TenantAwareDb);
    await db.withoutTenant('seed member location scope for table-zones e2e', (tx) =>
      tx.insert(schema.memberLocationScope).values({
        memberId,
        locationId,
        tenantId,
        role: locationRole,
      }),
    );
    return signInAsOperator(stack.app, email, PASSWORD, tenantId);
  };

  beforeAll(async () => {
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
    process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    // GuestMenuUrlService (plan 10.3-05) throws building qrUrl without this, for any tenant with
    // no verified custom domain — matches the apex host-resolution.e2e.spec.ts already seeds against.
    process.env.PUBLIC_APEX_DOMAIN = 'resto.app';
    stack = await startRealStack({ natsEnabledInApp: false });

    tenantSlug = `table-zones-${randomUUID().slice(0, 8)}`;
    const ownerEmail = `owner-${randomUUID().slice(0, 8)}@example.com`;
    const tenant = await provisionTenant(stack.app, tenantSlug, INTERNAL_TOKEN);
    tenantId = tenant.id;
    await runBootstrap({ tenantSlug, email: ownerEmail, password: PASSWORD, name: 'Owner' });
    ownerCookie = await signInAsOperator(stack.app, ownerEmail, PASSWORD, tenantId);

    locationAId = await createLocation('Location A');
    locationBId = await createLocation('Location B');

    const zoneBRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/tenancy/table-zones',
      headers: headersFor(ownerCookie, locationBId),
      payload: { name: 'Patio (B)', tableCount: 2 },
    });
    expect(zoneBRes.statusCode).toBe(200);
    zoneBId = zoneBRes.json<TableZoneWire>().id;

    await seedCustomRole(TABLE_READER_ROLE_SLUG, { table: ['read'] });

    const updaterEmail = `updater-${randomUUID().slice(0, 8)}@example.com`;
    updaterCookie = await seedScopedMember(updaterEmail, 'admin', locationAId, null);

    const readerEmail = `reader-${randomUUID().slice(0, 8)}@example.com`;
    readerCookie = await seedScopedMember(
      readerEmail,
      'staff',
      locationAId,
      TABLE_READER_ROLE_SLUG,
    );
  }, 240_000);

  afterAll(async () => {
    if (stack) await stopRealStack(stack);
  });

  it('case 1 — bulk create returns 20 tables numbered 1..20 in order, each with its own qrUrl', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/tenancy/table-zones',
      headers: headersFor(ownerCookie, locationAId),
      payload: { name: 'Main Hall', tableCount: 20 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<TableZoneWire>();
    mainZoneId = body.id;

    expect(body.tables.map((t) => t.number)).toEqual(
      Array.from({ length: 20 }, (_, i) => String(i + 1)),
    );
    for (const table of body.tables) {
      expect(table.qrUrl).toMatch(
        new RegExp(`^https://${tenantSlug}\\.resto\\.app/qr/t/[0-9a-f]{32}$`),
      );
    }
  });

  it('case 2 — over-cap create is refused at the Zod boundary (validation.failed) and creates no rows', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/tenancy/table-zones',
      headers: headersFor(ownerCookie, locationAId),
      payload: { name: 'Overflow', tableCount: 201 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code?: string }>().code).toBe('validation.failed');

    const list = await stack.app.inject({
      method: 'GET',
      url: '/v1/tenancy/table-zones',
      headers: headersFor(ownerCookie, locationAId),
    });
    expect(list.statusCode).toBe(200);
    const zones = list.json<TableZoneWire[]>();
    expect(zones.map((z) => z.id)).toEqual([mainZoneId]);
  });

  it('case 3 — active-number uniqueness is per zone, not per location', async () => {
    const added = await stack.app.inject({
      method: 'POST',
      url: `/v1/tenancy/table-zones/${mainZoneId}/tables`,
      headers: headersFor(updaterCookie, locationAId),
      payload: { count: 1 },
    });
    expect(added.statusCode).toBe(200);
    const [newTable] = added.json<TableWire[]>();
    expect(newTable?.number).toBe('21');

    const rename = await stack.app.inject({
      method: 'PATCH',
      url: `/v1/tenancy/table-zones/${mainZoneId}/tables/${newTable?.id}`,
      headers: headersFor(updaterCookie, locationAId),
      payload: { number: '1' },
    });
    expect(rename.statusCode).toBe(409);
    expect(rename.json<{ code?: string }>().code).toBe('tenancy.table_number_taken');

    // A fresh zone in the same location numbers its own tables from "1" — the collision above is
    // scoped to the zone, not the whole location.
    const secondZone = await stack.app.inject({
      method: 'POST',
      url: '/v1/tenancy/table-zones',
      headers: headersFor(ownerCookie, locationAId),
      payload: { name: 'Second Zone', tableCount: 1 },
    });
    expect(secondZone.statusCode).toBe(200);
    expect(secondZone.json<TableZoneWire>().tables[0]?.number).toBe('1');
  });

  it('case 4 — table:read holder lists and reads qrUrl, and is refused on create, rename and archive', async () => {
    const list = await stack.app.inject({
      method: 'GET',
      url: '/v1/tenancy/table-zones',
      headers: headersFor(readerCookie, locationAId),
    });
    expect(list.statusCode).toBe(200);
    const zones = list.json<TableZoneWire[]>();
    const main = zones.find((z) => z.id === mainZoneId);
    expect(main?.tables[0]?.qrUrl).toContain('https://');

    const create = await stack.app.inject({
      method: 'POST',
      url: '/v1/tenancy/table-zones',
      headers: headersFor(readerCookie, locationAId),
      payload: { name: 'Reader Attempt', tableCount: 1 },
    });
    expect(create.statusCode).toBe(403);

    const rename = await stack.app.inject({
      method: 'PATCH',
      url: `/v1/tenancy/table-zones/${mainZoneId}`,
      headers: headersFor(readerCookie, locationAId),
      payload: { name: 'Renamed by reader' },
    });
    expect(rename.statusCode).toBe(403);

    const archive = await stack.app.inject({
      method: 'PATCH',
      url: `/v1/tenancy/table-zones/${mainZoneId}/archive`,
      headers: headersFor(readerCookie, locationAId),
    });
    expect(archive.statusCode).toBe(403);
  });

  it('case 5 — a location-A operator does not see location B zones in the list', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/tenancy/table-zones',
      headers: headersFor(readerCookie, locationAId),
    });
    expect(res.statusCode).toBe(200);
    const zones = res.json<TableZoneWire[]>();
    expect(zones.map((z) => z.id)).not.toContain(zoneBId);
    expect(zones.map((z) => z.id)).toContain(mainZoneId);
  });

  it('case 6 — a location-A operator forging a location-B zone id is refused, and writes nothing', async () => {
    const rename = await stack.app.inject({
      method: 'PATCH',
      url: `/v1/tenancy/table-zones/${zoneBId}`,
      headers: headersFor(updaterCookie, locationAId),
      payload: { name: 'Hijacked' },
    });
    expect(rename.statusCode).toBe(404);

    const archive = await stack.app.inject({
      method: 'PATCH',
      url: `/v1/tenancy/table-zones/${zoneBId}/archive`,
      headers: headersFor(updaterCookie, locationAId),
    });
    expect(archive.statusCode).toBe(404);

    const db = stack.app.get(TenantAwareDb);
    const rows = await db.withoutTenant('read zone B after forged mutation attempts', (tx) =>
      tx
        .select({ name: schema.tableZones.name, status: schema.tableZones.status })
        .from(schema.tableZones)
        .where(eq(schema.tableZones.id, zoneBId)),
    );
    expect(rows[0]).toEqual({ name: 'Patio (B)', status: 'active' });
  });

  it('case 7 — the owner sees each location its own zones when switching x-location-id', async () => {
    const listA = await stack.app.inject({
      method: 'GET',
      url: '/v1/tenancy/table-zones',
      headers: headersFor(ownerCookie, locationAId),
    });
    expect(listA.statusCode).toBe(200);
    expect(listA.json<TableZoneWire[]>().map((z) => z.id)).not.toContain(zoneBId);

    const listB = await stack.app.inject({
      method: 'GET',
      url: '/v1/tenancy/table-zones',
      headers: headersFor(ownerCookie, locationBId),
    });
    expect(listB.statusCode).toBe(200);
    const zonesB = listB.json<TableZoneWire[]>();
    expect(zonesB.map((z) => z.id)).toEqual([zoneBId]);
  });

  it('case 8 — archiving a 21-table zone leaves 21 archived rows and 0 active ones', async () => {
    const res = await stack.app.inject({
      method: 'PATCH',
      url: `/v1/tenancy/table-zones/${mainZoneId}/archive`,
      headers: headersFor(ownerCookie, locationAId),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ zoneId: string; archivedTableCount: number }>().archivedTableCount).toBe(21);

    const db = stack.app.get(TenantAwareDb);
    const zoneRows = await db.withoutTenant('read archived zone status', (tx) =>
      tx
        .select({ status: schema.tableZones.status })
        .from(schema.tableZones)
        .where(eq(schema.tableZones.id, mainZoneId)),
    );
    expect(zoneRows[0]?.status).toBe('archived');

    const tableRows = await db.withoutTenant('read archived table statuses', (tx) =>
      tx
        .select({ status: schema.restaurantTables.status })
        .from(schema.restaurantTables)
        .where(eq(schema.restaurantTables.zoneId, mainZoneId)),
    );
    expect(tableRows).toHaveLength(21);
    expect(tableRows.every((r) => r.status === 'archived')).toBe(true);
  });
});
