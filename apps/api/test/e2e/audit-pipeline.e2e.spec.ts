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

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

const INTERNAL_TOKEN = 'integration-test-token-1234567890';

suite('Audit pipeline — provision → NATS → audit_log (RES-130)', () => {
  let stack: RealStack;

  beforeAll(async () => {
    process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';
    stack = await startRealStack();
  }, 180_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('records an audit_log row for a provisioned tenant', async () => {
    const slug = `audit-${randomUUID().slice(0, 8)}`;

    const res = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/tenants',
      headers: { 'x-internal-token': INTERNAL_TOKEN },
      payload: {
        slug,
        displayName: `Audit ${slug}`,
        country: 'GB',
        locale: 'en',
      },
    });
    expect(res.statusCode).toBe(201);
    const tenant = res.json<{ id: string }>();

    const db = stack.app.get(TenantAwareDb);

    const deadline = Date.now() + 10_000;
    let rows: { action: string; tenantId: string | null }[] = [];
    while (Date.now() < deadline) {
      rows = await db.withoutTenant('audit-pipeline e2e: poll audit_log', (tx) =>
        tx
          .select({ action: schema.auditLog.action, tenantId: schema.auditLog.tenantId })
          .from(schema.auditLog)
          .where(eq(schema.auditLog.tenantId, tenant.id)),
      );
      if (rows.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.action).toBe('tenancy.tenant_provisioned.v1');
    expect(rows[0]?.tenantId).toBe(tenant.id);
  }, 30_000);

  it('records an audit_log row when a tenant is archived (RES-89)', async () => {
    const slug = `audit-archive-${randomUUID().slice(0, 8)}`;

    const provRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/tenants',
      headers: { 'x-internal-token': INTERNAL_TOKEN },
      payload: {
        slug,
        displayName: `Audit Archive ${slug}`,
        country: 'GB',
        locale: 'en',
      },
    });
    expect(provRes.statusCode).toBe(201);
    const tenant = provRes.json<{ id: string }>();

    const archiveRes = await stack.app.inject({
      method: 'POST',
      url: `/internal/v1/tenants/${tenant.id}/archive`,
      headers: { 'x-internal-token': INTERNAL_TOKEN },
    });
    expect(archiveRes.statusCode).toBe(204);

    const db = stack.app.get(TenantAwareDb);
    const deadline = Date.now() + 10_000;
    let actions: string[] = [];
    while (Date.now() < deadline) {
      const rows = await db.withoutTenant('audit-pipeline e2e: poll archive', (tx) =>
        tx
          .select({ action: schema.auditLog.action })
          .from(schema.auditLog)
          .where(eq(schema.auditLog.tenantId, tenant.id)),
      );
      actions = rows.map((r) => r.action);
      if (actions.includes('tenancy.tenant_archived.v1')) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    expect(actions).toContain('tenancy.tenant_provisioned.v1');
    expect(actions).toContain('tenancy.tenant_archived.v1');
  }, 30_000);

  it('records exactly one row per event under at-least-once delivery', async () => {
    const slug = `audit-dedup-${randomUUID().slice(0, 8)}`;

    const res = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/tenants',
      headers: { 'x-internal-token': INTERNAL_TOKEN },
      payload: {
        slug,
        displayName: `Audit Dedup ${slug}`,
        country: 'GB',
        locale: 'en',
      },
    });
    expect(res.statusCode).toBe(201);
    const tenant = res.json<{ id: string }>();

    const db = stack.app.get(TenantAwareDb);

    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const rows = await db.withoutTenant('audit-pipeline e2e: poll audit_log dedup', (tx) =>
        tx
          .select({ action: schema.auditLog.action })
          .from(schema.auditLog)
          .where(eq(schema.auditLog.tenantId, tenant.id)),
      );
      if (rows.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
    const finalRows = await db.withoutTenant('audit-pipeline e2e: settle audit_log dedup', (tx) =>
      tx
        .select({ action: schema.auditLog.action })
        .from(schema.auditLog)
        .where(eq(schema.auditLog.tenantId, tenant.id)),
    );
    expect(finalRows).toHaveLength(1);
  }, 30_000);
});
