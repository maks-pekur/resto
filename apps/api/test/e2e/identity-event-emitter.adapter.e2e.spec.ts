import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { runInTenantContext, schema } from '@resto/db';
import { TenantId } from '@resto/domain';
import type { EventEnvelope } from '@resto/events';
import { IdentityEventEmitterAdapter } from '../../src/contexts/identity/infrastructure/identity-event-emitter.adapter';
import {
  isDockerAvailable,
  startDbStack,
  stopDbStack,
  type DbStack,
} from './helpers/with-db-stack';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[identity-event-emitter.adapter.e2e] Docker not available — skipping.');
}

const TENANT_A_ID = randomUUID();
const TENANT_B_ID = randomUUID();

const buildEnvelope = (tenantId: string | null): EventEnvelope => ({
  id: randomUUID(),
  type: 'identity.signed_in.v1',
  version: 1,
  tenantId: tenantId === null ? null : TenantId.parse(tenantId),
  correlationId: randomUUID(),
  causationId: null,
  occurredAt: new Date(),
  payload: { userId: randomUUID() },
});

suite('IdentityEventEmitterAdapter — RLS WITH CHECK on tenant-bound emits', () => {
  let stack: DbStack;
  let adapter: IdentityEventEmitterAdapter;

  beforeAll(async () => {
    stack = await startDbStack();
    adapter = new IdentityEventEmitterAdapter(stack.db);
    await stack.db.withoutTenant('seed tenants for identity emitter rls test', async (tx) => {
      await tx.insert(schema.tenants).values([
        {
          id: TENANT_A_ID,
          slug: 'emit-a',
          displayName: 'Emit Tenant A',
          locale: 'en',
          country: 'GB',
          defaultCurrency: 'USD',
        },
        {
          id: TENANT_B_ID,
          slug: 'emit-b',
          displayName: 'Emit Tenant B',
          locale: 'en',
          country: 'GB',
          defaultCurrency: 'USD',
        },
      ]);
    });
  }, 180_000);

  afterAll(async () => {
    if (stack) await stopDbStack(stack);
  });

  it('persists a tenant-bound event when ALS tenant matches envelope.tenantId', async () => {
    const envelope = buildEnvelope(TENANT_A_ID);
    await runInTenantContext({ tenantId: TENANT_A_ID }, () => adapter.emit(envelope));

    const rows = await stack.db.withoutTenant('inspect emitted row', (tx) =>
      tx.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.id, envelope.id)),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tenantId).toBe(TENANT_A_ID);
  });

  it('rejects a forged emit whose envelope.tenantId differs from the bound ALS tenant', async () => {
    const envelope = buildEnvelope(TENANT_B_ID);
    const error = await runInTenantContext({ tenantId: TENANT_A_ID }, () =>
      adapter.emit(envelope).then(
        () => null,
        (e: unknown) => e,
      ),
    );
    expect(error).toBeInstanceOf(Error);
    expect(((error as Error).cause as Error | undefined)?.message).toMatch(/row-level security/i);
  });

  it('persists a platform event (envelope.tenantId=null) via system context', async () => {
    const envelope = buildEnvelope(null);
    await adapter.emit(envelope);

    const rows = await stack.db.withoutTenant('inspect platform row', (tx) =>
      tx.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.id, envelope.id)),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tenantId).toBeNull();
  });

  it('persists a tenant-bound event when ALS is empty (BA-hook path)', async () => {
    const envelope = buildEnvelope(TENANT_A_ID);
    // NOT wrapped in runInTenantContext — simulates a Better Auth hook
    // firing outside TenantContextMiddleware (e.g. `/sign-out` request
    // that did not carry `x-tenant-slug` or a tenant-bearing host).
    // Authoritative tenantId comes from the BA session snapshot.
    await adapter.emit(envelope);

    const rows = await stack.db.withoutTenant('inspect emitted row', (tx) =>
      tx.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.id, envelope.id)),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tenantId).toBe(TENANT_A_ID);
  });
});
