import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isDockerAvailable, startPostgres, stopPostgres, type TestPg } from '../setup';
import { runInTenantContext, schema } from '../../src/index';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[brands-rls] Docker not available — skipping integration tests.');
}

suite('brands — RLS + constraints', () => {
  let pg: TestPg;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    pg = await startPostgres();

    await pg.db.withoutTenant('seed two tenants for brands-rls test', async (tx) => {
      const [a] = await tx
        .insert(schema.tenants)
        .values({ slug: 'cafe-a', displayName: 'Cafe A' })
        .returning({ id: schema.tenants.id });
      const [b] = await tx
        .insert(schema.tenants)
        .values({ slug: 'cafe-b', displayName: 'Cafe B' })
        .returning({ id: schema.tenants.id });
      if (!a || !b) throw new Error('Failed to seed tenants.');
      tenantA = a.id;
      tenantB = b.id;
    });
  }, 90_000);

  afterAll(async () => {
    await stopPostgres(pg);
  });

  it('a tenant context inserting its own brand succeeds', async () => {
    await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) => {
        const [row] = await tx
          .insert(schema.brands)
          .values({ tenantId: tenantA, slug: 'z-burger', displayName: 'Z Burger' })
          .returning({ id: schema.brands.id });
        expect(row?.id).toBeDefined();
      }),
    );
  });

  it('inserting a brand with the wrong tenant_id fails the WITH CHECK clause', async () => {
    const error = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) =>
        tx
          .insert(schema.brands)
          .values({ tenantId: tenantB, slug: 'sneaky', displayName: 'Sneaky' })
          .returning(),
      ),
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    const cause = (error as Error).cause;
    expect((cause as Error | undefined)?.message).toMatch(/row-level security|policy/i);
  });

  it('a tenant context sees only its own brands', async () => {
    await pg.db.withoutTenant('seed brand for tenant B', async (tx) => {
      await tx
        .insert(schema.brands)
        .values({ tenantId: tenantB, slug: 'sushi-master', displayName: 'Sushi Master' });
    });

    const fromA = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) => tx.select().from(schema.brands)),
    );
    const fromB = await runInTenantContext({ tenantId: tenantB }, () =>
      pg.db.withTenant(async (tx) => tx.select().from(schema.brands)),
    );

    expect(fromA.every((r) => r.tenantId === tenantA)).toBe(true);
    expect(fromB.every((r) => r.tenantId === tenantB)).toBe(true);
    expect(fromA.length).toBeGreaterThan(0);
    expect(fromB.length).toBeGreaterThan(0);
  });

  it('rejects duplicate slug within the same tenant', async () => {
    await pg.db.withoutTenant('seed first burger', async (tx) => {
      await tx
        .insert(schema.brands)
        .values({ tenantId: tenantA, slug: 'dup-burger', displayName: 'Dup 1' });
    });
    const error = await pg.db
      .withoutTenant('insert duplicate', async (tx) => {
        await tx
          .insert(schema.brands)
          .values({ tenantId: tenantA, slug: 'dup-burger', displayName: 'Dup 2' });
      })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(Error);
    expect(((error as Error).cause as Error | undefined)?.message).toMatch(/unique|duplicate/i);
  });

  it('rejects the same slug across two tenants (global UQ on non-erased)', async () => {
    const error = await pg.db
      .withoutTenant('insert same slug under tenant B', async (tx) => {
        await tx
          .insert(schema.brands)
          .values({ tenantId: tenantB, slug: 'z-burger', displayName: 'Z Burger B' });
      })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(Error);
    expect(((error as Error).cause as Error | undefined)?.message).toMatch(/unique|duplicate/i);
  });

  it('rejects malformed slugs', async () => {
    const error = await pg.db
      .withoutTenant('insert bad slug', async (tx) => {
        await tx
          .insert(schema.brands)
          .values({ tenantId: tenantA, slug: 'BadSlug!', displayName: 'Bad' });
      })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(Error);
    expect(((error as Error).cause as Error | undefined)?.message).toMatch(/check|chk/i);
  });

  it('rejects unknown legal_form values', async () => {
    const error = await pg.db
      .withoutTenant('insert bad legal form', async (tx) => {
        await tx.insert(schema.brands).values({
          tenantId: tenantA,
          slug: 'legal-form-test',
          displayName: 'LegalForm',
          legalForm: 'BOGUS',
        });
      })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(Error);
    expect(((error as Error).cause as Error | undefined)?.message).toMatch(/check|chk/i);
  });
});
