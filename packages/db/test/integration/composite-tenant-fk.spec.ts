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
  brandA: string;
  brandB: string;
  categoryA: string;
  categoryB: string;
  itemA: string;
  itemB: string;
  modifierA: string;
  modifierB: string;
  memberId: string;
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

const CASES: FkCase[] = [
  {
    name: 'member_brand_scope.brand_id → brands(id, tenant_id)',
    probe: async (pg, fx) =>
      pg.db.withoutTenant('I-2 probe: member_brand_scope', async (tx) =>
        tx.insert(schema.memberBrandScope).values({
          tenantId: fx.tenantA,
          memberId: fx.memberId,
          brandId: fx.brandB,
        }),
      ),
  },
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
    name: 'menu_variants.menu_item_id → menu_items(id, tenant_id)',
    probe: async (pg, fx) =>
      pg.db.withoutTenant('I-2 probe: menu_variants', async (tx) =>
        tx.insert(schema.menuVariants).values({
          tenantId: fx.tenantA,
          menuItemId: fx.itemB,
          name: { en: 'Probe' },
        }),
      ),
  },
  {
    name: 'menu_modifier_options.modifier_id → menu_modifiers(id, tenant_id)',
    probe: async (pg, fx) =>
      pg.db.withoutTenant('I-2 probe: menu_modifier_options', async (tx) =>
        tx.insert(schema.menuModifierOptions).values({
          tenantId: fx.tenantA,
          modifierId: fx.modifierB,
          name: { en: 'Probe' },
        }),
      ),
  },
  {
    name: 'menu_item_modifiers.menu_item_id → menu_items(id, tenant_id)',
    probe: async (pg, fx) =>
      pg.db.withoutTenant('I-2 probe: menu_item_modifiers.menu_item_id', async (tx) =>
        tx.insert(schema.menuItemModifiers).values({
          tenantId: fx.tenantA,
          menuItemId: fx.itemB,
          modifierId: fx.modifierA,
        }),
      ),
  },
  {
    name: 'menu_item_modifiers.modifier_id → menu_modifiers(id, tenant_id)',
    probe: async (pg, fx) =>
      pg.db.withoutTenant('I-2 probe: menu_item_modifiers.modifier_id', async (tx) =>
        tx.insert(schema.menuItemModifiers).values({
          tenantId: fx.tenantA,
          menuItemId: fx.itemA,
          modifierId: fx.modifierB,
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
        .values({ slug: 'i2-tenant-a', displayName: 'I-2 Tenant A' })
        .returning({ id: schema.tenants.id });
      const [tenantB] = await tx
        .insert(schema.tenants)
        .values({ slug: 'i2-tenant-b', displayName: 'I-2 Tenant B' })
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

      const [memberRow] = await tx
        .insert(schema.member)
        .values({
          id: 'i2-member',
          organizationId: tenantA.id,
          userId: userRow.id,
          role: 'admin',
          createdAt: new Date(),
        })
        .returning({ id: schema.member.id });
      if (!memberRow) throw new Error('seed member failed');

      const [brandA] = await tx
        .insert(schema.brands)
        .values({ tenantId: tenantA.id, slug: 'i2-brand-a', displayName: 'I-2 Brand A' })
        .returning({ id: schema.brands.id });
      const [brandB] = await tx
        .insert(schema.brands)
        .values({ tenantId: tenantB.id, slug: 'i2-brand-b', displayName: 'I-2 Brand B' })
        .returning({ id: schema.brands.id });
      if (!brandA || !brandB) throw new Error('seed brands failed');

      const [categoryA] = await tx
        .insert(schema.menuCategories)
        .values({ tenantId: tenantA.id, slug: 'i2-cat-a', name: { en: 'Cat A' } })
        .returning({ id: schema.menuCategories.id });
      const [categoryB] = await tx
        .insert(schema.menuCategories)
        .values({ tenantId: tenantB.id, slug: 'i2-cat-b', name: { en: 'Cat B' } })
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
        .insert(schema.menuModifiers)
        .values({ tenantId: tenantA.id, name: { en: 'Mod A' } })
        .returning({ id: schema.menuModifiers.id });
      const [modifierB] = await tx
        .insert(schema.menuModifiers)
        .values({ tenantId: tenantB.id, name: { en: 'Mod B' } })
        .returning({ id: schema.menuModifiers.id });
      if (!modifierA || !modifierB) throw new Error('seed modifiers failed');

      return {
        tenantA: tenantA.id,
        tenantB: tenantB.id,
        brandA: brandA.id,
        brandB: brandB.id,
        categoryA: categoryA.id,
        categoryB: categoryB.id,
        itemA: itemA.id,
        itemB: itemB.id,
        modifierA: modifierA.id,
        modifierB: modifierB.id,
        memberId: memberRow.id,
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
