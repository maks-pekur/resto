import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { schema, TenantAwareDb } from '@resto/db';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import { provisionTenant } from './helpers/operator-fixture';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

const INTERNAL_TOKEN = 'integration-test-token-1234567890';

const pollForAuditRow = async (
  db: TenantAwareDb,
  tenantId: string,
  action: string,
  timeoutMs = 10_000,
): Promise<{ count: number }> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await db.withoutTenant('tenancy-suspend e2e: poll audit_log', (tx) =>
      tx
        .select({ id: schema.auditLog.action })
        .from(schema.auditLog)
        .where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, action))),
    );
    if (rows.length > 0) return { count: rows.length };
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return { count: 0 };
};

suite('Tenant suspend/resume — HTTP, events, audit, customer-route block', () => {
  let stack: RealStack;

  beforeAll(async () => {
    stack = await startRealStack();
  }, 180_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('POST /internal/v1/tenants/:id/suspend transitions tenant to suspended and emits tenancy.tenant_suspended.v1', async () => {
    const slug = `susp-${randomUUID().slice(0, 8)}`;
    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);

    const res = await stack.app.inject({
      method: 'POST',
      url: `/internal/v1/tenants/${tenant.id}/suspend`,
      headers: { 'x-internal-token': INTERNAL_TOKEN, 'content-type': 'application/json' },
      payload: { requestedBy: 'test-operator' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ status: string }>();
    expect(body.status).toBe('suspended');

    const db = stack.app.get(TenantAwareDb);
    const audit = await pollForAuditRow(db, tenant.id, 'tenancy.tenant_suspended.v1');
    expect(audit.count).toBe(1);
  }, 60_000);

  it('GET /v1/menu returns 403 problem+json when tenant is suspended', async () => {
    const slug = `susp-menu-${randomUUID().slice(0, 8)}`;
    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);

    const suspendRes = await stack.app.inject({
      method: 'POST',
      url: `/internal/v1/tenants/${tenant.id}/suspend`,
      headers: { 'x-internal-token': INTERNAL_TOKEN, 'content-type': 'application/json' },
      payload: { requestedBy: 'test-operator' },
    });
    expect(suspendRes.statusCode).toBe(200);

    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: {
        'x-internal-token': INTERNAL_TOKEN,
        'x-tenant-id': tenant.id,
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.headers['content-type']).toContain('application/problem+json');
    const body = res.json<{ code?: string; detail?: string; type: string }>();
    expect(body.code).toBe('tenancy.tenant_suspended');
    // Generic detail; no menu data leaked.
    expect(body.detail ?? '').not.toMatch(/\b(items|categories|modifiers)\b/i);
  }, 60_000);

  it('GET /v1/menu/items/:id returns 403 problem+json when tenant is suspended', async () => {
    const slug = `susp-item-${randomUUID().slice(0, 8)}`;
    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    const suspendRes = await stack.app.inject({
      method: 'POST',
      url: `/internal/v1/tenants/${tenant.id}/suspend`,
      headers: { 'x-internal-token': INTERNAL_TOKEN, 'content-type': 'application/json' },
      payload: { requestedBy: 'test-operator' },
    });
    expect(suspendRes.statusCode).toBe(200);

    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu/items/11111111-1111-4111-8111-111111111111',
      headers: {
        'x-internal-token': INTERNAL_TOKEN,
        'x-tenant-id': tenant.id,
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.headers['content-type']).toContain('application/problem+json');
    const body = res.json<{ code?: string }>();
    expect(body.code).toBe('tenancy.tenant_suspended');
  }, 60_000);

  it('POST /internal/v1/tenants/:id/resume restores active status and emits tenancy.tenant_resumed.v1', async () => {
    const slug = `resume-${randomUUID().slice(0, 8)}`;
    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);

    const suspendRes = await stack.app.inject({
      method: 'POST',
      url: `/internal/v1/tenants/${tenant.id}/suspend`,
      headers: { 'x-internal-token': INTERNAL_TOKEN, 'content-type': 'application/json' },
      payload: { requestedBy: 'test-operator' },
    });
    expect(suspendRes.statusCode).toBe(200);

    const resumeRes = await stack.app.inject({
      method: 'POST',
      url: `/internal/v1/tenants/${tenant.id}/resume`,
      headers: { 'x-internal-token': INTERNAL_TOKEN },
    });
    expect(resumeRes.statusCode).toBe(200);
    const body = resumeRes.json<{ status: string }>();
    expect(body.status).toBe('active');

    const db = stack.app.get(TenantAwareDb);
    const audit = await pollForAuditRow(db, tenant.id, 'tenancy.tenant_resumed.v1');
    expect(audit.count).toBe(1);
  }, 60_000);

  it('POST /internal/v1/tenants/:id/suspend on a suspended tenant returns 409 (operator route is reachable but operation invalid)', async () => {
    const slug = `dbl-susp-${randomUUID().slice(0, 8)}`;
    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    const first = await stack.app.inject({
      method: 'POST',
      url: `/internal/v1/tenants/${tenant.id}/suspend`,
      headers: { 'x-internal-token': INTERNAL_TOKEN, 'content-type': 'application/json' },
      payload: { requestedBy: 'test-operator' },
    });
    expect(first.statusCode).toBe(200);

    const second = await stack.app.inject({
      method: 'POST',
      url: `/internal/v1/tenants/${tenant.id}/suspend`,
      headers: { 'x-internal-token': INTERNAL_TOKEN, 'content-type': 'application/json' },
      payload: { requestedBy: 'test-operator' },
    });
    expect(second.statusCode).toBe(409);
    const body = second.json<{ code?: string }>();
    expect(body.code).toBe('tenancy.tenant_already_suspended');
  }, 60_000);

  it('POST /internal/v1/tenants/:id/resume on a non-suspended tenant returns 409', async () => {
    const slug = `not-susp-${randomUUID().slice(0, 8)}`;
    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);

    const res = await stack.app.inject({
      method: 'POST',
      url: `/internal/v1/tenants/${tenant.id}/resume`,
      headers: { 'x-internal-token': INTERNAL_TOKEN },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json<{ code?: string }>();
    expect(body.code).toBe('tenancy.tenant_not_suspended');
  }, 60_000);
});
