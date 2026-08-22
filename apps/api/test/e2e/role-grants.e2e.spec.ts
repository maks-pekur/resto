import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
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
  console.warn('[role-grants.e2e] Docker not available — skipping integration tests.');
}

const TENANT_ID = randomUUID();

suite('Role grants — resto_app cannot DELETE', () => {
  let stack: DbStack;

  beforeAll(async () => {
    stack = await startDbStack();
    await stack.db.withoutTenant('seed tenant for role-grants test', async (tx) => {
      await tx.insert(schema.tenants).values({
        id: TENANT_ID,
        slug: 'role-grants',
        displayName: 'Role Grants Tenant',
        locale: 'en',
        country: 'GB',
        defaultCurrency: 'USD',
      });
    });
  }, 180_000);

  afterAll(async () => {
    if (stack) await stopDbStack(stack);
  });

  it('rejects DELETE under tenant context', async () => {
    await runInTenantContext({ tenantId: TENANT_ID }, async () => {
      const error = await stack.db
        .withTenant((tx) => tx.delete(schema.tenants).where(eq(schema.tenants.id, TENANT_ID)))
        .then(
          () => null,
          (e: unknown) => e,
        );
      expect(error).toBeInstanceOf(Error);
      expect(((error as Error).cause as Error | undefined)?.message).toMatch(/permission denied/i);
    });
  });

  it('rejects DELETE under system context (withoutTenant is a GUC bypass, not a role switch)', async () => {
    const error = await stack.db
      .withoutTenant('attempt delete', (tx) =>
        tx.delete(schema.tenants).where(eq(schema.tenants.id, TENANT_ID)),
      )
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(Error);
    expect(((error as Error).cause as Error | undefined)?.message).toMatch(/permission denied/i);
  });
});
