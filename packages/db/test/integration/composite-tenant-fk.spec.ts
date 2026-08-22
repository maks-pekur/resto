import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isDockerAvailable, startPostgres, stopPostgres, type TestPg } from '../setup';
import { schema } from '../../src/index';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[composite-tenant-fk] Docker not available — skipping integration tests.');
}

interface FixtureBundle {
  tenantA: string;
  tenantB: string;
  categoryA: string;
  categoryB: string;
  itemA: string;
  itemB: string;
  modifierA: string;
  modifierB: string;
  memberId: string;
  memberBId: string;
  locationA: string;
}

interface FkCase {
  /** Display name shown in `describe.each`. */
  name: string;
  /**
   * Attempts an insert that satisfies every FK on the child row EXCEPT the
   * composite tenant FK under test. The expected outcome (after the
   * Phase 3b migration is applied) is a rejection with SQLSTATE 23503.
   */
  probe: (pg: TestPg, fx: FixtureBundle) => Promise<unknown>;
}

// NOTE (phase 10.2, D-04/D-08): the `member_brand_scope.brand_id`,
// `menu_categories.brand_id` and `menu_items.brand_id` composite-FK cases
// that used to live here are removed — `brands` and every `brand_id`
// column are gone, so there is no second dimension left to probe on
// these tables. ADR-0020 I-2 is reduced by one dimension, not removed:
// the remaining cases below keep proving the tenant-dimension composite
// FK still rejects a cross-tenant child insert.
const CASES: FkCase[] = [
  {
    name: 'menu_items.category_id → menu_categories(id, tenant_id)',
    probe: async (pg, fx) =>
      pg.db.withoutTenant('I-2 probe: menu_items', async (tx) =>
        tx.insert(schema.menuItems).values({
          tenantId: fx.tenantA,
          categoryId: fx.categoryB,
          slug: `i2-probe-items-${Date.now()}`,
          name: { en: 'Probe' },
          basePrice: '1.00',
          currency: 'USD',
        }),
      ),
  },
  {
    name: 'menu_item_sizes.menu_item_id → menu_items(id, tenant_id)',
    probe: async (pg, fx) =>
      pg.db.withoutTenant('I-2 probe: menu_item_sizes', async (tx) =>
        tx.insert(schema.menuItemSizes).values({
          tenantId: fx.tenantA,
          menuItemId: fx.itemB,
          price: '1.00',
          name: { en: 'Probe' },
        }),
      ),
  },
  {
    name: 'menu_modifier_options.modifier_group_id → menu_modifier_groups(id, tenant_id)',
    probe: async (pg, fx) =>
      pg.db.withoutTenant('I-2 probe: menu_modifier_options', async (tx) =>
        tx.insert(schema.menuModifierOptions).values({
          tenantId: fx.tenantA,
          modifierGroupId: fx.modifierB,
          name: { en: 'Probe' },
        }),
      ),
  },
  {
    name: 'menu_item_modifier_groups.menu_item_id → menu_items(id, tenant_id)',
    probe: async (pg, fx) =>
      pg.db.withoutTenant('I-2 probe: menu_item_modifier_groups.menu_item_id', async (tx) =>
        tx.insert(schema.menuItemModifierGroups).values({
          tenantId: fx.tenantA,
          menuItemId: fx.itemB,
          modifierGroupId: fx.modifierA,
        }),
      ),
  },
  {
    name: 'menu_item_modifier_groups.modifier_group_id → menu_modifier_groups(id, tenant_id)',
    probe: async (pg, fx) =>
      pg.db.withoutTenant('I-2 probe: menu_item_modifier_groups.modifier_group_id', async (tx) =>
        tx.insert(schema.menuItemModifierGroups).values({
          tenantId: fx.tenantA,
          menuItemId: fx.itemA,
          modifierGroupId: fx.modifierB,
        }),
      ),
  },
  {
    // 10.2 plan 19: composite-ized in migration 0081 after 0079's
    // organization_id -> tenant_id rename on `member` surfaced this as a
    // pre-existing I-2 gap (member_location_scope_member_fk was
    // single-column) — see db:audit-fks.
    name: 'member_location_scope.member_id → member(id, tenant_id)',
    probe: async (pg, fx) =>
      pg.db.withoutTenant('I-2 probe: member_location_scope.member_id', async (tx) =>
        tx.insert(schema.memberLocationScope).values({
          tenantId: fx.tenantA,
          memberId: fx.memberBId,
          locationId: fx.locationA,
        }),
      ),
  },
];

suite('ADR-0020 I-2: composite tenant FK rejects cross-tenant child insert', () => {
  let pg: TestPg;
  let fx: FixtureBundle;

  beforeAll(async () => {
    pg = await startPostgres();

    fx = await pg.db.withoutTenant('seed I-2 regression fixtures', async (tx) => {
      const [tenantA] = await tx
        .insert(schema.tenants)
        .values({ slug: 'i2-tenant-a', displayName: 'I-2 Tenant A', country: 'GB' })
        .returning({ id: schema.tenants.id });
      const [tenantB] = await tx
        .insert(schema.tenants)
        .values({ slug: 'i2-tenant-b', displayName: 'I-2 Tenant B', country: 'GB' })
        .returning({ id: schema.tenants.id });
      if (!tenantA || !tenantB) throw new Error('seed tenants failed');

      const [userRow] = await tx
        .insert(schema.user)
        .values({
          id: 'i2-user',
          name: 'I-2 User',
          email: 'i2@example.test',
          emailVerified: true,
        })
        .returning({ id: schema.user.id });
      if (!userRow) throw new Error('seed user failed');

      const [userRowB] = await tx
        .insert(schema.user)
        .values({
          id: 'i2-user-b',
          name: 'I-2 User B',
          email: 'i2-b@example.test',
          emailVerified: true,
        })
        .returning({ id: schema.user.id });
      if (!userRowB) throw new Error('seed user B failed');

      const [memberRow] = await tx
        .insert(schema.member)
        .values({
          id: 'i2-member',
          tenantId: tenantA.id,
          userId: userRow.id,
          role: 'admin',
          createdAt: new Date(),
        })
        .returning({ id: schema.member.id });
      if (!memberRow) throw new Error('seed member failed');

      const [memberRowB] = await tx
        .insert(schema.member)
        .values({
          id: 'i2-member-b',
          tenantId: tenantB.id,
          userId: userRowB.id,
          role: 'admin',
          createdAt: new Date(),
        })
        .returning({ id: schema.member.id });
      if (!memberRowB) throw new Error('seed member B failed');

      const [locationA] = await tx
        .insert(schema.locations)
        .values({ tenantId: tenantA.id, name: 'I-2 Location A' })
        .returning({ id: schema.locations.id });
      if (!locationA) throw new Error('seed location A failed');

      const [categoryA] = await tx
        .insert(schema.menuCategories)
        .values({
          tenantId: tenantA.id,
          slug: 'i2-cat-a',
          name: { en: 'Cat A' },
        })
        .returning({ id: schema.menuCategories.id });
      const [categoryB] = await tx
        .insert(schema.menuCategories)
        .values({
          tenantId: tenantB.id,
          slug: 'i2-cat-b',
          name: { en: 'Cat B' },
        })
        .returning({ id: schema.menuCategories.id });
      if (!categoryA || !categoryB) throw new Error('seed categories failed');

      const [itemA] = await tx
        .insert(schema.menuItems)
        .values({
          tenantId: tenantA.id,
          categoryId: categoryA.id,
          slug: 'i2-item-a',
          name: { en: 'Item A' },
          basePrice: '1.00',
          currency: 'USD',
        })
        .returning({ id: schema.menuItems.id });
      const [itemB] = await tx
        .insert(schema.menuItems)
        .values({
          tenantId: tenantB.id,
          categoryId: categoryB.id,
          slug: 'i2-item-b',
          name: { en: 'Item B' },
          basePrice: '1.00',
          currency: 'USD',
        })
        .returning({ id: schema.menuItems.id });
      if (!itemA || !itemB) throw new Error('seed items failed');

      const [modifierA] = await tx
        .insert(schema.menuModifierGroups)
        .values({ tenantId: tenantA.id, name: { en: 'Mod A' } })
        .returning({ id: schema.menuModifierGroups.id });
      const [modifierB] = await tx
        .insert(schema.menuModifierGroups)
        .values({ tenantId: tenantB.id, name: { en: 'Mod B' } })
        .returning({ id: schema.menuModifierGroups.id });
      if (!modifierA || !modifierB) throw new Error('seed modifiers failed');

      return {
        tenantA: tenantA.id,
        tenantB: tenantB.id,
        categoryA: categoryA.id,
        categoryB: categoryB.id,
        itemA: itemA.id,
        itemB: itemB.id,
        modifierA: modifierA.id,
        modifierB: modifierB.id,
        memberId: memberRow.id,
        memberBId: memberRowB.id,
        locationA: locationA.id,
      } satisfies FixtureBundle;
    });
  }, 90_000);

  afterAll(async () => {
    await stopPostgres(pg);
  });

  describe.each(CASES)('$name', ({ probe }) => {
    it('rejects cross-tenant child insert with SQLSTATE 23503', async () => {
      const error = await probe(pg, fx).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(Error);
      const cause = (error as Error).cause as { code?: string } | undefined;
      expect(cause?.code).toBe('23503');
    });
  });
});
