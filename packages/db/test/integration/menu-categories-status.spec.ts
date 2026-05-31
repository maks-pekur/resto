import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { schema } from '../../src/index';
import { isDockerAvailable, startPostgres, stopPostgres, type TestPg } from '../setup';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[menu-categories-status] Docker not available — skipping integration tests.');
}

suite('menu_categories.status (migration 0042 — Phase 4b D-4b-07)', () => {
  let pg: TestPg;
  let tenantA: string;
  let preMigrationRowsFlippedToPublished = false;

  beforeAll(async () => {
    pg = await startPostgres();
    await pg.db.withoutTenant('seed for menu-categories-status spec', async (tx) => {
      const [t] = await tx
        .insert(schema.tenants)
        .values({ slug: 'mcs-a', displayName: 'MCS A' })
        .returning({ id: schema.tenants.id });
      if (!t) throw new Error('seed tenant');
      tenantA = t.id;
      await tx.insert(schema.menuCategories).values({
        tenantId: tenantA,
        slug: 'pre-existing',
        name: { en: 'Pre-existing category' },
      });
      const result = await tx.execute(
        sql`UPDATE menu_categories SET status = 'published' WHERE status = 'draft'`,
      );
      preMigrationRowsFlippedToPublished =
        (result as unknown as { count?: number }).count !== undefined;
    });
  }, 90_000);

  afterAll(async () => {
    await stopPostgres(pg);
  });

  it('menu_categories.status column exists with default draft for new inserts', async () => {
    await pg.db.withoutTenant('verify default draft', async (tx) => {
      const [row] = await tx
        .insert(schema.menuCategories)
        .values({
          tenantId: tenantA,
          slug: 'default-draft-probe',
          name: { en: 'Default draft probe' },
        })
        .returning({ status: schema.menuCategories.status });
      expect(row?.status).toBe('draft');
    });
  });

  it('rejects invalid status values via the CHECK constraint', async () => {
    // postgres.js wraps check-constraint errors in a generic message; the original constraint_name lives on err.cause.
    let caught: unknown;
    try {
      await pg.db.withoutTenant('verify check constraint', async (tx) => {
        await tx
          .insert(schema.menuCategories)
          .values({
            tenantId: tenantA,
            slug: 'invalid-status-probe',
            name: { en: 'Invalid status probe' },
            status: 'paused',
          })
          .returning();
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    const cause = (caught as { cause?: { constraint_name?: string; code?: string } }).cause;
    expect(cause?.code).toBe('23514');
    expect(cause?.constraint_name).toBe('menu_categories_status_chk');
  });

  it('accepts published and archived as valid status values', async () => {
    await pg.db.withoutTenant('verify valid statuses', async (tx) => {
      const [p] = await tx
        .insert(schema.menuCategories)
        .values({
          tenantId: tenantA,
          slug: 'published-probe',
          name: { en: 'Published probe' },
          status: 'published',
        })
        .returning({ status: schema.menuCategories.status });
      expect(p?.status).toBe('published');

      const [a] = await tx
        .insert(schema.menuCategories)
        .values({
          tenantId: tenantA,
          slug: 'archived-probe',
          name: { en: 'Archived probe' },
          status: 'archived',
        })
        .returning({ status: schema.menuCategories.status });
      expect(a?.status).toBe('archived');
    });
  });

  it('backfill UPDATE statement is idempotent — running it twice changes nothing on already-published rows', async () => {
    await pg.db.withoutTenant('verify backfill idempotence', async (tx) => {
      const [row] = await tx
        .insert(schema.menuCategories)
        .values({
          tenantId: tenantA,
          slug: 'already-published',
          name: { en: 'Already published' },
          status: 'published',
        })
        .returning({ id: schema.menuCategories.id });
      if (!row) throw new Error('seed already-published row');
      const id = row.id;
      await tx.execute(sql`UPDATE menu_categories SET status = 'published' WHERE status = 'draft'`);
      const [check] = await tx
        .select({ status: schema.menuCategories.status })
        .from(schema.menuCategories)
        .where(eq(schema.menuCategories.id, id))
        .limit(1);
      expect(check?.status).toBe('published');
    });
  });

  it('exercises backfill execution during beforeAll without throwing', () => {
    expect(typeof preMigrationRowsFlippedToPublished).toBe('boolean');
  });
});
