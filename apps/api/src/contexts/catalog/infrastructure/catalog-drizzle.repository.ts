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
import { and, eq, inArray } from 'drizzle-orm';
import {
  IMAGE_URL_PORT,
  type CatalogRepository,
  type ImageUrlPort,
  type StopListInsertRow,
  type UpsertCategoryRow,
  type UpsertItemRow,
  type UpsertItemSizeRow,
  type UpsertModifierGroupRow,
  type UpsertModifierOptionRow,
} from '../domain/ports';
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

/** Signed image URLs match the catalog cache TTL — see GetPublishedMenuService. */
const IMAGE_URL_TTL_SECONDS = 300;

@Injectable()
export class CatalogDrizzleRepository implements CatalogRepository {
  constructor(
    @Inject(TenantAwareDb) private readonly db: TenantAwareDb,
    @Inject(IMAGE_URL_PORT) private readonly imageUrl: ImageUrlPort,
  ) {}

  private async signPhotos(photos: readonly MenuItemPhoto[]): Promise<PublishedMenuItemPhoto[]> {
    return Promise.all(
      photos.map(async (p) => {
        const signed: PublishedMenuItemPhoto = {
          s3Key: p.s3Key,
          sortOrder: p.sortOrder,
          ...(p.alt !== undefined ? { alt: p.alt } : {}),
          ...(p.width !== undefined ? { width: p.width } : {}),
          ...(p.height !== undefined ? { height: p.height } : {}),
          ...(p.isPrimary !== undefined ? { isPrimary: p.isPrimary } : {}),
          url: await this.imageUrl.presignGet(p.s3Key, IMAGE_URL_TTL_SECONDS),
        };
        return signed;
      }),
    );
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

      // D-4a-10: stop-list overlay (RESEARCH.md Pattern 2). Three parallel
      // scoped selects; stopped items are filtered before any per-item join
      // queries fire so the size + modifier-group selects don't pay for rows
      // we throw away.
      const [categoriesRows, allItemsRows, stopListRows, brandRows] = await Promise.all([
        scoped.selectFrom(
          schema.menuCategories,
          brandId ? eq(schema.menuCategories.brandId, brandId) : undefined,
        ),
        scoped.selectFrom(schema.menuItems, itemsBaseConditions),
        scoped.selectFrom(schema.menuStopList),
        brandRowPromise,
      ]);

      const stoppedItemIds = new Set(stopListRows.map((r) => r.itemId));
      const itemsRows = allItemsRows.filter((r) => !stoppedItemIds.has(r.id));

      const [sizesRows, itemModifierRows, modifierGroupsRows] = await Promise.all([
        scoped.selectFrom(schema.menuItemSizes),
        scoped.selectFrom(schema.menuItemModifierGroups),
        scoped.selectFrom(schema.menuModifierGroups),
      ]);

      const optionsRows =
        modifierGroupsRows.length === 0
          ? []
          : await scoped.selectFrom(
              schema.menuModifierOptions,
              inArray(
                schema.menuModifierOptions.modifierGroupId,
                modifierGroupsRows.map((m) => m.id),
              ),
            );

      const sizesByItem = groupBy(sizesRows, (r) => r.menuItemId);
      const modifierGroupsByItem = groupBy(itemModifierRows, (r) => r.menuItemId);
      const optionsByModifierGroup = groupBy(optionsRows, (r) => r.modifierGroupId);

      const items = await Promise.all(
        itemsRows.map<Promise<PublishedMenuItem>>(async (r) => {
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
      const [items, stopListRows] = await Promise.all([
        scoped.selectFrom(schema.menuItems, where).limit(1),
        scoped.selectFrom(schema.menuStopList, eq(schema.menuStopList.itemId, itemId)),
      ]);
      const row = items[0];
      if (!row) return null;
      // D-4a-10: stopped items must not surface via the per-item read either.
      if (stopListRows.length > 0) return null;
      const [sizes, links] = await Promise.all([
        scoped.selectFrom(schema.menuItemSizes, eq(schema.menuItemSizes.menuItemId, row.id)),
        scoped.selectFrom(
          schema.menuItemModifierGroups,
          eq(schema.menuItemModifierGroups.menuItemId, row.id),
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
      };
    });
  }

  async upsertCategory(input: UpsertCategoryRow): Promise<{ id: string }> {
    return this.db.withTenant(async (_tx, scoped) => {
      const [row] = await scoped
        .insertInto(schema.menuCategories, {
          ...(input.id ? { id: input.id } : {}),
          brandId: input.brandId ?? null,
          parentId: input.parentId ?? null,
          slug: input.slug,
          name: input.name,
          description: input.description,
          sortOrder: input.sortOrder,
        })
        .onConflictDoUpdate({
          target: [schema.menuCategories.tenantId, schema.menuCategories.slug],
          set: {
            brandId: input.brandId ?? null,
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
      // Detect slug change for alias insertion: read the existing item's slug
      // BEFORE the upsert when an id is supplied.
      let oldSlug: string | null = null;
      if (input.id) {
        const existing = await scoped
          .selectFrom(schema.menuItems, eq(schema.menuItems.id, input.id))
          .limit(1);
        oldSlug = existing[0]?.slug ?? null;
      }

      // Drizzle's `$inferInsert` wants a mutable array; clone from readonly.
      const photos: MenuItemPhoto[] = [...input.photos];

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
          // Drizzle `numeric` columns accept strings; decimals come back as
          // strings on read for full-fidelity round-trip.
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

      if (oldSlug !== null && oldSlug !== input.slug) {
        // D-4a-04: slug change → alias the prior slug. Idempotent via
        // onConflictDoNothing — old slug may already exist from a rename cycle.
        await scoped
          .insertInto(schema.menuItemSlugAliases, {
            itemId: row.id,
            alias: oldSlug,
          })
          .onConflictDoNothing();
        return { id: row.id, slugChanged: { oldSlug } };
      }
      return { id: row.id };
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
            eq(schema.menuModifierGroups.id, input.id),
          )
          .returning({ id: schema.menuModifierGroups.id });
        if (!row) throw new Error('upsertModifierGroup: update returned no row');
        return { id: row.id };
      }
      const [row] = await scoped
        .insertInto(schema.menuModifierGroups, {
          brandId: input.brandId ?? null,
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
            eq(schema.menuModifierOptions.id, input.id),
          )
          .returning({ id: schema.menuModifierOptions.id });
        if (!row) throw new Error('upsertModifierOption: update returned no row');
        return { id: row.id };
      }
      const [row] = await scoped
        .insertInto(schema.menuModifierOptions, {
          brandId: input.brandId ?? null,
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
            eq(schema.menuItemSizes.id, input.id),
          )
          .returning({ id: schema.menuItemSizes.id });
        if (!row) throw new Error('upsertItemSize: update returned no row');
        return { id: row.id };
      }
      const [row] = await scoped
        .insertInto(schema.menuItemSizes, {
          brandId: input.brandId ?? null,
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
      // Look up the item slug FIRST — the outbox event payload carries it
      // for downstream consumers that key by slug (e.g. SEO cache busts).
      const existingItem = await scoped
        .selectFrom(schema.menuItems, eq(schema.menuItems.id, input.itemId))
        .limit(1);
      const itemRow = existingItem[0];
      if (!itemRow) {
        throw new Error(`addToStopList: item ${input.itemId} not found`);
      }
      const itemSlug = itemRow.slug;

      const inserted = await scoped
        .insertInto(schema.menuStopList, {
          brandId: input.brandId ?? null,
          itemId: input.itemId,
          reason: input.reason,
          stoppedByUserId: input.stoppedByUserId,
        })
        .onConflictDoNothing({
          target: [schema.menuStopList.tenantId, schema.menuStopList.itemId],
        })
        .returning({ id: schema.menuStopList.id });
      if (inserted[0]) {
        return { id: inserted[0].id, itemSlug };
      }
      // Conflict path: an entry already exists for this (tenant, item).
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
  }): Promise<{ removed: boolean; itemSlug: string | null }> {
    return this.db.withTenant(async (tx, scoped) => {
      const itemRow = (
        await scoped.selectFrom(schema.menuItems, eq(schema.menuItems.id, input.itemId)).limit(1)
      )[0];
      const itemSlug = itemRow?.slug ?? null;

      // ScopedTx forbids DELETE by design; the unstop path is the only
      // sanctioned hard-delete on a tenant-scoped table — migration 0040
      // grants the privilege explicitly. The two-column predicate satisfies
      // RLS + the ScopedTx auto-filter contract.
      const ctx = requireTenantContext();
      const result = await tx
        .delete(schema.menuStopList)
        .where(
          and(
            eq(schema.menuStopList.tenantId, ctx.tenantId),
            eq(schema.menuStopList.itemId, input.itemId),
          ),
        )
        .returning({ id: schema.menuStopList.id });

      return { removed: result.length > 0, itemSlug };
    });
  }

  async getMenuFirstPublishedAt(tenantId: TenantId): Promise<Date | null> {
    return this.db.withTenant(async (tx) => {
      // `tenants` is not in TenantScopedTable (id IS the tenant id, no
      // tenant_id FK column). Direct tx.select with explicit equality is
      // the established pattern (ADR-0020 I-1; mirrors `findCurrentTenant`).
      const rows = await tx
        .select({ menuFirstPublishedAt: schema.tenants.menuFirstPublishedAt })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      return rows[0]?.menuFirstPublishedAt ?? null;
    });
  }

  /**
   * D-4a-06: atomic publish-finalize. Stamps
   * `tenants.menu_first_published_at` if NULL and emits the
   * `MenuFirstPublishedV1` event; otherwise emits `MenuRepublishedV1`. Both
   * tenants-row write and outbox insert happen in the same transaction so a
   * concurrent publish cannot emit the first-publish event twice
   * (T-04a-06-05). `tenants` is platform-level (no tenant_id column); the
   * `eq(tenants.id, tenantId)` predicate is the canonical ADR-0020 I-1
   * pattern for self-iso queries on the tenants table.
   */
  async finalizeMenuPublish(input: {
    tenantId: TenantId;
    version: number;
  }): Promise<{ isFirstPublish: boolean }> {
    const { tenantId, version } = input;
    // Choose ALS-bound vs explicit binding depending on caller context.
    // `withTenant` requires an active ALS frame; `withTenantId` requires the
    // ALS frame to be ABSENT. Probe ALS once at the boundary.
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
    ): Promise<boolean> => {
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
      return isFirstPublish;
    };

    const isFirstPublish = hasAls
      ? await this.db.withTenant(async (tx) => op(tx))
      : await this.db.withTenantId(tenantId, async (tx) => op(tx));
    return { isFirstPublish };
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
