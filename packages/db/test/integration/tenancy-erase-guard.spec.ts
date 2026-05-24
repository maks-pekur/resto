import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { isDockerAvailable, startPostgres, stopPostgres, type TestPg } from '../setup';
import { schema } from '../../src/index';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[tenancy-erase-guard] Docker not available — skipping integration tests.');
}

const SALT = 'a'.repeat(32);
const ACTOR = 'test:tenancy-erase-guard';

suite('RES-204: tenancy_erase_tenant requires caller-specific app.allow_erasure', () => {
  let pg: TestPg;
  let tenantHappy: string;
  let tenantMismatch: string;
  let tenantPlain: string;
  let tenantSkip: string;

  beforeAll(async () => {
    pg = await startPostgres();
    await pg.db.withoutTenant('seed four guard tenants', async (tx) => {
      const [t1] = await tx
        .insert(schema.tenants)
        .values({ slug: 'erase-guard-happy', displayName: 'EG-Happy' })
        .returning({ id: schema.tenants.id });
      const [t2] = await tx
        .insert(schema.tenants)
        .values({ slug: 'erase-guard-mismatch', displayName: 'EG-Mismatch' })
        .returning({ id: schema.tenants.id });
      const [t3] = await tx
        .insert(schema.tenants)
        .values({ slug: 'erase-guard-plain', displayName: 'EG-Plain' })
        .returning({ id: schema.tenants.id });
      const [t4] = await tx
        .insert(schema.tenants)
        .values({ slug: 'erase-guard-skip', displayName: 'EG-Skip' })
        .returning({ id: schema.tenants.id });
      if (!t1 || !t2 || !t3 || !t4) throw new Error('seed tenants failed');
      tenantHappy = t1.id;
      tenantMismatch = t2.id;
      tenantPlain = t3.id;
      tenantSkip = t4.id;
    });
  }, 90_000);

  afterAll(async () => {
    await stopPostgres(pg);
  });

  it('happy: app_allow_erasure(X) + tenancy_erase_tenant(X, salt, actor) succeeds and logs platform audit row', async () => {
    await pg.db.withoutTenant('happy erase', async (tx) => {
      await tx.execute(sql`SELECT app_allow_erasure(${tenantHappy}::uuid)`);
      await tx.execute(
        sql`SELECT tenancy_erase_tenant(${tenantHappy}::uuid, ${SALT}::text, ${ACTOR}::text)`,
      );
    });

    const auditRows = await pg.db.withoutTenant('verify audit row', async (tx) =>
      tx
        .select()
        .from(schema.auditLog)
        .where(
          sql`${schema.auditLog.action} = 'tenant_erased' AND ${schema.auditLog.targetId} = ${tenantHappy}`,
        ),
    );
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]?.tenantId).toBeNull();
    expect(auditRows[0]?.actorKind).toBe('system');
    expect(auditRows[0]?.actorSubject).toBe(ACTOR);
    expect(auditRows[0]?.targetType).toBe('tenant');
    expect(auditRows[0]?.targetId).toBe(tenantHappy);
  });

  it('sad-1: tenancy_erase_tenant without prior app_allow_erasure → RAISE', async () => {
    const err = await pg.db
      .withoutTenant('skip allow_erasure', async (tx) =>
        tx.execute(
          sql`SELECT tenancy_erase_tenant(${tenantSkip}::uuid, ${SALT}::text, ${ACTOR}::text)`,
        ),
      )
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    const cause1 = (err as Error).cause;
    expect(cause1).toBeInstanceOf(Error);
    expect((cause1 as Error).message).toMatch(/app\.allow_erasure/i);
  });

  it('sad-2: app_allow_erasure(A) then tenancy_erase_tenant(B) → RAISE (mismatch)', async () => {
    const err = await pg.db
      .withoutTenant('mismatch erase', async (tx) => {
        await tx.execute(sql`SELECT app_allow_erasure(${tenantHappy}::uuid)`);
        return tx.execute(
          sql`SELECT tenancy_erase_tenant(${tenantMismatch}::uuid, ${SALT}::text, ${ACTOR}::text)`,
        );
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    const cause2 = (err as Error).cause;
    expect(cause2).toBeInstanceOf(Error);
    expect((cause2 as Error).message).toMatch(/app\.allow_erasure/i);
  });

  it('sad-3 (RES-204 regression): plain withoutTenant alone is insufficient — erase still RAISEs', async () => {
    const err = await pg.db
      .withoutTenant('plain bypass attempt', async (tx) =>
        tx.execute(
          sql`SELECT tenancy_erase_tenant(${tenantPlain}::uuid, ${SALT}::text, ${ACTOR}::text)`,
        ),
      )
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
  });
});
