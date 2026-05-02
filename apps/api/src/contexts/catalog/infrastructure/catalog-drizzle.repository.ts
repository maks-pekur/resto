import { Inject, Injectable } from '@nestjs/common';
import { schema, TenantAwareDb } from '@resto/db';
import {
  Currency,
  MenuCategoryId,
  MenuItemId,
  MenuModifierId,
  MenuVariantId,
  MoneyAmount,
  PriceDelta,
  TenantId,
} from '@resto/domain';
import { and, eq, inArray } from 'drizzle-orm';
import {
  IMAGE_URL_PORT,
  type CatalogRepository,
  type ImageUrlPort,
  type UpsertCategoryRow,
  type UpsertItemRow,
  type UpsertModifierRow,
} from '../domain/ports';
import type {
  PublishedMenu,
  PublishedMenuCategory,
  PublishedMenuItem,
  PublishedMenuModifier,
  PublishedMenuModifierOption,
  PublishedMenuVariant,
} from '../domain/published-menu';

/** Signed image URLs match the catalog cache TTL — see GetPublishedMenuService. */
const IMAGE_URL_TTL_SECONDS = 300;

@Injectable()
export class CatalogDrizzleRepository implements CatalogRepository {
  constructor(
    @Inject(TenantAwareDb) private readonly db: TenantAwareDb,
    @Inject(IMAGE_URL_PORT) private readonly imageUrl: ImageUrlPort,
  ) {}

  private signImage(s3Key: string | null): Promise<string | null> {
    if (!s3Key) return Promise.resolve(null);
    return this.imageUrl.presignGet(s3Key, IMAGE_URL_TTL_SECONDS);
  }

  async loadPublishedMenu(tenantId: TenantId, version: number): Promise<PublishedMenu> {
    return this.db.withTenant(async (tx) => {
      const [categoriesRows, itemsRows, variantsRows, itemModifierRows, modifiersRows] =
        await Promise.all([
          tx.select().from(schema.menuCategories),
          tx.select().from(schema.menuItems).where(eq(schema.menuItems.status, 'published')),
          tx.select().from(schema.menuVariants),
          tx.select().from(schema.menuItemModifiers),
          tx.select().from(schema.menuModifiers),
        ]);

      const itemIds = itemsRows.map((r) => r.id);
      const optionsRows =
        modifiersRows.length === 0
          ? []
          : await tx
              .select()
              .from(schema.menuModifierOptions)
              .where(
                inArray(
                  schema.menuModifierOptions.modifierId,
                  modifiersRows.map((m) => m.id),
                ),
              );

      const variantsByItem = groupBy(variantsRows, (r) => r.menuItemId);
      const modifiersByItem = groupBy(itemModifierRows, (r) => r.menuItemId);
      const optionsByModifier = groupBy(optionsRows, (r) => r.modifierId);

      const items = await Promise.all(
        itemsRows
          .filter((r) => itemIds.includes(r.id))
          .map<Promise<PublishedMenuItem>>(async (r) => ({
            id: MenuItemId.parse(r.id),
            slug: r.slug,
            categoryId: MenuCategoryId.parse(r.categoryId),
            name: r.name,
            description: r.description ?? null,
            basePrice: MoneyAmount.parse(r.basePrice),
            currency: Currency.parse(r.currency),
            imageUrl: await this.signImage(r.imageS3Key),
            allergens: r.allergens ?? [],
            sortOrder: r.sortOrder,
            variants: (variantsByItem.get(r.id) ?? []).map<PublishedMenuVariant>((v) => ({
              id: MenuVariantId.parse(v.id),
              name: v.name,
              priceDelta: PriceDelta.parse(v.priceDelta),
              isDefault: v.isDefault,
              sortOrder: v.sortOrder,
            })),
            modifierIds: (modifiersByItem.get(r.id) ?? []).map((m) =>
              MenuModifierId.parse(m.modifierId),
            ),
          })),
      );

      const categories = categoriesRows.map<PublishedMenuCategory>((r) => ({
        id: MenuCategoryId.parse(r.id),
        slug: r.slug,
        name: r.name,
        description: r.description ?? null,
        sortOrder: r.sortOrder,
      }));

      const modifiers = modifiersRows.map<PublishedMenuModifier>((r) => ({
        id: MenuModifierId.parse(r.id),
        name: r.name,
        minSelectable: r.minSelectable,
        maxSelectable: r.maxSelectable,
        isRequired: r.isRequired,
        options: (optionsByModifier.get(r.id) ?? []).map<PublishedMenuModifierOption>((o) => ({
          id: o.id,
          name: o.name,
          priceDelta: PriceDelta.parse(o.priceDelta),
          sortOrder: o.sortOrder,
        })),
      }));

      const currency = items[0]?.currency ?? Currency.parse('USD'); // tenant-default fallback

      return {
        tenantId,
        version,
        currency,
        categories: categories.sort((a, b) => a.sortOrder - b.sortOrder),
        items: items.sort((a, b) => a.sortOrder - b.sortOrder),
        modifiers,
      };
    });
  }

  async findPublishedItem(itemId: string): Promise<PublishedMenuItem | null> {
    return this.db.withTenant(async (tx) => {
      const items = await tx
        .select()
        .from(schema.menuItems)
        .where(and(eq(schema.menuItems.id, itemId), eq(schema.menuItems.status, 'published')))
        .limit(1);
      const row = items[0];
      if (!row) return null;
      const [variants, links] = await Promise.all([
        tx.select().from(schema.menuVariants).where(eq(schema.menuVariants.menuItemId, row.id)),
        tx
          .select()
          .from(schema.menuItemModifiers)
          .where(eq(schema.menuItemModifiers.menuItemId, row.id)),
      ]);
      return {
        id: MenuItemId.parse(row.id),
        slug: row.slug,
        categoryId: MenuCategoryId.parse(row.categoryId),
        name: row.name,
        description: row.description ?? null,
        basePrice: MoneyAmount.parse(row.basePrice),
        currency: Currency.parse(row.currency),
        imageUrl: await this.signImage(row.imageS3Key),
        allergens: row.allergens ?? [],
        sortOrder: row.sortOrder,
        variants: variants.map<PublishedMenuVariant>((v) => ({
          id: MenuVariantId.parse(v.id),
          name: v.name,
          priceDelta: PriceDelta.parse(v.priceDelta),
          isDefault: v.isDefault,
          sortOrder: v.sortOrder,
        })),
        modifierIds: links.map((m) => MenuModifierId.parse(m.modifierId)),
      };
    });
  }

  async upsertCategory(input: UpsertCategoryRow): Promise<{ id: string }> {
    return this.db.withTenant(async (tx) => {
      const [row] = await tx
        .insert(schema.menuCategories)
        .values({
          ...(input.id ? { id: input.id } : {}),
          tenantId: input.tenantId,
          slug: input.slug,
          name: input.name,
          description: input.description,
          sortOrder: input.sortOrder,
        })
        .onConflictDoUpdate({
          target: [schema.menuCategories.tenantId, schema.menuCategories.slug],
          set: {
            name: input.name,
            description: input.description,
            sortOrder: input.sortOrder,
            updatedAt: new Date(),
          },
        })
        .returning({ id: schema.menuCategories.id });
      if (!row) throw new Error('upsertCategory: insert returned no row');
      return { id: row.id };
    });
  }

  async upsertItem(input: UpsertItemRow): Promise<{ id: string }> {
    return this.db.withTenant(async (tx) => {
      const [row] = await tx
        .insert(schema.menuItems)
        .values({
          ...(input.id ? { id: input.id } : {}),
          tenantId: input.tenantId,
          categoryId: input.categoryId,
          slug: input.slug,
          name: input.name,
          description: input.description,
          basePrice: input.basePrice,
          currency: input.currency,
          imageS3Key: input.imageS3Key,
          allergens: input.allergens ? [...input.allergens] : null,
          status: input.status,
          sortOrder: input.sortOrder,
        })
        .onConflictDoUpdate({
          target: [schema.menuItems.tenantId, schema.menuItems.slug],
          set: {
            categoryId: input.categoryId,
            name: input.name,
            description: input.description,
            basePrice: input.basePrice,
            currency: input.currency,
            imageS3Key: input.imageS3Key,
            allergens: input.allergens ? [...input.allergens] : null,
            status: input.status,
            sortOrder: input.sortOrder,
            updatedAt: new Date(),
          },
        })
        .returning({ id: schema.menuItems.id });
      if (!row) throw new Error('upsertItem: insert returned no row');
      return { id: row.id };
    });
  }

  async upsertModifier(input: UpsertModifierRow): Promise<{ id: string }> {
    return this.db.withTenant(async (tx) => {
      // No natural unique key besides id; if id is supplied we update,
      // otherwise we insert a fresh row.
      if (input.id) {
        const [row] = await tx
          .update(schema.menuModifiers)
          .set({
            name: input.name,
            minSelectable: input.minSelectable,
            maxSelectable: input.maxSelectable,
            isRequired: input.isRequired,
            updatedAt: new Date(),
          })
          .where(eq(schema.menuModifiers.id, input.id))
          .returning({ id: schema.menuModifiers.id });
        if (!row) throw new Error('upsertModifier: update returned no row');
        return { id: row.id };
      }
      const [row] = await tx
        .insert(schema.menuModifiers)
        .values({
          tenantId: input.tenantId,
          name: input.name,
          minSelectable: input.minSelectable,
          maxSelectable: input.maxSelectable,
          isRequired: input.isRequired,
        })
        .returning({ id: schema.menuModifiers.id });
      if (!row) throw new Error('upsertModifier: insert returned no row');
      return { id: row.id };
    });
  }
}

const groupBy = <T, K>(items: readonly T[], keyOf: (item: T) => K): Map<K, T[]> => {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = out.get(key);
    if (list) {
      list.push(item);
    } else {
      out.set(key, [item]);
    }
  }
  return out;
};
