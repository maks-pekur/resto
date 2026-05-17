import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { runInTenantContext, schema } from '../../src/index';
import { isDockerAvailable, startPostgres, stopPostgres, type TestPg } from '../setup';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[with-tenant-id] Docker not available — skipping integration tests.');
}

suite('TenantAwareDb.withTenantId — explicit tenant for non-HTTP entry points', () => {
  let pg: TestPg;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    pg = await startPostgres();
    await pg.db.withoutTenant('seed tenants for withTenantId test', async (tx) => {
      const [a] = await tx
        .insert(schema.tenants)
        .values({ slug: 'wtid-a', displayName: 'WithTenantId A' })
        .returning({ id: schema.tenants.id });
      const [b] = await tx
        .insert(schema.tenants)
        .values({ slug: 'wtid-b', displayName: 'WithTenantId B' })
        .returning({ id: schema.tenants.id });
      if (!a || !b) throw new Error('Failed to seed tenants.');
      tenantA = a.id;
      tenantB = b.id;
    });
  }, 90_000);

  afterAll(async () => {
    await stopPostgres(pg);
  });

  it('binds the explicit tenant id when ALS is empty', async () => {
    const rows = await pg.db.withTenantId(tenantA, async (tx) =>
      tx.select().from(schema.tenants).where(eq(schema.tenants.id, tenantA)),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(tenantA);
  });

  it('throws when ALS is already bound (same tenant id)', async () => {
    const error = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db
        .withTenantId(tenantA, () => Promise.resolve('unreachable'))
        .then(
          () => null,
          (e: unknown) => e,
        ),
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/withTenantId.*ALS-bound/i);
  });

  it('throws when ALS is bound to a different tenant', async () => {
    const error = await runInTenantContext({ tenantId: tenantB }, () =>
      pg.db
        .withTenantId(tenantA, () => Promise.resolve('unreachable'))
        .then(
          () => null,
          (e: unknown) => e,
        ),
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/withTenantId.*ALS-bound/i);
  });

  it('rejects a malformed tenant id before opening a transaction', async () => {
    const error = await pg.db
      .withTenantId('not-a-uuid', () => Promise.resolve('unreachable'))
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/invalid tenant id/i);
  });

  it('nested withTenantId opens a new transaction with the inner tenant', async () => {
    // Documented as intentional: withTenantId does not bind ALS, so a
    // nested call passes the ALS guard and opens its own transaction.
    // No real use case today; this test pins the behaviour against
    // accidental change.
    const visibleInsideInner = await pg.db.withTenantId(tenantA, async () =>
      pg.db.withTenantId(tenantB, async (tx) =>
        tx.select().from(schema.tenants).where(eq(schema.tenants.id, tenantB)),
      ),
    );
    expect(visibleInsideInner).toHaveLength(1);
    expect(visibleInsideInner[0]?.id).toBe(tenantB);
  });
});
