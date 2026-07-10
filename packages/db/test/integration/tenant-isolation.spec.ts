import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { isDockerAvailable, startPostgres, stopPostgres, type TestPg } from '../setup';
import postgres from 'postgres';
import {
  assertSetConfigRevoked,
  assertTenantLockInstalled,
  runInTenantContext,
  schema,
  SetConfigNotRevokedError,
  TenantLockNotInstalledError,
} from '../../src/index';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[tenant-isolation] Docker not available — skipping integration tests.');
}

suite('Row-Level Security — tenant isolation', () => {
  let pg: TestPg;
  let tenantA: string;
  let tenantB: string;
  let brandA: string;
  let brandB: string;

  beforeAll(async () => {
    pg = await startPostgres();

    await pg.db.withoutTenant('seed two tenants', async (tx) => {
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

      const [ba] = await tx
        .insert(schema.brands)
        .values({ tenantId: tenantA, slug: 'cafe-a-brand', displayName: 'Cafe A Brand' })
        .returning({ id: schema.brands.id });
      const [bb] = await tx
        .insert(schema.brands)
        .values({ tenantId: tenantB, slug: 'cafe-b-brand', displayName: 'Cafe B Brand' })
        .returning({ id: schema.brands.id });
      if (!ba || !bb) throw new Error('Failed to seed brands.');
      brandA = ba.id;
      brandB = bb.id;

      await tx.insert(schema.menuCategories).values([
        { tenantId: tenantA, brandId: brandA, slug: 'pizza', name: { en: 'Pizza' } },
        { tenantId: tenantB, brandId: brandB, slug: 'pizza', name: { en: 'Pizza' } },
      ]);
    });
  }, 90_000);

  afterAll(async () => {
    await stopPostgres(pg);
  });

  it('every table with a tenant_id column has RLS ENABLED + FORCED (HIGH-10)', async () => {
    const rows = await pg.db.withoutTenant('audit rls flags', async (tx) =>
      tx.execute(sql`
        SELECT c.relname AS table_name,
               c.relrowsecurity AS enabled,
               c.relforcerowsecurity AS forced
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
        WHERE c.relkind = 'r'
          AND EXISTS (
            SELECT 1 FROM information_schema.columns col
            WHERE col.table_schema = 'public'
              AND col.table_name = c.relname
              AND col.column_name = 'tenant_id'
          )
      `),
    );
    const tables = rows as unknown as readonly {
      table_name: string;
      enabled: boolean;
      forced: boolean;
    }[];
    expect(tables.length).toBeGreaterThan(0);
    const offenders = tables.filter((t) => !t.enabled || !t.forced).map((t) => t.table_name);
    expect(offenders).toEqual([]);
  });

  it('a tenant context sees only its own tenant row', async () => {
    const visible = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) => tx.select().from(schema.tenants)),
    );
    expect(visible).toHaveLength(1);
    expect(visible[0]?.id).toBe(tenantA);
  });

  it('a tenant context sees only its own categories', async () => {
    const fromA = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) => tx.select().from(schema.menuCategories)),
    );
    const fromB = await runInTenantContext({ tenantId: tenantB }, () =>
      pg.db.withTenant(async (tx) => tx.select().from(schema.menuCategories)),
    );
    expect(fromA).toHaveLength(1);
    expect(fromA[0]?.tenantId).toBe(tenantA);
    expect(fromB).toHaveLength(1);
    expect(fromB[0]?.tenantId).toBe(tenantB);
  });

  it('inserting a row with the wrong tenant_id fails the WITH CHECK clause', async () => {
    const error = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) =>
        tx
          .insert(schema.menuCategories)
          .values({ tenantId: tenantB, brandId: brandB, slug: 'sneaky', name: { en: 'Sneaky' } })
          .returning(),
      ),
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    const cause = (error as Error).cause;
    expect(cause).toBeInstanceOf(Error);
    expect((cause as Error).message).toMatch(/row-level security|policy/i);
  });

  it('withoutTenant() sees rows across all tenants', async () => {
    const all = await pg.db.withoutTenant('test cross-tenant read', async (tx) =>
      tx.select().from(schema.menuCategories),
    );
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('RES-243: forge via SET LOCAL is caught by drift sentinel', async () => {
    // REVOKE EXECUTE on set_config does not block the top-level `SET LOCAL`
    // SQL command — Postgres has no privilege mechanism for that on custom
    // GUCs. The end-of-callback drift sentinel is the defense.
    const error = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant = '${tenantB}'`));
        return tx.select().from(schema.tenants);
      }),
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/Tenant GUC drift detected/);
  });

  it('RES-243: forge via RESET is caught by drift sentinel', async () => {
    const error = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) => {
        await tx.execute(sql`RESET app.current_tenant`);
        return tx.select().from(schema.tenants);
      }),
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/Tenant GUC drift detected/);
  });

  it('RES-243: binding a tenant inside withoutTenant is caught', async () => {
    // Outer `withoutTenant` expects current_tenant=''. If a callback rebinds
    // to a tenant uuid, the wrapper allows the transition (current was '')
    // but the outer drift sentinel catches it on exit.
    const error = await pg.db
      .withoutTenant('test cross-context binding', async (tx) => {
        await tx.execute(sql`SELECT app_bind_tenant(${tenantA}, false)`);
        return tx.select().from(schema.tenants);
      })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/Tenant GUC drift detected in withoutTenant/);
  });

  it('RES-238: withoutTenant nesting withTenant throws (ALS not bound)', async () => {
    // Per README "Tenant context wrappers — formal contract" §Nesting:
    // `withoutTenant` does not bind ALS — it only opens a transaction and
    // sets the SQL-session GUC to `''`. An inner `db.withTenant(...)` calls
    // `requireTenantContext()` first, which throws because no ALS frame is
    // bound. Documents the JS-level guard that prevents accidental
    // cross-context wrapper nesting.
    const error = await pg.db
      .withoutTenant('test withTenant-inside-withoutTenant guard', async () =>
        pg.db.withTenant(async (tx) => tx.select().from(schema.tenants)),
      )
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/No tenant context bound/i);
  });

  it('RES-238: withTenant holds tx open across setTimeout resolution', async () => {
    // Per README "Tenant context wrappers — formal contract" §Async boundary:
    // the wrapper awaits the entire promise returned by `op` before running
    // #assertGucUnchanged and committing. A callback that resolves via
    // setTimeout keeps the transaction open for that duration; the awaited
    // tx still resolves queries correctly once the timeout fires. Guards
    // against an accidental refactor that would short-circuit the await.
    const result = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) => {
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        const rows = await tx.select().from(schema.tenants);
        return rows.map((r) => r.id);
      }),
    );
    expect(result).toEqual([tenantA]);
  });

  it("attempting to UPDATE another tenant's row is blocked", async () => {
    const updated = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) =>
        tx
          .update(schema.tenants)
          .set({ displayName: 'Hacked' })
          .where(sql`${schema.tenants.id} = ${tenantB}`)
          .returning(),
      ),
    );
    expect(updated).toHaveLength(0);

    const stillIntact = await pg.db.withoutTenant('verify integrity', async (tx) =>
      tx
        .select()
        .from(schema.tenants)
        .where(sql`${schema.tenants.id} = ${tenantB}`),
    );
    expect(stillIntact[0]?.displayName).toBe('Cafe B');
  });

  it('queries on menu_items use the (tenant_id, status, sort_order) index', async () => {
    const explanation = await pg.db.withoutTenant('inspect plan', async (tx) => {
      // Seed enough rows that the planner prefers index over seq scan.
      const cat = await tx
        .insert(schema.menuCategories)
        .values({ tenantId: tenantA, brandId: brandA, slug: 'drinks', name: { en: 'Drinks' } })
        .returning({ id: schema.menuCategories.id });
      const created = cat[0];
      if (!created) throw new Error('Failed to seed drinks category.');
      const catId = created.id;

      const items = Array.from({ length: 200 }, (_, i) => ({
        tenantId: tenantA,
        brandId: brandA,
        categoryId: catId,
        slug: `item-${i.toString().padStart(3, '0')}`,
        name: { en: `Item ${i.toString()}` },
        basePrice: '9.99',
        currency: 'USD',
        status: 'published' as const,
      }));
      await tx.insert(schema.menuItems).values(items);
      await tx.execute(sql`ANALYZE menu_items`);

      const rows = await tx.execute<{ 'QUERY PLAN': string }>(
        sql`EXPLAIN SELECT id FROM menu_items WHERE tenant_id = ${tenantA} AND status = 'published' ORDER BY sort_order LIMIT 50`,
      );
      return rows.map((r) => r['QUERY PLAN']).join('\n');
    });

    expect(explanation).toMatch(/Index/);
  });

  it('RES-243: forge via set_config() is blocked at the role level', async () => {
    // After migration 0023, `pg_catalog.set_config(text, text, boolean)` is
    // REVOKED from PUBLIC. resto_app can no longer call set_config directly;
    // attempting to do so inside a withTenant block fails immediately with
    // SQLSTATE 42501 — the transaction rolls back before the drift sentinel
    // would have had a chance to fire.
    const error = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.current_tenant', ${tenantB}, true)`);
        return tx.select().from(schema.tenants);
      }),
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    const cause = (error as Error).cause as { code?: string } | undefined;
    expect(cause?.code).toBe('42501');
  });

  it('RES-243: rebind to a different tenant via app_bind_tenant raises', async () => {
    const error = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) => {
        await tx.execute(sql`SELECT app_bind_tenant(${tenantB}, false)`);
        return tx.select().from(schema.tenants);
      }),
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    const cause = (error as Error).cause as { code?: string; message?: string } | undefined;
    expect(cause?.code).toBe('42501');
    expect(cause?.message).toContain(tenantA);
    expect(cause?.message).toContain(tenantB);
  });

  it('RES-243: rebind to the same tenant via app_bind_tenant is idempotent', async () => {
    // Same-tenant rebind is a documented no-op of the wrapper contract;
    // exists so nested `withTenant` calls compose cleanly even though
    // current code has no such nesting.
    const rows = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) => {
        await tx.execute(sql`SELECT app_bind_tenant(${tenantA}, false)`);
        return tx.select().from(schema.tenants);
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(tenantA);
  });

  /*
   * ── Plan 04a-07 cross-tenant matrix for new entities ──
   *
   * 5 tables added in Phase 04a need the same cross-tenant invariants as
   * `menu_categories` / `menu_items`:
   *   • menu_stop_list           (D-4a-10)
   *   • menu_item_slug_aliases   (D-4a-04)
   *   • menu_item_sizes          (renamed from menu_variants)
   *   • menu_modifier_groups     (renamed from menu_modifiers)
   *   • menu_item_modifier_groups (renamed junction)
   *
   * For each: tenant A inserts a row, tenant B's SELECT returns zero rows
   * (RLS denies visibility), and tenant B's INSERT with tenant A's
   * parent ids errors (composite FK rejects since the child must declare
   * tenant_id matching its parent).
   *
   * `menu_modifier_options` rides on `menu_modifier_groups` (same composite-
   * FK shape) and is covered by the modifier-group's matrix indirectly.
   */
  describe('Plan 04a-07: cross-tenant matrix for renamed + new tables', () => {
    let aItemId: string;
    let aModifierGroupId: string;
    let aLocationId: string;
    let bLocationId: string;

    beforeAll(async () => {
      await pg.db.withoutTenant('seed items for plan 04a-07 cross-tenant matrix', async (tx) => {
        const [aLoc] = await tx
          .insert(schema.locations)
          .values({ tenantId: tenantA, brandId: brandA, name: 'Plan 04a-07 A Location' })
          .returning({ id: schema.locations.id });
        const [bLoc] = await tx
          .insert(schema.locations)
          .values({ tenantId: tenantB, brandId: brandB, name: 'Plan 04a-07 B Location' })
          .returning({ id: schema.locations.id });
        if (!aLoc || !bLoc) throw new Error('Cross-tenant seed: location create failed.');
        aLocationId = aLoc.id;
        bLocationId = bLoc.id;

        const [aCat] = await tx
          .insert(schema.menuCategories)
          .values({ tenantId: tenantA, brandId: brandA, slug: 'iso-a-cat', name: { en: 'IsoA' } })
          .returning({ id: schema.menuCategories.id });
        const [bCat] = await tx
          .insert(schema.menuCategories)
          .values({ tenantId: tenantB, brandId: brandB, slug: 'iso-b-cat', name: { en: 'IsoB' } })
          .returning({ id: schema.menuCategories.id });
        if (!aCat || !bCat) throw new Error('Cross-tenant seed: category create failed.');

        const [aItem] = await tx
          .insert(schema.menuItems)
          .values({
            tenantId: tenantA,
            brandId: brandA,
            categoryId: aCat.id,
            slug: 'iso-a-item',
            name: { en: 'IsoAItem' },
            basePrice: '1.00',
            currency: 'USD',
          })
          .returning({ id: schema.menuItems.id });
        // Tenant B is seeded with its own item so the schema integrity
        // checks (cross-tenant matrix) exercise a populated table on both
        // sides — even though the assertions only inspect tenant A's row.
        await tx.insert(schema.menuItems).values({
          tenantId: tenantB,
          brandId: brandB,
          categoryId: bCat.id,
          slug: 'iso-b-item',
          name: { en: 'IsoBItem' },
          basePrice: '1.00',
          currency: 'USD',
        });
        if (!aItem) throw new Error('Cross-tenant seed: item create failed.');
        aItemId = aItem.id;

        const [aGroup] = await tx
          .insert(schema.menuModifierGroups)
          .values({
            tenantId: tenantA,
            brandId: brandA,
            name: { en: 'IsoAGroup' },
            minSelectable: 0,
            maxSelectable: 1,
            isRequired: false,
          })
          .returning({ id: schema.menuModifierGroups.id });
        if (!aGroup) throw new Error('Cross-tenant seed: modifier group create failed.');
        aModifierGroupId = aGroup.id;
      });

      // Insert tenant-A rows into the 5 new tables via tenant-A context so
      // RLS/ScopedTx is the path of record.
      await runInTenantContext({ tenantId: tenantA }, () =>
        pg.db.withTenant(async (tx) => {
          await tx.insert(schema.menuStopList).values({
            tenantId: tenantA,
            itemId: aItemId,
            locationId: aLocationId,
            reason: 'iso fixture',
            stoppedByUserId: null,
          });
          await tx.insert(schema.menuItemSlugAliases).values({
            tenantId: tenantA,
            itemId: aItemId,
            alias: 'iso-a-alias',
          });
          await tx.insert(schema.menuItemSizes).values({
            tenantId: tenantA,
            brandId: brandA,
            menuItemId: aItemId,
            name: { en: 'Large' },
            price: '2.00',
            isDefault: false,
            sortOrder: 0,
          });
          await tx.insert(schema.menuItemModifierGroups).values({
            tenantId: tenantA,
            brandId: brandA,
            menuItemId: aItemId,
            modifierGroupId: aModifierGroupId,
            sortOrder: 0,
          });
        }),
      );
    }, 60_000);

    it('menu_stop_list: tenant B sees zero of tenant A rows', async () => {
      const fromB = await runInTenantContext({ tenantId: tenantB }, () =>
        pg.db.withTenant(async (tx) => tx.select().from(schema.menuStopList)),
      );
      expect(fromB).toHaveLength(0);
    });

    it('menu_stop_list: tenant B INSERT with tenant A item_id is rejected (composite FK)', async () => {
      const error = await runInTenantContext({ tenantId: tenantB }, () =>
        pg.db.withTenant(async (tx) =>
          tx.insert(schema.menuStopList).values({
            tenantId: tenantB,
            itemId: aItemId,
            locationId: bLocationId,
            reason: null,
            stoppedByUserId: null,
          }),
        ),
      ).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(Error);
    });

    it('menu_stop_list: location-grain binding to A returns A row only, hidden when bound to B', async () => {
      const boundToA = await runInTenantContext(
        { tenantId: tenantA, locationId: aLocationId },
        () => pg.db.withTenant(async (tx) => tx.select().from(schema.menuStopList)),
      );
      expect(boundToA.map((r) => r.itemId)).toContain(aItemId);

      const [otherLocation] = await pg.db.withoutTenant(
        'seed sibling location for menu_stop_list location-grain check',
        async (tx) =>
          tx
            .insert(schema.locations)
            .values({ tenantId: tenantA, brandId: brandA, name: 'Sibling Location' })
            .returning({ id: schema.locations.id }),
      );
      if (!otherLocation) throw new Error('sibling location seed failed');

      const boundToSibling = await runInTenantContext(
        { tenantId: tenantA, locationId: otherLocation.id },
        () => pg.db.withTenant(async (tx) => tx.select().from(schema.menuStopList)),
      );
      expect(boundToSibling.map((r) => r.itemId)).not.toContain(aItemId);
    });

    it('catalog_location_stop_version: tenant B sees zero of tenant A rows', async () => {
      await pg.db.withoutTenant('bump A location stop version for isolation check', async (tx) => {
        await tx
          .insert(schema.catalogLocationStopVersion)
          .values({ locationId: aLocationId, tenantId: tenantA })
          .onConflictDoNothing();
      });

      const fromB = await runInTenantContext({ tenantId: tenantB }, () =>
        pg.db.withTenant(async (tx) => tx.select().from(schema.catalogLocationStopVersion)),
      );
      expect(fromB).toHaveLength(0);
    });

    it('catalog_location_stop_version: tenant B INSERT with tenant A location_id is rejected (composite FK)', async () => {
      const error = await runInTenantContext({ tenantId: tenantB }, () =>
        pg.db.withTenant(async (tx) =>
          tx.insert(schema.catalogLocationStopVersion).values({
            locationId: aLocationId,
            tenantId: tenantB,
          }),
        ),
      ).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(Error);
    });

    it('menu_item_slug_aliases: tenant B sees zero of tenant A rows', async () => {
      const fromB = await runInTenantContext({ tenantId: tenantB }, () =>
        pg.db.withTenant(async (tx) => tx.select().from(schema.menuItemSlugAliases)),
      );
      expect(fromB).toHaveLength(0);
    });

    it('menu_item_slug_aliases: tenant B INSERT with tenant A item_id is rejected', async () => {
      const error = await runInTenantContext({ tenantId: tenantB }, () =>
        pg.db.withTenant(async (tx) =>
          tx.insert(schema.menuItemSlugAliases).values({
            tenantId: tenantB,
            itemId: aItemId,
            alias: 'b-tries-a',
          }),
        ),
      ).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(Error);
    });

    it('menu_item_sizes: tenant B sees zero of tenant A rows', async () => {
      const fromB = await runInTenantContext({ tenantId: tenantB }, () =>
        pg.db.withTenant(async (tx) => tx.select().from(schema.menuItemSizes)),
      );
      expect(fromB).toHaveLength(0);
    });

    it('menu_item_sizes: tenant B INSERT with tenant A menu_item_id is rejected', async () => {
      const error = await runInTenantContext({ tenantId: tenantB }, () =>
        pg.db.withTenant(async (tx) =>
          tx.insert(schema.menuItemSizes).values({
            tenantId: tenantB,
            brandId: brandB,
            menuItemId: aItemId,
            name: { en: 'sneaky' },
            price: '1.00',
            isDefault: false,
            sortOrder: 0,
          }),
        ),
      ).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(Error);
    });

    it('menu_modifier_groups: tenant B sees zero of tenant A rows', async () => {
      const fromB = await runInTenantContext({ tenantId: tenantB }, () =>
        pg.db.withTenant(async (tx) =>
          tx
            .select()
            .from(schema.menuModifierGroups)
            .where(sql`${schema.menuModifierGroups.id} = ${aModifierGroupId}`),
        ),
      );
      expect(fromB).toHaveLength(0);
    });

    it('menu_modifier_groups: tenant B INSERT with tenant A id is rejected', async () => {
      const error = await runInTenantContext({ tenantId: tenantB }, () =>
        pg.db.withTenant(async (tx) =>
          tx.insert(schema.menuModifierGroups).values({
            id: aModifierGroupId,
            tenantId: tenantB,
            brandId: brandB,
            name: { en: 'sneaky' },
            minSelectable: 0,
            maxSelectable: 1,
            isRequired: false,
          }),
        ),
      ).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(Error);
    });

    it('menu_item_modifier_groups: tenant B sees zero of tenant A rows', async () => {
      const fromB = await runInTenantContext({ tenantId: tenantB }, () =>
        pg.db.withTenant(async (tx) => tx.select().from(schema.menuItemModifierGroups)),
      );
      expect(fromB).toHaveLength(0);
    });

    it('menu_item_modifier_groups: tenant B INSERT with tenant A ids is rejected', async () => {
      const error = await runInTenantContext({ tenantId: tenantB }, () =>
        pg.db.withTenant(async (tx) =>
          tx.insert(schema.menuItemModifierGroups).values({
            tenantId: tenantB,
            brandId: brandB,
            menuItemId: aItemId,
            modifierGroupId: aModifierGroupId,
            sortOrder: 0,
          }),
        ),
      ).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(Error);
    });
  });

  it('requires an explicit brand_id on menu_categories (NOT NULL column)', async () => {
    const [brand] = await pg.db.withoutTenant('seed brand for column smoke', async (tx) =>
      tx
        .insert(schema.brands)
        .values({ tenantId: tenantA, slug: 'col-smoke', displayName: 'ColSmoke' })
        .returning({ id: schema.brands.id }),
    );
    if (!brand) throw new Error('seed failed');

    await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) => {
        await tx.insert(schema.menuCategories).values({
          tenantId: tenantA,
          slug: 'col-smoke-cat',
          name: { en: 'ColSmoke' },
          brandId: brand.id,
        });
      }),
    );

    const error = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) => {
        await tx.insert(schema.menuCategories).values({
          tenantId: tenantA,
          slug: 'col-smoke-cat-2',
          name: { en: 'ColSmoke2' },
          brandId: null as never,
        });
      }),
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    const cause = (error as Error).cause as { code?: string } | undefined;
    expect(cause?.code).toBe('23502');
  });

  describe('ORD-06: cross-tenant matrix for orders / order_items', () => {
    let aOrderId: string;
    let aOrderLocationId: string;
    let bOrderLocationId: string;

    beforeAll(async () => {
      await pg.db.withoutTenant('seed order for ORD-06 cross-tenant matrix', async (tx) => {
        const [aLoc] = await tx
          .insert(schema.locations)
          .values({ tenantId: tenantA, brandId: brandA, name: 'ORD-06 A Location' })
          .returning({ id: schema.locations.id });
        const [bLoc] = await tx
          .insert(schema.locations)
          .values({ tenantId: tenantB, brandId: brandB, name: 'ORD-06 B Location' })
          .returning({ id: schema.locations.id });
        if (!aLoc || !bLoc) throw new Error('ORD-06 seed: location insert failed.');
        aOrderLocationId = aLoc.id;
        bOrderLocationId = bLoc.id;

        const [order] = await tx
          .insert(schema.orders)
          .values({
            tenantId: tenantA,
            brandId: brandA,
            locationId: aOrderLocationId,
            idempotencyKey: 'ord06-idem-key-a',
            orderNumber: '20260614-ORD06',
            status: 'created',
            fulfillmentMode: 'pickup',
            customerName: 'Iso Tester',
            customerPhone: '+10000000000',
            subtotal: '10.00',
            deliveryFee: '0.00',
            serviceFee: '0.00',
            discount: '0.00',
            total: '10.00',
            currency: 'USD',
          })
          .returning({ id: schema.orders.id });
        if (!order) throw new Error('ORD-06 seed: order insert failed.');
        aOrderId = order.id;

        await tx.insert(schema.orderItems).values({
          tenantId: tenantA,
          orderId: aOrderId,
          menuItemId: '00000000-0000-0000-0000-000000000001',
          nameSnapshot: 'Iso Item',
          unitPrice: '10.00',
          quantity: 1,
          lineTotal: '10.00',
          currency: 'USD',
          sortOrder: 0,
        });
      });
    }, 60_000);

    it('orders: tenant B sees zero of tenant A rows', async () => {
      const fromB = await runInTenantContext({ tenantId: tenantB }, () =>
        pg.db.withTenant(async (tx) =>
          tx
            .select()
            .from(schema.orders)
            .where(sql`${schema.orders.id} = ${aOrderId}`),
        ),
      );
      expect(fromB).toHaveLength(0);
    });

    it('orders: tenant B INSERT with tenant A brand_id is rejected (composite FK)', async () => {
      const error = await runInTenantContext({ tenantId: tenantB }, () =>
        pg.db.withTenant(async (tx) =>
          tx.insert(schema.orders).values({
            tenantId: tenantB,
            brandId: brandA,
            locationId: bOrderLocationId,
            idempotencyKey: 'ord06-idem-cross',
            orderNumber: '20260614-CROSS',
            status: 'created',
            fulfillmentMode: 'pickup',
            customerName: 'Cross Tester',
            customerPhone: '+10000000001',
            subtotal: '5.00',
            deliveryFee: '0.00',
            serviceFee: '0.00',
            discount: '0.00',
            total: '5.00',
            currency: 'USD',
          }),
        ),
      ).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(Error);
    });

    it('orders: tenant B INSERT with tenant A location_id is rejected (composite FK)', async () => {
      const error = await runInTenantContext({ tenantId: tenantB }, () =>
        pg.db.withTenant(async (tx) =>
          tx.insert(schema.orders).values({
            tenantId: tenantB,
            brandId: brandB,
            locationId: aOrderLocationId,
            idempotencyKey: 'ord06-idem-cross-location',
            orderNumber: '20260614-CROSS-LOC',
            status: 'created',
            fulfillmentMode: 'pickup',
            customerName: 'Cross Location Tester',
            customerPhone: '+10000000002',
            subtotal: '5.00',
            deliveryFee: '0.00',
            serviceFee: '0.00',
            discount: '0.00',
            total: '5.00',
            currency: 'USD',
          }),
        ),
      ).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(Error);
    });

    it('orders: location-grain binding to A returns A row only, hidden when bound to sibling location', async () => {
      const boundToA = await runInTenantContext(
        { tenantId: tenantA, locationId: aOrderLocationId },
        () => pg.db.withTenant(async (tx) => tx.select().from(schema.orders)),
      );
      expect(boundToA.map((r) => r.id)).toContain(aOrderId);

      const [siblingLocation] = await pg.db.withoutTenant(
        'seed sibling location for orders location-grain check',
        async (tx) =>
          tx
            .insert(schema.locations)
            .values({ tenantId: tenantA, brandId: brandA, name: 'ORD-06 Sibling Location' })
            .returning({ id: schema.locations.id }),
      );
      if (!siblingLocation) throw new Error('ORD-06 seed: sibling location insert failed.');

      const boundToSibling = await runInTenantContext(
        { tenantId: tenantA, locationId: siblingLocation.id },
        () => pg.db.withTenant(async (tx) => tx.select().from(schema.orders)),
      );
      expect(boundToSibling.map((r) => r.id)).not.toContain(aOrderId);
    });

    it('order_items: tenant B sees zero of tenant A order_items rows', async () => {
      const fromB = await runInTenantContext({ tenantId: tenantB }, () =>
        pg.db.withTenant(async (tx) =>
          tx
            .select()
            .from(schema.orderItems)
            .where(sql`${schema.orderItems.orderId} = ${aOrderId}`),
        ),
      );
      expect(fromB).toHaveLength(0);
    });

    it('order_items: tenant B INSERT with tenant A order_id is rejected (composite FK)', async () => {
      const error = await runInTenantContext({ tenantId: tenantB }, () =>
        pg.db.withTenant(async (tx) =>
          tx.insert(schema.orderItems).values({
            tenantId: tenantB,
            orderId: aOrderId,
            menuItemId: '00000000-0000-0000-0000-000000000002',
            nameSnapshot: 'Cross Item',
            unitPrice: '5.00',
            quantity: 1,
            lineTotal: '5.00',
            currency: 'USD',
            sortOrder: 0,
          }),
        ),
      ).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(Error);
    });
  });

  /*
   * ── 08.4-01: cross-tenant matrix for locations + member_location_scope ──
   *
   * `locations` is brand-grain isolated (composite FK to brands, same
   * shape as menu_categories/orders): tenant B's SELECT returns zero rows
   * and a cross-tenant INSERT carrying tenant A's brand_id is rejected by
   * the composite FK.
   *
   * `member_location_scope` is tenant-grain ONLY (Tier 3 — mirrors the
   * absence of any scoped policy for member_brand_scope): tenant B's
   * SELECT returns zero rows of tenant A's scope.
   */
  describe('08.4 locations: brand-grain isolation', () => {
    let aLocationId: string;

    beforeAll(async () => {
      await pg.db.withoutTenant('seed location for 08.4 cross-tenant matrix', async (tx) => {
        const [location] = await tx
          .insert(schema.locations)
          .values({ tenantId: tenantA, brandId: brandA, name: 'Iso A Location' })
          .returning({ id: schema.locations.id });
        if (!location) throw new Error('08.4 seed: location insert failed.');
        aLocationId = location.id;
      });
    }, 60_000);

    it('tenant B sees zero of tenant A locations', async () => {
      const fromB = await runInTenantContext({ tenantId: tenantB }, () =>
        pg.db.withTenant(async (tx) =>
          tx
            .select()
            .from(schema.locations)
            .where(sql`${schema.locations.id} = ${aLocationId}`),
        ),
      );
      expect(fromB).toHaveLength(0);
    });

    it('tenant B INSERT with tenant A brand_id is rejected (composite FK)', async () => {
      const error = await runInTenantContext({ tenantId: tenantB }, () =>
        pg.db.withTenant(async (tx) =>
          tx.insert(schema.locations).values({
            tenantId: tenantB,
            brandId: brandA,
            name: 'Cross Tenant Location',
          }),
        ),
      ).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('08.4 member_location_scope: tenant-grain isolation', () => {
    beforeAll(async () => {
      await pg.db.withoutTenant(
        'seed member_location_scope for 08.4 cross-tenant matrix',
        async (tx) => {
          const [location] = await tx
            .insert(schema.locations)
            .values({ tenantId: tenantA, brandId: brandA, name: 'Iso A Scope Location' })
            .returning({ id: schema.locations.id });
          if (!location) throw new Error('08.4 seed: scope location insert failed.');

          const userId = 'user-08-4-01-mls';
          await tx.insert(schema.user).values({
            id: userId,
            email: 'mls-08-4-01@test',
            emailVerified: true,
            name: '08.4-01 MLS test',
          });

          const memberId = 'member-08-4-01-mls';
          await tx.insert(schema.member).values({
            id: memberId,
            userId,
            organizationId: tenantA,
            role: 'staff',
            createdAt: new Date(),
          });

          await tx.insert(schema.memberLocationScope).values({
            tenantId: tenantA,
            locationId: location.id,
            memberId,
            role: 'staff',
          });
        },
      );
    }, 60_000);

    it('tenant B sees zero of tenant A member_location_scope rows', async () => {
      const fromB = await runInTenantContext({ tenantId: tenantB }, () =>
        pg.db.withTenant(async (tx) => tx.select().from(schema.memberLocationScope)),
      );
      expect(fromB).toHaveLength(0);
    });
  });

  describe('preflight (RES-243)', () => {
    it('assertTenantLockInstalled passes on a freshly-migrated DB', async () => {
      await expect(assertTenantLockInstalled(pg.url)).resolves.toBeUndefined();
    });

    it('assertTenantLockInstalled throws when the wrapper is dropped', async () => {
      const adminClient = postgres(pg.adminUrl, { max: 1, prepare: false });
      try {
        await adminClient`DROP FUNCTION IF EXISTS app_bind_tenant(text, boolean)`;
        await expect(assertTenantLockInstalled(pg.url)).rejects.toBeInstanceOf(
          TenantLockNotInstalledError,
        );
      } finally {
        // Restore so subsequent tests aren't poisoned (singleFork: true).
        await adminClient.unsafe(`
          CREATE OR REPLACE FUNCTION app_bind_tenant(p_tenant TEXT, p_is_system BOOLEAN)
          RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
          SET search_path = pg_catalog, public
          AS $func$
          DECLARE v_current TEXT := current_setting('app.current_tenant', true);
          BEGIN
            IF v_current IS NOT NULL AND v_current <> '' AND v_current <> p_tenant THEN
              RAISE EXCEPTION
                'app.current_tenant already bound to % — refusing to rebind to %',
                v_current, p_tenant USING ERRCODE = 'insufficient_privilege';
            END IF;
            PERFORM set_config('app.current_tenant', p_tenant, true);
            PERFORM set_config(
              'app.is_system',
              CASE WHEN p_is_system THEN 'true' ELSE 'false' END,
              true
            );
          END $func$;
        `);
        await adminClient`GRANT EXECUTE ON FUNCTION app_bind_tenant(text, boolean) TO resto_app`;
        await adminClient.end({ timeout: 5 });
      }
    });

    it('assertSetConfigRevoked passes on a freshly-migrated DB', async () => {
      await expect(assertSetConfigRevoked(pg.url)).resolves.toBeUndefined();
    });

    it('assertSetConfigRevoked throws when the PUBLIC grant is restored', async () => {
      const adminClient = postgres(pg.adminUrl, { max: 1, prepare: false });
      try {
        await adminClient`GRANT EXECUTE ON FUNCTION pg_catalog.set_config(text, text, boolean) TO PUBLIC`;
        await expect(assertSetConfigRevoked(pg.url)).rejects.toBeInstanceOf(
          SetConfigNotRevokedError,
        );
      } finally {
        await adminClient`REVOKE EXECUTE ON FUNCTION pg_catalog.set_config(text, text, boolean) FROM PUBLIC`;
        await adminClient.end({ timeout: 5 });
      }
    });
  });
});
