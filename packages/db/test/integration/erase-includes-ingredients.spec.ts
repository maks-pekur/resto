import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { isDockerAvailable, startPostgres, stopPostgres, type TestPg } from '../setup';
import { schema } from '../../src/index';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[erase-includes-ingredients] Docker not available — skipping.');
}

const SALT = 'test-salt-must-be-at-least-32-chars';

suite(
  'tenancy_erase_tenant — wipes the ingredient library link/stop tables (10.6-02-erasure)',
  () => {
    let pg: TestPg;
    let tenantId: string;

    beforeAll(async () => {
      pg = await startPostgres();
      await pg.db.withoutTenant('seed ingredient-library erase fixtures', async (tx) => {
        const [t] = await tx
          .insert(schema.tenants)
          .values({ slug: 'erase-ing', displayName: 'EraseIng', country: 'GB' })
          .returning({ id: schema.tenants.id });
        if (!t) throw new Error('seed tenant failed');
        tenantId = t.id;

        const [loc] = await tx
          .insert(schema.locations)
          .values({ tenantId, name: 'EraseIng Location', slug: 'easeing-location' })
          .returning({ id: schema.locations.id });
        if (!loc) throw new Error('seed location failed');

        const [category] = await tx
          .insert(schema.menuCategories)
          .values({ tenantId, slug: 'erase-ing-cat', name: { en: 'EraseIng Category' } })
          .returning({ id: schema.menuCategories.id });
        if (!category) throw new Error('seed category failed');

        const [item] = await tx
          .insert(schema.menuItems)
          .values({
            tenantId,
            categoryId: category.id,
            slug: 'erase-ing-item',
            name: { en: 'EraseIng Item' },
            basePrice: '1.00',
            currency: 'USD',
          })
          .returning({ id: schema.menuItems.id });
        if (!item) throw new Error('seed item failed');

        const [group] = await tx
          .insert(schema.menuModifierGroups)
          .values({ tenantId, name: { en: 'EraseIng Group' }, isRequired: false })
          .returning({ id: schema.menuModifierGroups.id });
        if (!group) throw new Error('seed modifier group failed');

        const [option] = await tx
          .insert(schema.menuModifierOptions)
          .values({ tenantId, name: { en: 'EraseIng Option' } })
          .returning({ id: schema.menuModifierOptions.id });
        if (!option) throw new Error('seed modifier option failed');

        await tx.insert(schema.menuModifierGroupOptions).values({
          tenantId,
          modifierGroupId: group.id,
          optionId: option.id,
          sortOrder: 0,
        });
        await tx.insert(schema.menuItemModifierOptions).values({
          tenantId,
          menuItemId: item.id,
          optionId: option.id,
          sortOrder: 0,
        });
        await tx.insert(schema.menuOptionStopList).values({
          tenantId,
          locationId: loc.id,
          optionId: option.id,
          reason: 'erase fixture',
          stoppedByUserId: null,
        });
      });
    }, 90_000);

    afterAll(async () => {
      await stopPostgres(pg);
    });

    it('erases menu_option_stop_list, menu_item_modifier_options and menu_modifier_group_options with zero rows left, without a foreign-key violation', async () => {
      await pg.db.withoutTenant('run erase', async (tx) => {
        await tx.execute(sql`SELECT app_allow_erasure(${tenantId}::uuid)`);
        await tx.execute(
          sql`SELECT tenancy_erase_tenant(${tenantId}::uuid, ${SALT}, 'test:erase-includes-ingredients')`,
        );
      });

      await pg.db.withoutTenant('assert ingredient-library tables wiped', async (tx) => {
        const stopList = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.menuOptionStopList)
          .where(eq(schema.menuOptionStopList.tenantId, tenantId));
        expect(stopList[0]?.n).toBe(0);

        const itemLinks = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.menuItemModifierOptions)
          .where(eq(schema.menuItemModifierOptions.tenantId, tenantId));
        expect(itemLinks[0]?.n).toBe(0);

        const groupLinks = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.menuModifierGroupOptions)
          .where(eq(schema.menuModifierGroupOptions.tenantId, tenantId));
        expect(groupLinks[0]?.n).toBe(0);
      });
    });

    it('the erase function itself names all three new tables above the menu_modifier_options delete — closes the recurring omission class (migrations 0072/0074/0077)', async () => {
      const [row] = await pg.db.withoutTenant('read erase function source', async (tx) =>
        tx.execute<{ def: string }>(
          sql`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'tenancy_erase_tenant'`,
        ),
      );
      if (!row) throw new Error('tenancy_erase_tenant function not found');
      expect(row.def).toContain('DELETE FROM menu_option_stop_list');
      expect(row.def).toContain('DELETE FROM menu_item_modifier_options');
      expect(row.def).toContain('DELETE FROM menu_modifier_group_options');

      const stopListPos = row.def.indexOf('DELETE FROM menu_option_stop_list');
      const itemLinksPos = row.def.indexOf('DELETE FROM menu_item_modifier_options');
      const groupLinksPos = row.def.indexOf('DELETE FROM menu_modifier_group_options');
      const optionsPos = row.def.indexOf('DELETE FROM menu_modifier_options ');
      expect(optionsPos).toBeGreaterThan(-1);
      expect(stopListPos).toBeLessThan(optionsPos);
      expect(itemLinksPos).toBeLessThan(optionsPos);
      expect(groupLinksPos).toBeLessThan(optionsPos);
    });
  },
);
