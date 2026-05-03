import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { runInTenantContext, schema } from '@resto/db';
import {
  isDockerAvailable,
  startDbStack,
  stopDbStack,
  type DbStack,
} from './helpers/with-db-stack';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[outbox-rls.e2e] Docker not available — skipping integration tests.');
}

const TENANT_A_ID = randomUUID();
const TENANT_B_ID = randomUUID();

const baseEvent = {
  type: 'tenancy.test_event.v1',
  payload: { hello: 'world' } as Record<string, unknown>,
};

suite('Outbox RLS — INSERT policy enforcement', () => {
  let stack: DbStack;

  beforeAll(async () => {
    stack = await startDbStack();
    // Seed two tenants under admin (resto_admin) so the RLS predicates
    // have valid current_tenant_id() values to compare against.
    await stack.db.withoutTenant('seed tenants for outbox rls test', async (tx) => {
      await tx.insert(schema.tenants).values([
        {
          id: TENANT_A_ID,
          slug: 'rls-a',
          displayName: 'RLS Tenant A',
          locale: 'en',
          defaultCurrency: 'USD',
        },
        {
          id: TENANT_B_ID,
          slug: 'rls-b',
          displayName: 'RLS Tenant B',
          locale: 'en',
          defaultCurrency: 'USD',
        },
      ]);
    });
  }, 180_000);

  afterAll(async () => {
    if (stack) await stopDbStack(stack);
  });

  it('rejects platform-event spoofing (tenant_id = NULL from tenant context)', async () => {
    await runInTenantContext({ tenantId: TENANT_A_ID }, async () => {
      await expect(
        stack.db.withTenant((tx) =>
          tx.insert(schema.outboxEvents).values({
            tenantId: null,
            ...baseEvent,
          }),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('rejects cross-tenant inserts (tenant_id = B from tenant A)', async () => {
    await runInTenantContext({ tenantId: TENANT_A_ID }, async () => {
      await expect(
        stack.db.withTenant((tx) =>
          tx.insert(schema.outboxEvents).values({
            tenantId: TENANT_B_ID,
            ...baseEvent,
          }),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('accepts matching tenant_id', async () => {
    await runInTenantContext({ tenantId: TENANT_A_ID }, async () => {
      await expect(
        stack.db.withTenant((tx) =>
          tx.insert(schema.outboxEvents).values({
            tenantId: TENANT_A_ID,
            ...baseEvent,
          }),
        ),
      ).resolves.not.toThrow();
    });
  });

  it('accepts NULL tenant_id from system context (legitimate platform event)', async () => {
    await expect(
      stack.db.withoutTenant('seed platform event from test', (tx) =>
        tx.insert(schema.outboxEvents).values({
          tenantId: null,
          ...baseEvent,
        }),
      ),
    ).resolves.not.toThrow();
  });
});
