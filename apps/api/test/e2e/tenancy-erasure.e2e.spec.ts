import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { schema, TenantAwareDb } from '@resto/db';
import { TenantErasureCompletedV1 } from '@resto/events';
import { OffboardTenantService } from '../../src/contexts/tenancy/application/offboard-tenant.service';
import { TenantErasureTooEarlyError } from '../../src/contexts/tenancy/domain/errors';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[tenancy-erasure.e2e] Docker not available — skipping integration tests.');
}

const INTERNAL_TOKEN = 'integration-test-token-1234567890';
const TENANT_HEADERS = { 'x-internal-token': INTERNAL_TOKEN };

const provisionTenant = async (
  stack: RealStack,
  slug: string,
): Promise<{ id: string; slug: string }> => {
  const res = await stack.app.inject({
    method: 'POST',
    url: '/internal/v1/tenants',
    headers: TENANT_HEADERS,
    payload: { slug, displayName: `Cafe ${slug}`, defaultCurrency: 'USD', locale: 'en' },
  });
  expect(res.statusCode).toBe(201);
  return res.json<{ id: string; slug: string }>();
};

const insertAuditRow = async (
  db: TenantAwareDb,
  tenantId: string,
  userId: string,
): Promise<void> => {
  await db.withoutTenant('seed audit row for erasure test', (tx) =>
    tx.insert(schema.auditLog).values({
      tenantId,
      actorKind: 'tenant_user',
      actorSubject: userId,
      action: 'menu.published',
      targetType: 'user',
      targetId: userId,
      payload: {
        userId,
        ipAddress: '203.0.113.42',
        userAgent: 'Mozilla/5.0 erasure-fixture',
        email: 'fixture@example.com',
        extra: 'not-pii',
      },
      ipAddress: '203.0.113.42',
      userAgent: 'Mozilla/5.0 erasure-fixture',
    }),
  );
};

const backdateSchedule = async (
  db: TenantAwareDb,
  tenantId: string,
  daysAgo: number,
): Promise<void> => {
  await db.withoutTenant('backdate offboarding for erasure test', (tx) =>
    tx
      .update(schema.tenants)
      .set({
        offboardingScheduledAt: sql`NOW() - (${daysAgo}::int * INTERVAL '1 day')`,
      })
      .where(eq(schema.tenants.id, tenantId)),
  );
};

suite('Tenancy — GDPR erasure end-to-end', () => {
  let stack: RealStack;
  let service: OffboardTenantService;
  let db: TenantAwareDb;

  beforeAll(async () => {
    stack = await startRealStack();
    service = stack.app.get(OffboardTenantService);
    db = stack.app.get(TenantAwareDb);
  }, 180_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('schedule transitions tenant to pending_offboarding and writes outbox row', async () => {
    const slug = `erase-sched-${randomUUID().slice(0, 8)}`;
    const tenant = await provisionTenant(stack, slug);

    const result = await service.schedule({
      tenantId: tenant.id,
      requestedBy: 'operator-test-1',
    });
    expect(result.status).toBe('pending_offboarding');
    expect(result.offboardingScheduledAt).not.toBeNull();
    expect(result.offboardingRequestedBy).toBe('operator-test-1');

    const outbox = await db.withoutTenant('inspect outbox post-schedule', (tx) =>
      tx
        .select({ type: schema.outboxEvents.type })
        .from(schema.outboxEvents)
        .where(eq(schema.outboxEvents.tenantId, tenant.id)),
    );
    expect(outbox.map((row) => row.type)).toEqual(
      expect.arrayContaining([
        'tenancy.tenant_provisioned.v1',
        'tenancy.tenant_offboarding_scheduled.v1',
      ]),
    );
  }, 60_000);

  it('cancel within cool-off restores active and clears offboarding columns', async () => {
    const slug = `erase-cancel-${randomUUID().slice(0, 8)}`;
    const tenant = await provisionTenant(stack, slug);

    await service.schedule({ tenantId: tenant.id, requestedBy: 'operator-test-2' });
    const cancelled = await service.cancel({ tenantId: tenant.id });
    expect(cancelled.status).toBe('active');
    expect(cancelled.offboardingScheduledAt).toBeNull();
    expect(cancelled.offboardingRequestedBy).toBeNull();
    expect(cancelled.archivedAt).toBeNull();

    const outbox = await db.withoutTenant('inspect outbox post-cancel', (tx) =>
      tx
        .select({ type: schema.outboxEvents.type })
        .from(schema.outboxEvents)
        .where(eq(schema.outboxEvents.tenantId, tenant.id)),
    );
    expect(outbox.map((row) => row.type)).toContain('tenancy.tenant_offboarding_cancelled.v1');
  }, 60_000);

  it('executeErasure before cool-off rejects with TenantErasureTooEarlyError', async () => {
    const slug = `erase-early-${randomUUID().slice(0, 8)}`;
    const tenant = await provisionTenant(stack, slug);
    await service.schedule({ tenantId: tenant.id, requestedBy: 'operator-test-3' });

    await expect(service.executeErasure({ tenantId: tenant.id })).rejects.toThrow(
      TenantErasureTooEarlyError,
    );
  }, 60_000);

  it('executeErasure after cool-off cascades, anonymises, tombstones, and emits', async () => {
    const slug = `erase-go-${randomUUID().slice(0, 8)}`;
    const tenant = await provisionTenant(stack, slug);

    const fixtureUserId = `user-${randomUUID()}`;
    await insertAuditRow(db, tenant.id, fixtureUserId);

    await service.schedule({ tenantId: tenant.id, requestedBy: 'operator-test-4' });
    await backdateSchedule(db, tenant.id, 31);

    const erased = await service.executeErasure({ tenantId: tenant.id });
    expect(erased.status).toBe('erased');
    expect(erased.displayName).toBe('[erased]');
    expect(erased.slug).toMatch(/^erased-/);
    expect(erased.stripeAccountId).toBeNull();
    expect(erased.offboardingExecutedAt).not.toBeNull();

    const tenantRows = await db.withoutTenant('inspect tombstone', (tx) =>
      tx.select().from(schema.tenants).where(eq(schema.tenants.id, tenant.id)),
    );
    expect(tenantRows).toHaveLength(1);
    expect(tenantRows[0]?.status).toBe('erased');
    expect(tenantRows[0]?.displayName).toBe('[erased]');

    const domainRows = await db.withoutTenant('inspect cascade domains', (tx) =>
      tx.select().from(schema.tenantDomains).where(eq(schema.tenantDomains.tenantId, tenant.id)),
    );
    expect(domainRows).toHaveLength(0);

    const auditRows = await db.withoutTenant('inspect audit anonymisation', (tx) =>
      tx.select().from(schema.auditLog).where(eq(schema.auditLog.tenantId, tenant.id)),
    );
    expect(auditRows.length).toBeGreaterThan(0);
    for (const row of auditRows) {
      expect(row.actorSubject.startsWith('erased:')).toBe(true);
      if (row.targetId !== null) {
        expect(row.targetId.startsWith('erased:')).toBe(true);
      }
      expect(row.ipAddress).toBeNull();
      expect(row.userAgent).toBeNull();
      if (row.payload && typeof row.payload === 'object') {
        const payload = row.payload;
        if (typeof payload.userId === 'string') {
          expect(payload.userId.startsWith('erased:')).toBe(true);
        }
        if ('ipAddress' in payload) {
          expect(payload.ipAddress).toBeNull();
        }
        if ('userAgent' in payload) {
          expect(payload.userAgent).toBeNull();
        }
        if ('email' in payload) {
          expect(payload.email).toBeNull();
        }
      }
    }

    const outbox = await db.withoutTenant('inspect outbox post-erase', (tx) =>
      tx
        .select({ type: schema.outboxEvents.type })
        .from(schema.outboxEvents)
        .where(eq(schema.outboxEvents.tenantId, tenant.id)),
    );
    expect(outbox.map((row) => row.type)).toEqual([TenantErasureCompletedV1.type]);
  }, 120_000);
});
