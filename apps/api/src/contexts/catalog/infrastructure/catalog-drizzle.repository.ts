import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext, schema, TenantAwareDb, type MenuItemPhoto } from '@resto/db';
import {
  BrandId,
  BrandTheme,
  Currency,
  MenuCategoryId,
  MenuItemId,
  MenuModifierId,
  MenuVariantId,
  MoneyAmount,
  TenantId,
} from '@resto/domain';
import {
  appendToOutbox,
  buildEnvelope,
  MenuFirstPublishedV1,
  MenuRepublishedV1,
} from '@resto/events';
import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import {
  IMAGE_URL_PORT,
  type CategoryListRow,
  type CatalogRepository,
  type DraftDiffEntryRow,
  type ImageUrlPort,
  type ItemDetailRow,
  type ItemListRow,
  type ItemStatusFilter,
  type ModifierGroupDetailRow,
  type ModifierGroupListRow,
  type StopListEntryRow,
  type StopListInsertRow,
  type UpsertCategoryRow,
  type UpsertItemRow,
  type UpsertItemSizeRow,
  type UpsertModifierGroupRow,
  type UpsertModifierOptionRow,
} from '../domain/ports';
import {
  CategoryNestingDepthError,
  MenuCategoryNotFoundError,
  MenuItemNotFoundError,
  MenuItemSizeNotFoundError,
  MenuModifierGroupNotFoundError,
  MenuModifierOptionNotFoundError,
} from '../domain/errors';
import type {
  PublishedMenu,
  PublishedMenuBrand,
  PublishedMenuCategory,
  PublishedMenuItem,
  PublishedMenuItemPhoto,
  PublishedMenuItemSize,
  PublishedMenuModifierGroup,
  PublishedMenuModifierOption,
} from '../domain/published-menu';

// Signed image URLs must match the catalog cache TTL (GetPublishedMenuService).
const IMAGE_URL_TTL_SECONDS = 300;

@Injectable()
export class CatalogDrizzleRepository implements CatalogRepository {
  constructor(
    @Inject(TenantAwareDb) private readonly db: TenantAwareDb,
    @Inject(IMAGE_URL_PORT) private readonly imageUrl: ImageUrlPort,
  ) {}

  private async signPhotos(photos: readonly MenuItemPhoto[]): Promise<PublishedMenuItemPhoto[]> {
    const signed = await Promise.all(
      photos.map(async (p) => {
        // presignGet returns '' on S3 failure (degraded mode); drop the photo
        // rather than emit a broken `<img src="">` to the client.
        const url = await this.imageUrl.presignGet(p.s3Key, IMAGE_URL_TTL_SECONDS);
        if (!url) return null;
        const photo: PublishedMenuItemPhoto = {
          s3Key: p.s3Key,
          sortOrder: p.sortOrder,
          ...(p.alt !== undefined ? { alt: p.alt } : {}),
          ...(p.width !== undefined ? { width: p.width } : {}),
          ...(p.height !== undefined ? { height: p.height } : {}),
          ...(p.isPrimary !== undefined ? { isPrimary: p.isPrimary } : {}),
          url,
        };
        return photo;
      }),
    );
    return signed.filter((p): p is PublishedMenuItemPhoto => p !== null);
  }

  async loadPublishedMenu(
    tenantId: TenantId,
    version: number,
    brandId: string,
  ): Promise<PublishedMenu> {
    return this.db.withTenant(async (tx, scoped) => {
      const itemsBaseConditions = and(
        eq(schema.menuItems.status, 'published'),
        eq(schema.menuItems.brandId, brandId),
      );

      const brandRowPromise = tx
        .select({
          id: schema.brands.id,
          slug: schema.brands.slug,
          displayName: schema.brands.displayName,
          theme: schema.brands.theme,
        })
        .from(schema.brands)
        .where(
          // ADR-0020 I-1: ScopedTx does not support column projection; explicit tenant filter at this single call site.
          and(
            eq(schema.brands.tenantId, requireTenantContext().tenantId),
            eq(schema.brands.id, brandId),
          ),
        )
        .limit(1);

      // D-4a-10: stop-list overlay — filter stopped items before per-item joins fire to avoid wasted size/modifier work.
      const [categoriesRows, allItemsRows, stopListRows, brandRows] = await Promise.all([
        scoped.selectFrom(schema.menuCategories, eq(schema.menuCategories.brandId, brandId)),
        scoped.selectFrom(schema.menuItems, itemsBaseConditions),
        scoped.selectFrom(schema.menuStopList, eq(schema.menuStopList.brandId, brandId)),
        brandRowPromise,
      ]);

      const stoppedItemIds = new Set(stopListRows.map((r) => r.itemId));

      const [sizesRows, itemModifierRows, modifierGroupsRows] = await Promise.all([
        scoped.selectFrom(schema.menuItemSizes, eq(schema.menuItemSizes.brandId, brandId)),
        scoped.selectFrom(
          schema.menuItemModifierGroups,
          eq(schema.menuItemModifierGroups.brandId, brandId),
        ),
        scoped.selectFrom(
          schema.menuModifierGroups,
          eq(schema.menuModifierGroups.brandId, brandId),
        ),
      ]);

      const optionsRows =
        modifierGroupsRows.length === 0
          ? []
          : await scoped.selectFrom(
              schema.menuModifierOptions,
              and(
                inArray(
                  schema.menuModifierOptions.modifierGroupId,
                  modifierGroupsRows.map((m) => m.id),
                ),
                eq(schema.menuModifierOptions.brandId, brandId),
              ),
            );

      const sizesByItem = groupBy(sizesRows, (r) => r.menuItemId);
      const modifierGroupsByItem = groupBy(itemModifierRows, (r) => r.menuItemId);
      const optionsByModifierGroup = groupBy(optionsRows, (r) => r.modifierGroupId);

      const items = await Promise.all(
        allItemsRows.map<Promise<PublishedMenuItem>>(async (r) => {
          const photos = await this.signPhotos(r.photos);
          return {
            id: MenuItemId.parse(r.id),
            slug: r.slug,
            categoryId: MenuCategoryId.parse(r.categoryId),
            name: r.name,
            description: r.description ?? null,
            basePrice: MoneyAmount.parse(r.basePrice),
            currency: Currency.parse(r.currency),
            imageUrl: photos[0]?.url ?? null,
            photos,
            allergens: r.allergens ?? [],
            sortOrder: r.sortOrder,
            proteins: r.proteins ?? null,
            fats: r.fats ?? null,
            carbs: r.carbs ?? null,
            kcal: r.kcal ?? null,
            nutritionEstimated: r.nutritionEstimated,
            sizes: (sizesByItem.get(r.id) ?? []).map<PublishedMenuItemSize>((v) => ({
              id: MenuVariantId.parse(v.id),
              name: v.name,
              price: MoneyAmount.parse(v.price),
              isDefault: v.isDefault,
              sortOrder: v.sortOrder,
            })),
            modifierGroupIds: (modifierGroupsByItem.get(r.id) ?? []).map((m) =>
              MenuModifierId.parse(m.modifierGroupId),
            ),
            isStopListed: stoppedItemIds.has(r.id),
          };
        }),
      );

      const categories = categoriesRows.map<PublishedMenuCategory>((r) => ({
        id: MenuCategoryId.parse(r.id),
        slug: r.slug,
        name: r.name,
        description: r.description ?? null,
        sortOrder: r.sortOrder,
      }));

      const modifierGroups = modifierGroupsRows.map<PublishedMenuModifierGroup>((r) => ({
        id: MenuModifierId.parse(r.id),
        name: r.name,
        minSelectable: r.minSelectable,
        maxSelectable: r.maxSelectable,
        isRequired: r.isRequired,
        options: (optionsByModifierGroup.get(r.id) ?? []).map<PublishedMenuModifierOption>((o) => ({
          id: o.id,
          name: o.name,
          priceDelta: MoneyAmount.parse(o.priceDelta),
          defaultAmount: o.defaultAmount,
          freeAmount: o.freeAmount,
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
        modifierGroups,
      };
    });
  }

  async findPublishedItem(itemId: string, brandId: string): Promise<PublishedMenuItem | null> {
    return this.db.withTenant(async (_tx, scoped) => {
      const where = and(
        eq(schema.menuItems.id, itemId),
        eq(schema.menuItems.status, 'published'),
        eq(schema.menuItems.brandId, brandId),
      );
      const [items, stopListRows] = await Promise.all([
        scoped.selectFrom(schema.menuItems, where).limit(1),
        scoped.selectFrom(
          schema.menuStopList,
          and(eq(schema.menuStopList.itemId, itemId), eq(schema.menuStopList.brandId, brandId)),
        ),
      ]);
      const row = items[0];
      if (!row) return null;
      // D-4a-10: stopped items must not surface via the per-item read either.
      if (stopListRows.length > 0) return null;

      const [sizes, links] = await Promise.all([
        scoped.selectFrom(
          schema.menuItemSizes,
          and(
            eq(schema.menuItemSizes.menuItemId, row.id),
            eq(schema.menuItemSizes.brandId, brandId),
          ),
        ),
        scoped.selectFrom(
          schema.menuItemModifierGroups,
          and(
            eq(schema.menuItemModifierGroups.menuItemId, row.id),
            eq(schema.menuItemModifierGroups.brandId, brandId),
          ),
        ),
      ]);
      const photos = await this.signPhotos(row.photos);
      return {
        id: MenuItemId.parse(row.id),
        slug: row.slug,
        categoryId: MenuCategoryId.parse(row.categoryId),
        name: row.name,
        description: row.description ?? null,
        basePrice: MoneyAmount.parse(row.basePrice),
        currency: Currency.parse(row.currency),
        imageUrl: photos[0]?.url ?? null,
        photos,
        allergens: row.allergens ?? [],
        sortOrder: row.sortOrder,
        proteins: row.proteins ?? null,
        fats: row.fats ?? null,
        carbs: row.carbs ?? null,
        kcal: row.kcal ?? null,
        nutritionEstimated: row.nutritionEstimated,
        sizes: sizes.map<PublishedMenuItemSize>((v) => ({
          id: MenuVariantId.parse(v.id),
          name: v.name,
          price: MoneyAmount.parse(v.price),
          isDefault: v.isDefault,
          sortOrder: v.sortOrder,
        })),
        modifierGroupIds: links.map((m) => MenuModifierId.parse(m.modifierGroupId)),
        isStopListed: false,
      };
    });
  }

  async upsertCategory(input: UpsertCategoryRow): Promise<{ id: string }> {
    return this.db.withTenant(async (_tx, scoped) => {
      const [row] = await scoped
        .insertInto(schema.menuCategories, {
          ...(input.id ? { id: input.id } : {}),
          brandId: input.brandId,
          parentId: input.parentId ?? null,
          slug: input.slug,
          name: input.name,
          description: input.description,
          sortOrder: input.sortOrder,
        })
        .onConflictDoUpdate({
          target: [
            schema.menuCategories.tenantId,
            schema.menuCategories.brandId,
            schema.menuCategories.slug,
          ],
          set: {
            parentId: input.parentId ?? null,
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

  async upsertItem(
    input: UpsertItemRow,
  ): Promise<{ id: string; slugChanged?: { oldSlug: string } }> {
    return this.db.withTenant(async (_tx, scoped) => {
      const parentCategory = await scoped
        .selectFrom(
          schema.menuCategories,
          and(
            eq(schema.menuCategories.id, input.categoryId),
            eq(schema.menuCategories.brandId, input.brandId),
          ),
        )
        .limit(1);
      if (!parentCategory[0]) {
        throw new MenuCategoryNotFoundError(input.categoryId);
      }

      const photos: MenuItemPhoto[] = [...input.photos];

      // D-4a-04: id-based path and (tenant_id, slug)-based path are split so a
      // slug rename does not trigger an id-PK conflict on the upsert.
      let oldSlug: string | null = null;
      let rowId: string;

      if (input.id) {
        const existing = await scoped
          .selectFrom(schema.menuItems, eq(schema.menuItems.id, input.id))
          .limit(1);
        const existingRow = existing[0];
        if (existingRow && existingRow.brandId !== input.brandId) {
          throw new MenuItemNotFoundError(input.id);
        }
        oldSlug = existingRow?.slug ?? null;

        if (existing.length === 0) {
          const [row] = await scoped
            .insertInto(schema.menuItems, {
              id: input.id,
              brandId: input.brandId,
              categoryId: input.categoryId,
              slug: input.slug,
              name: input.name,
              description: input.description,
              basePrice: input.basePrice,
              currency: input.currency,
              photos,
              allergens: input.allergens ? [...input.allergens] : null,
              ingredients: input.ingredients ? [...input.ingredients] : null,
              metaTitle: input.metaTitle,
              metaDescription: input.metaDescription,
              proteins: input.proteins === null ? null : input.proteins.toString(),
              fats: input.fats === null ? null : input.fats.toString(),
              carbs: input.carbs === null ? null : input.carbs.toString(),
              kcal: input.kcal,
              nutritionEstimated: input.nutritionEstimated,
              source: input.source,
              needsReview: input.needsReview,
              sourceExternalId: input.sourceExternalId,
              status: input.status,
              sortOrder: input.sortOrder,
            })
            .returning({ id: schema.menuItems.id });
          if (!row) throw new Error('upsertItem: insert returned no row');
          rowId = row.id;
        } else {
          const [row] = await scoped
            .updateTable(
              schema.menuItems,
              {
                categoryId: input.categoryId,
                slug: input.slug,
                name: input.name,
                description: input.description,
                basePrice: input.basePrice,
                currency: input.currency,
                photos,
                allergens: input.allergens ? [...input.allergens] : null,
                ingredients: input.ingredients ? [...input.ingredients] : null,
                metaTitle: input.metaTitle,
                metaDescription: input.metaDescription,
                proteins: input.proteins === null ? null : input.proteins.toString(),
                fats: input.fats === null ? null : input.fats.toString(),
                carbs: input.carbs === null ? null : input.carbs.toString(),
                kcal: input.kcal,
                nutritionEstimated: input.nutritionEstimated,
                source: input.source,
                needsReview: input.needsReview,
                sourceExternalId: input.sourceExternalId,
                status: input.status,
                sortOrder: input.sortOrder,
                updatedAt: new Date(),
              },
              and(eq(schema.menuItems.id, input.id), eq(schema.menuItems.brandId, input.brandId)),
            )
            .returning({ id: schema.menuItems.id });
          if (!row) throw new Error('upsertItem: update returned no row');
          rowId = row.id;
        }
      } else {
        const [row] = await scoped
          .insertInto(schema.menuItems, {
            brandId: input.brandId,
            categoryId: input.categoryId,
            slug: input.slug,
            name: input.name,
            description: input.description,
            basePrice: input.basePrice,
            currency: input.currency,
            photos,
            allergens: input.allergens ? [...input.allergens] : null,
            ingredients: input.ingredients ? [...input.ingredients] : null,
            metaTitle: input.metaTitle,
            metaDescription: input.metaDescription,
            proteins: input.proteins === null ? null : input.proteins.toString(),
            fats: input.fats === null ? null : input.fats.toString(),
            carbs: input.carbs === null ? null : input.carbs.toString(),
            kcal: input.kcal,
            nutritionEstimated: input.nutritionEstimated,
            source: input.source,
            needsReview: input.needsReview,
            sourceExternalId: input.sourceExternalId,
            status: input.status,
            sortOrder: input.sortOrder,
          })
          .onConflictDoUpdate({
            target: [schema.menuItems.tenantId, schema.menuItems.brandId, schema.menuItems.slug],
            set: {
              categoryId: input.categoryId,
              name: input.name,
              description: input.description,
              basePrice: input.basePrice,
              currency: input.currency,
              photos,
              allergens: input.allergens ? [...input.allergens] : null,
              ingredients: input.ingredients ? [...input.ingredients] : null,
              metaTitle: input.metaTitle,
              metaDescription: input.metaDescription,
              proteins: input.proteins === null ? null : input.proteins.toString(),
              fats: input.fats === null ? null : input.fats.toString(),
              carbs: input.carbs === null ? null : input.carbs.toString(),
              kcal: input.kcal,
              nutritionEstimated: input.nutritionEstimated,
              source: input.source,
              needsReview: input.needsReview,
              sourceExternalId: input.sourceExternalId,
              status: input.status,
              sortOrder: input.sortOrder,
              updatedAt: new Date(),
            },
          })
          .returning({ id: schema.menuItems.id });
        if (!row) throw new Error('upsertItem: insert returned no row');
        rowId = row.id;
      }

      if (oldSlug !== null && oldSlug !== input.slug) {
        // D-4a-04: slug change → alias the prior slug (idempotent on rename cycle).
        await scoped
          .insertInto(schema.menuItemSlugAliases, {
            itemId: rowId,
            alias: oldSlug,
          })
          .onConflictDoNothing();
        return { id: rowId, slugChanged: { oldSlug } };
      }
      return { id: rowId };
    });
  }

  async upsertModifierGroup(input: UpsertModifierGroupRow): Promise<{ id: string }> {
    return this.db.withTenant(async (_tx, scoped) => {
      if (input.id) {
        const [row] = await scoped
          .updateTable(
            schema.menuModifierGroups,
            {
              name: input.name,
              minSelectable: input.minSelectable,
              maxSelectable: input.maxSelectable,
              isRequired: input.isRequired,
              updatedAt: new Date(),
            },
            and(
              eq(schema.menuModifierGroups.id, input.id),
              eq(schema.menuModifierGroups.brandId, input.brandId),
            ),
          )
          .returning({ id: schema.menuModifierGroups.id });
        if (!row) throw new MenuModifierGroupNotFoundError(input.id);
        return { id: row.id };
      }
      const [row] = await scoped
        .insertInto(schema.menuModifierGroups, {
          brandId: input.brandId,
          name: input.name,
          minSelectable: input.minSelectable,
          maxSelectable: input.maxSelectable,
          isRequired: input.isRequired,
        })
        .returning({ id: schema.menuModifierGroups.id });
      if (!row) throw new Error('upsertModifierGroup: insert returned no row');
      return { id: row.id };
    });
  }

  async upsertModifierOption(input: UpsertModifierOptionRow): Promise<{ id: string }> {
    return this.db.withTenant(async (_tx, scoped) => {
      const parentGroup = await scoped
        .selectFrom(
          schema.menuModifierGroups,
          and(
            eq(schema.menuModifierGroups.id, input.modifierGroupId),
            eq(schema.menuModifierGroups.brandId, input.brandId),
          ),
        )
        .limit(1);
      if (!parentGroup[0]) {
        throw new MenuModifierGroupNotFoundError(input.modifierGroupId);
      }

      if (input.id) {
        const [row] = await scoped
          .updateTable(
            schema.menuModifierOptions,
            {
              modifierGroupId: input.modifierGroupId,
              name: input.name,
              priceDelta: input.priceDelta,
              defaultAmount: input.defaultAmount,
              freeAmount: input.freeAmount,
              sortOrder: input.sortOrder,
              updatedAt: new Date(),
            },
            and(
              eq(schema.menuModifierOptions.id, input.id),
              eq(schema.menuModifierOptions.brandId, input.brandId),
            ),
          )
          .returning({ id: schema.menuModifierOptions.id });
        if (!row) throw new MenuModifierOptionNotFoundError(input.id);
        return { id: row.id };
      }
      const [row] = await scoped
        .insertInto(schema.menuModifierOptions, {
          brandId: input.brandId,
          modifierGroupId: input.modifierGroupId,
          name: input.name,
          priceDelta: input.priceDelta,
          defaultAmount: input.defaultAmount,
          freeAmount: input.freeAmount,
          sortOrder: input.sortOrder,
        })
        .returning({ id: schema.menuModifierOptions.id });
      if (!row) throw new Error('upsertModifierOption: insert returned no row');
      return { id: row.id };
    });
  }

  async upsertItemSize(input: UpsertItemSizeRow): Promise<{ id: string }> {
    return this.db.withTenant(async (_tx, scoped) => {
      const parentItem = await scoped
        .selectFrom(
          schema.menuItems,
          and(
            eq(schema.menuItems.id, input.menuItemId),
            eq(schema.menuItems.brandId, input.brandId),
          ),
        )
        .limit(1);
      if (!parentItem[0]) {
        throw new MenuItemNotFoundError(input.menuItemId);
      }

      if (input.id) {
        const [row] = await scoped
          .updateTable(
            schema.menuItemSizes,
            {
              menuItemId: input.menuItemId,
              name: input.name,
              price: input.price,
              isDefault: input.isDefault,
              sortOrder: input.sortOrder,
              updatedAt: new Date(),
            },
            and(
              eq(schema.menuItemSizes.id, input.id),
              eq(schema.menuItemSizes.brandId, input.brandId),
            ),
          )
          .returning({ id: schema.menuItemSizes.id });
        if (!row) throw new MenuItemSizeNotFoundError(input.id);
        return { id: row.id };
      }
      const [row] = await scoped
        .insertInto(schema.menuItemSizes, {
          brandId: input.brandId,
          menuItemId: input.menuItemId,
          name: input.name,
          price: input.price,
          isDefault: input.isDefault,
          sortOrder: input.sortOrder,
        })
        .returning({ id: schema.menuItemSizes.id });
      if (!row) throw new Error('upsertItemSize: insert returned no row');
      return { id: row.id };
    });
  }

  async addToStopList(input: StopListInsertRow): Promise<{ id: string; itemSlug: string }> {
    return this.db.withTenant(async (_tx, scoped) => {
      // slug is captured before insert so it can ride in the outbox event payload for slug-keyed consumers.
      const existingItem = await scoped
        .selectFrom(
          schema.menuItems,
          and(eq(schema.menuItems.id, input.itemId), eq(schema.menuItems.brandId, input.brandId)),
        )
        .limit(1);
      const itemRow = existingItem[0];
      if (!itemRow) {
        throw new MenuItemNotFoundError(input.itemId);
      }
      const itemSlug = itemRow.slug;

      const inserted = await scoped
        .insertInto(schema.menuStopList, {
          brandId: input.brandId,
          itemId: input.itemId,
          reason: input.reason,
          stoppedByUserId: input.stoppedByUserId,
        })
        .onConflictDoNothing({
          target: [schema.menuStopList.tenantId, schema.menuStopList.itemId],
        })
        .returning({ id: schema.menuStopList.id });
      await this.#bumpStopVersion(scoped, input.brandId);
      if (inserted[0]) {
        return { id: inserted[0].id, itemSlug };
      }
      const existing = await scoped
        .selectFrom(schema.menuStopList, eq(schema.menuStopList.itemId, input.itemId))
        .limit(1);
      const existingRow = existing[0];
      if (!existingRow) {
        throw new Error('addToStopList: conflict path could not locate existing row');
      }
      return { id: existingRow.id, itemSlug };
    });
  }

  async removeFromStopList(input: {
    itemId: string;
    brandId: string;
  }): Promise<{ removed: boolean; itemSlug: string | null }> {
    return this.db.withTenant(async (tx, scoped) => {
      const itemRow = (
        await scoped
          .selectFrom(
            schema.menuItems,
            and(eq(schema.menuItems.id, input.itemId), eq(schema.menuItems.brandId, input.brandId)),
          )
          .limit(1)
      )[0];
      const itemSlug = itemRow?.slug ?? null;

      // Sole sanctioned hard DELETE on a tenant-scoped table — migration 0040 grants the privilege.
      // Two-column predicate satisfies RLS + ScopedTx auto-filter contract (ADR-0020 I-1).
      const ctx = requireTenantContext();
      const result = await tx
        .delete(schema.menuStopList)
        .where(
          and(
            eq(schema.menuStopList.tenantId, ctx.tenantId),
            eq(schema.menuStopList.brandId, input.brandId),
            eq(schema.menuStopList.itemId, input.itemId),
          ),
        )
        .returning({ id: schema.menuStopList.id });

      await this.#bumpStopVersion(scoped, input.brandId);

      return { removed: result.length > 0, itemSlug };
    });
  }

  async #bumpStopVersion(
    scoped: Parameters<Parameters<TenantAwareDb['withTenant']>[0]>[1],
    brandId: string,
  ): Promise<void> {
    await scoped
      .insertInto(schema.catalogBrandStopVersion, { brandId, stopVersion: 2 })
      .onConflictDoUpdate({
        target: [schema.catalogBrandStopVersion.brandId, schema.catalogBrandStopVersion.tenantId],
        set: { stopVersion: sql`${schema.catalogBrandStopVersion.stopVersion} + 1` },
      });
  }

  async getMenuFirstPublishedAt(tenantId: TenantId): Promise<Date | null> {
    return this.db.withTenant(async (tx) => {
      // tenants is not in TenantScopedTable (id IS the tenant id); direct tx.select with explicit eq() is the ADR-0020 I-1 pattern.
      const rows = await tx
        .select({ menuFirstPublishedAt: schema.tenants.menuFirstPublishedAt })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      return rows[0]?.menuFirstPublishedAt ?? null;
    });
  }

  // D-4a-06: tenants-row stamp + outbox insert in one tx so a concurrent publish cannot double-emit MenuFirstPublishedV1 (T-04a-06-05).
  async finalizeMenuPublish(input: {
    tenantId: TenantId;
  }): Promise<{ isFirstPublish: boolean; version: number }> {
    const { tenantId } = input;
    const hasAls = ((): boolean => {
      try {
        requireTenantContext();
        return true;
      } catch {
        return false;
      }
    })();

    const op = async (
      tx: Parameters<Parameters<TenantAwareDb['withTenant']>[0]>[0],
      scoped: Parameters<Parameters<TenantAwareDb['withTenant']>[0]>[1],
    ): Promise<{ isFirstPublish: boolean; version: number }> => {
      const bumped = await scoped
        .insertInto(schema.catalogMenuVersion, { menuVersion: 2 })
        .onConflictDoUpdate({
          target: [schema.catalogMenuVersion.tenantId],
          set: { menuVersion: sql`${schema.catalogMenuVersion.menuVersion} + 1` },
        })
        .returning({ menuVersion: schema.catalogMenuVersion.menuVersion });
      const version = bumped[0]?.menuVersion ?? 2;

      const rows = await tx
        .select({ menuFirstPublishedAt: schema.tenants.menuFirstPublishedAt })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      const firstAt = rows[0]?.menuFirstPublishedAt ?? null;
      const isFirstPublish = firstAt === null;
      if (isFirstPublish) {
        await tx
          .update(schema.tenants)
          .set({ menuFirstPublishedAt: new Date() })
          .where(eq(schema.tenants.id, tenantId));
        await appendToOutbox(tx, {
          envelope: buildEnvelope(MenuFirstPublishedV1, { tenantId, version }, { tenantId }),
        });
      } else {
        await appendToOutbox(tx, {
          envelope: buildEnvelope(MenuRepublishedV1, { tenantId, version }, { tenantId }),
        });
      }
      return { isFirstPublish, version };
    };

    return hasAls
      ? await this.db.withTenant(async (tx, scoped) => op(tx, scoped))
      : await this.db.withTenantId(tenantId, async (tx, scoped) => op(tx, scoped));
  }

  async insertSlugAlias(input: { itemId: string; alias: string }): Promise<void> {
    await this.db.withTenant(async (_tx, scoped) => {
      await scoped
        .insertInto(schema.menuItemSlugAliases, {
          itemId: input.itemId,
          alias: input.alias,
        })
        .onConflictDoNothing();
    });
  }

  async listCategoriesByParent(parentId: string | null | undefined): Promise<CategoryListRow[]> {
    return this.db.withTenant(async (_tx, scoped) => {
      const where =
        parentId === undefined
          ? undefined
          : parentId === null
            ? isNull(schema.menuCategories.parentId)
            : eq(schema.menuCategories.parentId, parentId);
      const rows = await scoped
        .selectFrom(schema.menuCategories, where)
        .orderBy(asc(schema.menuCategories.sortOrder), asc(schema.menuCategories.slug));
      return rows.map<CategoryListRow>((r) => ({
        id: r.id,
        parentId: r.parentId,
        slug: r.slug,
        name: r.name,
        description: r.description ?? null,
        sortOrder: r.sortOrder,
        status: r.status as 'draft' | 'published' | 'archived',
      }));
    });
  }

  async applyCategoryMoves(input: {
    brandId: string;
    moves: readonly { id: string; parentId: string | null; sortOrder: number }[];
  }): Promise<{ updated: number }> {
    return this.db.withTenant(async (_tx, scoped) => {
      const all = await scoped.selectFrom(
        schema.menuCategories,
        eq(schema.menuCategories.brandId, input.brandId),
      );
      const byId = new Map(all.map((c) => [c.id, c]));
      const childrenOf = new Map<string, number>();
      for (const c of all) {
        if (c.parentId !== null) {
          childrenOf.set(c.parentId, (childrenOf.get(c.parentId) ?? 0) + 1);
        }
      }

      for (const move of input.moves) {
        const current = byId.get(move.id);
        if (!current) {
          throw new MenuCategoryNotFoundError(move.id);
        }
        if (move.parentId !== null) {
          const parent = byId.get(move.parentId);
          if (!parent) {
            throw new MenuCategoryNotFoundError(move.parentId);
          }
          if (parent.parentId !== null) {
            throw new CategoryNestingDepthError(
              move.id,
              `Cannot nest category "${move.id}" under "${move.parentId}": parent is itself a child (depth would exceed 2).`,
            );
          }
          if ((childrenOf.get(move.id) ?? 0) > 0) {
            throw new CategoryNestingDepthError(
              move.id,
              `Cannot nest category "${move.id}": it has its own subcategories (would create depth-3 grandchildren).`,
            );
          }
        }
      }

      const updatedAt = new Date();
      let updated = 0;
      for (const move of input.moves) {
        await scoped
          .updateTable(
            schema.menuCategories,
            { parentId: move.parentId, sortOrder: move.sortOrder, updatedAt },
            and(
              eq(schema.menuCategories.id, move.id),
              eq(schema.menuCategories.brandId, input.brandId),
            ),
          )
          .execute();
        updated += 1;
      }
      return { updated };
    });
  }

  async listItems(input: {
    status: ItemStatusFilter;
    categoryId: string | null;
    q: string | null;
    limit: number;
    offset: number;
  }): Promise<{ rows: ItemListRow[]; total: number }> {
    return this.db.withTenant(async (tx, scoped) => {
      const ctx = requireTenantContext();
      const statusPred = ((): ReturnType<typeof eq> | undefined => {
        if (input.status === 'all') return undefined;
        if (input.status === 'active') return ne(schema.menuItems.status, 'archived');
        return eq(schema.menuItems.status, input.status);
      })();
      const categoryPred = input.categoryId
        ? eq(schema.menuItems.categoryId, input.categoryId)
        : undefined;
      const qPred = input.q
        ? or(
            ilike(schema.menuItems.slug, `%${input.q}%`),
            sql`${schema.menuItems.name}::text ILIKE ${`%${input.q}%`}`,
          )
        : undefined;
      const composed =
        [statusPred, categoryPred, qPred].filter((p): p is NonNullable<typeof p> => p !== undefined)
          .length > 0
          ? and(
              ...[statusPred, categoryPred, qPred].filter(
                (p): p is NonNullable<typeof p> => p !== undefined,
              ),
            )
          : undefined;

      const rows = await scoped
        .selectFrom(schema.menuItems, composed)
        .orderBy(asc(schema.menuItems.sortOrder), asc(schema.menuItems.slug));
      const sliced = rows.slice(input.offset, input.offset + input.limit);
      const total = rows.length;
      if (sliced.length === 0) {
        return { rows: [], total };
      }

      const itemIds = sliced.map((r) => r.id);
      const categoryIds = Array.from(new Set(sliced.map((r) => r.categoryId)));
      // Empty-literal `[]` branch must be typed against `$inferSelect`; otherwise TS unifies with the broader ScopedTx union and `.id` loses its type.
      type CategoryRow = typeof schema.menuCategories.$inferSelect;
      const categoryRows: CategoryRow[] =
        categoryIds.length > 0
          ? await scoped.selectFrom(
              schema.menuCategories,
              inArray(schema.menuCategories.id, categoryIds),
            )
          : [];
      const [sizeRows, stopRows] = await Promise.all([
        scoped.selectFrom(schema.menuItemSizes, inArray(schema.menuItemSizes.menuItemId, itemIds)),
        scoped.selectFrom(schema.menuStopList, inArray(schema.menuStopList.itemId, itemIds)),
      ]);
      const parentIds = Array.from(
        new Set(categoryRows.map((c) => c.parentId).filter((p): p is string => p !== null)),
      );
      const parentRows: CategoryRow[] =
        parentIds.length > 0
          ? await scoped.selectFrom(
              schema.menuCategories,
              inArray(schema.menuCategories.id, parentIds),
            )
          : [];

      const categoryById = new Map(categoryRows.map((c) => [c.id, c]));
      const parentNameById = new Map(parentRows.map((c) => [c.id, c.name]));
      const sizeByItem = new Set(sizeRows.map((s) => s.menuItemId));
      const stopByItem = new Map(stopRows.map((s) => [s.itemId, s.stoppedAt]));

      void ctx;
      void tx;

      return {
        rows: sliced.map<ItemListRow>((r) => {
          const cat = categoryById.get(r.categoryId);
          const parentName = cat?.parentId ? (parentNameById.get(cat.parentId) ?? null) : null;
          const stoppedAt = stopByItem.get(r.id) ?? null;
          const primaryPhoto = r.photos.find((p) => p.isPrimary) ?? r.photos[0] ?? null;
          return {
            id: r.id,
            slug: r.slug,
            name: r.name,
            categoryId: r.categoryId,
            categoryName: cat?.name ?? null,
            parentCategoryName: parentName,
            photo: primaryPhoto
              ? { s3Key: primaryPhoto.s3Key, sortOrder: primaryPhoto.sortOrder }
              : null,
            basePrice: r.basePrice,
            currency: r.currency,
            status: r.status as 'draft' | 'published' | 'archived',
            hasSizes: sizeByItem.has(r.id),
            stoppedAt: stoppedAt ? stoppedAt.toISOString() : null,
            sortOrder: r.sortOrder,
          };
        }),
        total,
      };
    });
  }

  async getItemById(id: string): Promise<ItemDetailRow | null> {
    return this.db.withTenant(async (_tx, scoped) => {
      const rows = await scoped.selectFrom(schema.menuItems, eq(schema.menuItems.id, id)).limit(1);
      const r = rows[0];
      if (!r) return null;
      const [sizes, links] = await Promise.all([
        scoped
          .selectFrom(schema.menuItemSizes, eq(schema.menuItemSizes.menuItemId, id))
          .orderBy(asc(schema.menuItemSizes.sortOrder)),
        scoped.selectFrom(
          schema.menuItemModifierGroups,
          eq(schema.menuItemModifierGroups.menuItemId, id),
        ),
      ]);
      return {
        id: r.id,
        categoryId: r.categoryId,
        slug: r.slug,
        name: r.name,
        description: r.description ?? null,
        basePrice: r.basePrice,
        currency: r.currency,
        photos: r.photos,
        allergens: r.allergens ?? null,
        ingredients: r.ingredients ?? null,
        metaTitle: r.metaTitle ?? null,
        metaDescription: r.metaDescription ?? null,
        proteins: r.proteins === null ? null : Number(r.proteins),
        fats: r.fats === null ? null : Number(r.fats),
        carbs: r.carbs === null ? null : Number(r.carbs),
        kcal: r.kcal,
        nutritionEstimated: r.nutritionEstimated,
        source: r.source as 'manual' | 'ai_generated' | 'imported_iiko' | 'imported_csv',
        needsReview: r.needsReview,
        sourceExternalId: r.sourceExternalId,
        status: r.status as 'draft' | 'published' | 'archived',
        sortOrder: r.sortOrder,
        sizes: sizes.map((s) => ({
          id: s.id,
          name: s.name,
          price: s.price,
          isDefault: s.isDefault,
          sortOrder: s.sortOrder,
        })),
        modifierGroupIds: links.map((m) => m.modifierGroupId),
      };
    });
  }

  async listModifierGroups(): Promise<ModifierGroupListRow[]> {
    return this.db.withTenant(async (_tx, scoped) => {
      const groups = await scoped
        .selectFrom(schema.menuModifierGroups)
        .orderBy(asc(schema.menuModifierGroups.id));
      if (groups.length === 0) return [];
      const groupIds = groups.map((g) => g.id);
      const [options, links] = await Promise.all([
        scoped.selectFrom(
          schema.menuModifierOptions,
          inArray(schema.menuModifierOptions.modifierGroupId, groupIds),
        ),
        scoped.selectFrom(
          schema.menuItemModifierGroups,
          inArray(schema.menuItemModifierGroups.modifierGroupId, groupIds),
        ),
      ]);
      const optionCount = new Map<string, number>();
      for (const o of options)
        optionCount.set(o.modifierGroupId, (optionCount.get(o.modifierGroupId) ?? 0) + 1);
      const usageCount = new Map<string, number>();
      for (const l of links)
        usageCount.set(l.modifierGroupId, (usageCount.get(l.modifierGroupId) ?? 0) + 1);
      return groups.map<ModifierGroupListRow>((g) => ({
        id: g.id,
        name: g.name,
        minSelectable: g.minSelectable,
        maxSelectable: g.maxSelectable,
        isRequired: g.isRequired,
        optionCount: optionCount.get(g.id) ?? 0,
        usageCount: usageCount.get(g.id) ?? 0,
      }));
    });
  }

  async getModifierGroupById(id: string): Promise<ModifierGroupDetailRow | null> {
    return this.db.withTenant(async (_tx, scoped) => {
      const rows = await scoped
        .selectFrom(schema.menuModifierGroups, eq(schema.menuModifierGroups.id, id))
        .limit(1);
      const g = rows[0];
      if (!g) return null;
      const options = await scoped
        .selectFrom(schema.menuModifierOptions, eq(schema.menuModifierOptions.modifierGroupId, id))
        .orderBy(asc(schema.menuModifierOptions.sortOrder));
      return {
        id: g.id,
        name: g.name,
        minSelectable: g.minSelectable,
        maxSelectable: g.maxSelectable,
        isRequired: g.isRequired,
        options: options.map((o) => ({
          id: o.id,
          name: o.name,
          priceDelta: o.priceDelta,
          defaultAmount: o.defaultAmount,
          freeAmount: o.freeAmount,
          sortOrder: o.sortOrder,
        })),
      };
    });
  }

  async listStopListWithStoppedAt(): Promise<StopListEntryRow[]> {
    return this.db.withTenant(async (_tx, scoped) => {
      const stopRows = await scoped
        .selectFrom(schema.menuStopList)
        .orderBy(desc(schema.menuStopList.stoppedAt));
      if (stopRows.length === 0) return [];
      const itemIds = stopRows.map((s) => s.itemId);
      const items = await scoped.selectFrom(
        schema.menuItems,
        inArray(schema.menuItems.id, itemIds),
      );
      const itemById = new Map(items.map((i) => [i.id, i]));
      const categoryIds = Array.from(new Set(items.map((i) => i.categoryId)));
      const categories =
        categoryIds.length > 0
          ? await scoped.selectFrom(
              schema.menuCategories,
              inArray(schema.menuCategories.id, categoryIds),
            )
          : [];
      const catById = new Map(categories.map((c) => [c.id, c.name]));
      return stopRows.map<StopListEntryRow>((s) => {
        const item = itemById.get(s.itemId);
        return {
          id: s.id,
          itemId: s.itemId,
          itemName: item?.name ?? null,
          categoryName: item ? (catById.get(item.categoryId) ?? null) : null,
          stoppedAt: s.stoppedAt.toISOString(),
          reason: s.reason ?? null,
        };
      });
    });
  }

  async computeDraftDiff(input: { tenantId: TenantId }): Promise<{
    items: DraftDiffEntryRow[];
    totalCount: number;
  }> {
    return this.db.withTenant(async (tx, scoped) => {
      const firstPublishedRows = await tx
        .select({ at: schema.tenants.menuFirstPublishedAt })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, input.tenantId))
        .limit(1);
      const firstPublishedAt = firstPublishedRows[0]?.at ?? null;

      const items = await scoped.selectFrom(schema.menuItems);
      const entries: DraftDiffEntryRow[] = [];
      for (const it of items) {
        if (it.status === 'draft') {
          entries.push({ entityType: 'item', id: it.id, name: it.name, status: 'draft' });
        } else if (it.status === 'archived') {
          entries.push({ entityType: 'item', id: it.id, name: it.name, status: 'archived' });
        } else if (
          it.status === 'published' &&
          firstPublishedAt !== null &&
          it.updatedAt > firstPublishedAt
        ) {
          entries.push({ entityType: 'item', id: it.id, name: it.name, status: 'modified' });
        }
      }
      const totalCount = entries.length;
      const sliced = entries.slice(0, 100);
      return { items: sliced, totalCount };
    });
  }

  async archiveCategory(id: string, brandId: string): Promise<{ found: boolean }> {
    return this.db.withTenant(async (_tx, scoped) => {
      const rows = await scoped
        .updateTable(
          schema.menuCategories,
          { status: 'archived', updatedAt: new Date() },
          and(eq(schema.menuCategories.id, id), eq(schema.menuCategories.brandId, brandId)),
        )
        .returning({ id: schema.menuCategories.id });
      return { found: rows.length > 0 };
    });
  }

  async archiveItem(id: string, brandId: string): Promise<{ found: boolean }> {
    return this.db.withTenant(async (_tx, scoped) => {
      const rows = await scoped
        .updateTable(
          schema.menuItems,
          { status: 'archived', updatedAt: new Date() },
          and(eq(schema.menuItems.id, id), eq(schema.menuItems.brandId, brandId)),
        )
        .returning({ id: schema.menuItems.id });
      return { found: rows.length > 0 };
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
