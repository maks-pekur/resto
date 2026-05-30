import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext, schema, TenantAwareDb } from '@resto/db';
import {
  BrandId,
  BrandTheme,
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
  PublishedMenuBrand,
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

  async loadPublishedMenu(
    tenantId: TenantId,
    version: number,
    brandId?: string | null,
  ): Promise<PublishedMenu> {
    return this.db.withTenant(async (tx, scoped) => {
      const itemsBaseConditions = brandId
        ? and(eq(schema.menuItems.status, 'published'), eq(schema.menuItems.brandId, brandId))
        : eq(schema.menuItems.status, 'published');

      const brandRowPromise = brandId
        ? tx
            .select({
              id: schema.brands.id,
              slug: schema.brands.slug,
              displayName: schema.brands.displayName,
              theme: schema.brands.theme,
            })
            .from(schema.brands)
            .where(
              // ScopedTx does not support column projection; explicit tenant
              // filter upholds ADR-0020 I-1 at this single call site.
              and(
                eq(schema.brands.tenantId, requireTenantContext().tenantId),
                eq(schema.brands.id, brandId),
              ),
            )
            .limit(1)
        : Promise.resolve([] as const);

      const [categoriesRows, itemsRows, brandRows] = await Promise.all([
        scoped.selectFrom(
          schema.menuCategories,
          brandId ? eq(schema.menuCategories.brandId, brandId) : undefined,
        ),
        scoped.selectFrom(schema.menuItems, itemsBaseConditions),
        brandRowPromise,
      ]);

      const [variantsRows, itemModifierRows, modifiersRows] = await Promise.all([
        scoped.selectFrom(schema.menuVariants),
        scoped.selectFrom(schema.menuItemModifiers),
        scoped.selectFrom(schema.menuModifiers),
      ]);

      const itemIds = itemsRows.map((r) => r.id);
      const optionsRows =
        modifiersRows.length === 0
          ? []
          : await scoped.selectFrom(
              schema.menuModifierOptions,
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
            // 04a-02 shim: read presign from photos[0] until plan 06 wires the full photo array.
            imageUrl: await this.signImage(r.photos[0]?.s3Key ?? null),
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

      const currency = items[0]?.currency ?? Currency.parse('USD');

      const brandRow = brandRows[0];
      const brand: PublishedMenuBrand | null = brandRow
        ? {
            id: BrandId.parse(brandRow.id),
            slug: brandRow.slug,
            displayName: brandRow.displayName,
            theme: brandRow.theme === null ? null : BrandTheme.parse(brandRow.theme),
          }
        : null;

      return {
        tenantId,
        version,
        currency,
        brand,
        categories: categories.sort((a, b) => a.sortOrder - b.sortOrder),
        items: items.sort((a, b) => a.sortOrder - b.sortOrder),
        modifiers,
      };
    });
  }

  async findPublishedItem(
    itemId: string,
    brandId?: string | null,
  ): Promise<PublishedMenuItem | null> {
    return this.db.withTenant(async (_tx, scoped) => {
      const baseConditions = and(
        eq(schema.menuItems.id, itemId),
        eq(schema.menuItems.status, 'published'),
      );
      const where = brandId
        ? and(baseConditions, eq(schema.menuItems.brandId, brandId))
        : baseConditions;
      const items = await scoped.selectFrom(schema.menuItems, where).limit(1);
      const row = items[0];
      if (!row) return null;
      const [variants, links] = await Promise.all([
        scoped.selectFrom(schema.menuVariants, eq(schema.menuVariants.menuItemId, row.id)),
        scoped.selectFrom(
          schema.menuItemModifiers,
          eq(schema.menuItemModifiers.menuItemId, row.id),
        ),
      ]);
      return {
        id: MenuItemId.parse(row.id),
        slug: row.slug,
        categoryId: MenuCategoryId.parse(row.categoryId),
        name: row.name,
        description: row.description ?? null,
        basePrice: MoneyAmount.parse(row.basePrice),
        currency: Currency.parse(row.currency),
        // 04a-02 shim: read presign from photos[0] until plan 06 wires the full photo array.
        imageUrl: await this.signImage(row.photos[0]?.s3Key ?? null),
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
    return this.db.withTenant(async (_tx, scoped) => {
      const [row] = await scoped
        .insertInto(schema.menuCategories, {
          ...(input.id ? { id: input.id } : {}),
          brandId: input.brandId ?? null,
          slug: input.slug,
          name: input.name,
          description: input.description,
          sortOrder: input.sortOrder,
        })
        .onConflictDoUpdate({
          target: [schema.menuCategories.tenantId, schema.menuCategories.slug],
          set: {
            brandId: input.brandId ?? null,
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
    // 04a-02 shim: translate the legacy single `imageS3Key` input into the new
    // `photos` JSONB array column. Plan 05 widens the DTO to accept the full
    // photos array; plan 06 wires the full repository projection.
    const photos = input.imageS3Key
      ? [{ s3Key: input.imageS3Key, sortOrder: 0, isPrimary: true }]
      : [];
    return this.db.withTenant(async (_tx, scoped) => {
      const [row] = await scoped
        .insertInto(schema.menuItems, {
          ...(input.id ? { id: input.id } : {}),
          brandId: input.brandId ?? null,
          categoryId: input.categoryId,
          slug: input.slug,
          name: input.name,
          description: input.description,
          basePrice: input.basePrice,
          currency: input.currency,
          photos,
          allergens: input.allergens ? [...input.allergens] : null,
          status: input.status,
          sortOrder: input.sortOrder,
        })
        .onConflictDoUpdate({
          target: [schema.menuItems.tenantId, schema.menuItems.slug],
          set: {
            brandId: input.brandId ?? null,
            categoryId: input.categoryId,
            name: input.name,
            description: input.description,
            basePrice: input.basePrice,
            currency: input.currency,
            photos,
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
    return this.db.withTenant(async (_tx, scoped) => {
      // No natural unique key besides id; if id is supplied we update,
      // otherwise we insert a fresh row.
      if (input.id) {
        const [row] = await scoped
          .updateTable(
            schema.menuModifiers,
            {
              name: input.name,
              minSelectable: input.minSelectable,
              maxSelectable: input.maxSelectable,
              isRequired: input.isRequired,
              updatedAt: new Date(),
            },
            eq(schema.menuModifiers.id, input.id),
          )
          .returning({ id: schema.menuModifiers.id });
        if (!row) throw new Error('upsertModifier: update returned no row');
        return { id: row.id };
      }
      const [row] = await scoped
        .insertInto(schema.menuModifiers, {
          brandId: input.brandId ?? null,
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
