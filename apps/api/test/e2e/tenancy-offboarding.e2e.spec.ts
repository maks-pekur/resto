import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { schema, TenantAwareDb } from '@resto/db';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[tenancy-offboarding.e2e] Docker not available — skipping integration tests.');
}

const TOKEN_HEADER = { 'x-internal-token': 'integration-test-token-1234567890' };

const provisionTenant = async (
  stack: RealStack,
  slug: string,
): Promise<{ id: string; slug: string }> => {
  const res = await stack.app.inject({
    method: 'POST',
    url: '/internal/v1/tenants',
    headers: TOKEN_HEADER,
    payload: { slug, displayName: `Cafe ${slug}`, country: 'GB', locale: 'en' },
  });
  expect(res.statusCode).toBe(201);
  return res.json<{ id: string; slug: string }>();
};

const backdateSchedule = async (
  db: TenantAwareDb,
  tenantId: string,
  daysAgo: number,
): Promise<void> => {
  await db.withoutTenant('backdate offboarding for e2e', (tx) =>
    tx
      .update(schema.tenants)
      .set({
        offboardingScheduledAt: sql`NOW() - (${daysAgo}::int * INTERVAL '1 day')`,
      })
      .where(eq(schema.tenants.id, tenantId)),
  );
};

interface OffboardingResponse {
  id: string;
  status: string;
  offboardingScheduledAt: string | null;
  offboardingExecutedAt: string | null;
  offboardingRequestedBy: string | null;
  archivedAt: string | null;
}

suite('Tenancy — offboarding HTTP endpoints', () => {
  let stack: RealStack;
  let db: TenantAwareDb;

  beforeAll(async () => {
    stack = await startRealStack();
    db = stack.app.get(TenantAwareDb);
  }, 180_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  describe('POST /internal/v1/tenants/:id/offboard', () => {
    it('rejects without internal token', async () => {
      const res = await stack.app.inject({
        method: 'POST',
        url: '/internal/v1/tenants/00000000-0000-0000-0000-000000000000/offboard',
        payload: { requestedBy: 'op-1' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects when requestedBy is missing', async () => {
      const slug = `off-bad-${randomUUID().slice(0, 8)}`;
      const tenant = await provisionTenant(stack, slug);
      const res = await stack.app.inject({
        method: 'POST',
        url: `/internal/v1/tenants/${tenant.id}/offboard`,
        headers: TOKEN_HEADER,
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for an unknown tenant id', async () => {
      const res = await stack.app.inject({
        method: 'POST',
        url: '/internal/v1/tenants/00000000-0000-0000-0000-000000000000/offboard',
        headers: TOKEN_HEADER,
        payload: { requestedBy: 'op-1' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('schedules offboarding and returns 202 with post-state snapshot', async () => {
      const slug = `off-sched-${randomUUID().slice(0, 8)}`;
      const tenant = await provisionTenant(stack, slug);
      const res = await stack.app.inject({
        method: 'POST',
        url: `/internal/v1/tenants/${tenant.id}/offboard`,
        headers: TOKEN_HEADER,
        payload: { requestedBy: 'op-2' },
      });
      expect(res.statusCode).toBe(202);
      const body = res.json<OffboardingResponse>();
      expect(body.status).toBe('pending_offboarding');
      expect(body.offboardingScheduledAt).not.toBeNull();
      expect(body.offboardingRequestedBy).toBe('op-2');
      expect(body.archivedAt).not.toBeNull();
    });

    it('returns 409 when scheduling an already-pending tenant', async () => {
      const slug = `off-dup-${randomUUID().slice(0, 8)}`;
      const tenant = await provisionTenant(stack, slug);
      const first = await stack.app.inject({
        method: 'POST',
        url: `/internal/v1/tenants/${tenant.id}/offboard`,
        headers: TOKEN_HEADER,
        payload: { requestedBy: 'op-3' },
      });
      expect(first.statusCode).toBe(202);
      const second = await stack.app.inject({
        method: 'POST',
        url: `/internal/v1/tenants/${tenant.id}/offboard`,
        headers: TOKEN_HEADER,
        payload: { requestedBy: 'op-3-again' },
      });
      expect(second.statusCode).toBe(409);
    });
  });

  describe('DELETE /internal/v1/tenants/:id/offboard', () => {
    it('rejects without internal token', async () => {
      const res = await stack.app.inject({
        method: 'DELETE',
        url: '/internal/v1/tenants/00000000-0000-0000-0000-000000000000/offboard',
      });
      expect(res.statusCode).toBe(401);
    });

    it('cancels within cool-off and returns 200 with restored snapshot', async () => {
      const slug = `off-cancel-${randomUUID().slice(0, 8)}`;
      const tenant = await provisionTenant(stack, slug);
      const sched = await stack.app.inject({
        method: 'POST',
        url: `/internal/v1/tenants/${tenant.id}/offboard`,
        headers: TOKEN_HEADER,
        payload: { requestedBy: 'op-cancel-1' },
      });
      expect(sched.statusCode).toBe(202);

      const cancel = await stack.app.inject({
        method: 'DELETE',
        url: `/internal/v1/tenants/${tenant.id}/offboard`,
        headers: TOKEN_HEADER,
      });
      expect(cancel.statusCode).toBe(200);
      const body = cancel.json<OffboardingResponse>();
      expect(body.status).toBe('active');
      expect(body.offboardingScheduledAt).toBeNull();
      expect(body.offboardingRequestedBy).toBeNull();
      expect(body.archivedAt).toBeNull();
    });

    it('returns 409 when the cool-off window has expired', async () => {
      const slug = `off-late-${randomUUID().slice(0, 8)}`;
      const tenant = await provisionTenant(stack, slug);
      await stack.app.inject({
        method: 'POST',
        url: `/internal/v1/tenants/${tenant.id}/offboard`,
        headers: TOKEN_HEADER,
        payload: { requestedBy: 'op-late' },
      });
      await backdateSchedule(db, tenant.id, 31);
      const res = await stack.app.inject({
        method: 'DELETE',
        url: `/internal/v1/tenants/${tenant.id}/offboard`,
        headers: TOKEN_HEADER,
      });
      expect(res.statusCode).toBe(409);
    });

    it('returns 409 when cancelling a non-pending tenant', async () => {
      const slug = `off-noop-${randomUUID().slice(0, 8)}`;
      const tenant = await provisionTenant(stack, slug);
      const res = await stack.app.inject({
        method: 'DELETE',
        url: `/internal/v1/tenants/${tenant.id}/offboard`,
        headers: TOKEN_HEADER,
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('GET /internal/v1/tenants/scheduled-offboarding', () => {
    it('rejects without internal token', async () => {
      const res = await stack.app.inject({
        method: 'GET',
        url: '/internal/v1/tenants/scheduled-offboarding',
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns tenants past 30-day cool-off and excludes fresh ones', async () => {
      const stale = await provisionTenant(stack, `off-list-stale-${randomUUID().slice(0, 8)}`);
      const fresh = await provisionTenant(stack, `off-list-fresh-${randomUUID().slice(0, 8)}`);
      await stack.app.inject({
        method: 'POST',
        url: `/internal/v1/tenants/${stale.id}/offboard`,
        headers: TOKEN_HEADER,
        payload: { requestedBy: 'op-list' },
      });
      await stack.app.inject({
        method: 'POST',
        url: `/internal/v1/tenants/${fresh.id}/offboard`,
        headers: TOKEN_HEADER,
        payload: { requestedBy: 'op-list' },
      });
      await backdateSchedule(db, stale.id, 31);

      const res = await stack.app.inject({
        method: 'GET',
        url: '/internal/v1/tenants/scheduled-offboarding',
        headers: TOKEN_HEADER,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<OffboardingResponse[]>();
      const ids = body.map((row) => row.id);
      expect(ids).toContain(stale.id);
      expect(ids).not.toContain(fresh.id);
      for (const row of body) {
        expect(row.status).toBe('pending_offboarding');
      }
    }, 60_000);
  });
});
