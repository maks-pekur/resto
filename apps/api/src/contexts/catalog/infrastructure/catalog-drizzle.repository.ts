import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext, schema, TenantAwareDb, type MenuItemPhoto } from '@resto/db';
import {
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
  type AggregateStopListRow,
  type CategoryListRow,
  type CatalogRepository,
  type DraftDiffEntryRow,
  type ImageUrlPort,
  type ItemDetailRow,
  type ItemListRow,
  type ItemStatusFilter,
  type ModifierGroupDetailRow,
  type ModifierGroupListRow,
  type ModifierOptionListRow,
  type ModifierOptionUsageRow,
  type OptionStopListEntryRow,
  type OptionStopListInsertRow,
  type StopListEntryRow,
  type StopListInsertRow,
  type UpsertCategoryRow,
  type UpsertItemRow,
  type UpsertItemSizeRow,
  type UpsertModifierGroupRow,
  type UpsertModifierOptionRow,
} from '../domain/ports';
import {
  CatalogCodeConflictError,
  CategoryNestingDepthError,
  MenuCategoryNotFoundError,
  MenuIngredientAlreadyAttachedError,
  MenuItemNotFoundError,
  MenuItemSizeNotFoundError,
  MenuModifierGroupNotFoundError,
  MenuModifierOptionNotFoundError,
} from '../domain/errors';
import type {
  PublishedMenu,
  PublishedMenuCategory,
  PublishedMenuItem,
  PublishedMenuItemPhoto,
  PublishedMenuItemSize,
  PublishedMenuModifierGroup,
  PublishedMenuModifierOption,
} from '../domain/published-menu';

const AGGREGATE_STOP_LIST_PAGE_SIZE = 50;

@Injectable()
export class CatalogDrizzleRepository implements CatalogRepository {
  /** Operator-surface photos live in the private upload prefix, so a browser cannot
   * fetch them by key — reads carry a presigned url. Same 300s ceiling the upload URL
   * uses (OWASP V12); a page view never outlives it, and presigning is local SigV4
   * arithmetic, not an S3 round trip. `presignGet` degrades to '' rather than throwing,
   * so an S3 outage blanks a thumbnail instead of failing the list. */
  static readonly PHOTO_URL_TTL_SECONDS = 300;

  constructor(
    @Inject(TenantAwareDb) private readonly db: TenantAwareDb,
    @Inject(IMAGE_URL_PORT) private readonly imageUrl: ImageUrlPort,
  ) {}

  /** Published photos are addressed, not signed: the URL is computed from the key,
   * so reading a menu makes no S3 call and an S3 outage cannot blank it. */
  private publicPhotos(photos: readonly MenuItemPhoto[]): PublishedMenuItemPhoto[] {
    return photos.map((p) => ({
      s3Key: p.s3Key,
      sortOrder: p.sortOrder,
      ...(p.alt !== undefined ? { alt: p.alt } : {}),
      ...(p.width !== undefined ? { width: p.width } : {}),
      ...(p.height !== undefined ? { height: p.height } : {}),
      ...(p.isPrimary !== undefined ? { isPrimary: p.isPrimary } : {}),
      url: this.imageUrl.publicUrl(p.s3Key),
    }));
  }

  async listPublishedPhotoKeys(): Promise<string[]> {
    return this.db.withTenant(async (_tx, scoped) => {
      const rows = await scoped.selectFrom(
        schema.menuItems,
        eq(schema.menuItems.status, 'published'),
      );
      const keys = new Set<string>();
      for (const row of rows) {
        for (const photo of row.photos) keys.add(photo.s3Key);
      }
      return [...keys];
    });
  }

  async loadPublishedMenu(tenantId: TenantId, version: number): Promise<PublishedMenu> {
    return this.db.withTenant(async (_tx, scoped) => {
      const [categoriesRows, allItemsRows] = await Promise.all([
        scoped.selectFrom(schema.menuCategories),
        scoped.selectFrom(schema.menuItems, eq(schema.menuItems.status, 'published')),
      ]);

      const [sizesRows, itemModifierRows, modifierGroupsRows, groupOptionsRows, itemOptionsRows] =
        await Promise.all([
          scoped.selectFrom(schema.menuItemSizes),
          scoped.selectFrom(schema.menuItemModifierGroups),
          scoped.selectFrom(schema.menuModifierGroups),
          scoped.selectFrom(schema.menuModifierGroupOptions),
          scoped.selectFrom(schema.menuItemModifierOptions),
        ]);

      const unionOptionIds = new Set<string>();
      for (const row of groupOptionsRows) unionOptionIds.add(row.optionId);
      for (const row of itemOptionsRows) unionOptionIds.add(row.optionId);
      for (const item of allItemsRows) {
        for (const line of item.compositionAssembled) unionOptionIds.add(line.optionId);
      }

      const optionRows =
        unionOptionIds.size === 0
          ? []
          : await scoped.selectFrom(
              schema.menuModifierOptions,
              inArray(schema.menuModifierOptions.id, [...unionOptionIds]),
            );
      // A Map keyed by option id is what makes "one bacon in three groups is one payload
      // entry and one price" true by construction (D-03).
      const modifierOptionsById = new Map<string, PublishedMenuModifierOption>(
        optionRows.map((o) => [
          o.id,
          {
            id: o.id,
            name: o.name,
            description: o.description ?? null,
            imageUrl: o.imageS3Key ? this.imageUrl.publicUrl(o.imageS3Key) : null,
            priceDelta: MoneyAmount.parse(o.priceDelta),
            freeAmount: o.freeAmount,
            minAmount: o.minAmount ?? null,
            maxAmount: o.maxAmount ?? null,
          },
        ]),
      );

      const sizesByItem = groupBy(sizesRows, (r) => r.menuItemId);
      const modifierGroupsByItem = groupBy(itemModifierRows, (r) => r.menuItemId);
      const optionIdsByGroup = groupBy(groupOptionsRows, (r) => r.modifierGroupId);
      const extraOptionIdsByItem = groupBy(itemOptionsRows, (r) => r.menuItemId);

      const items = allItemsRows.map<PublishedMenuItem>((r) => {
        const photos = this.publicPhotos(r.photos);
        return {
          id: MenuItemId.parse(r.id),
          slug: r.slug,
          categoryId: MenuCategoryId.parse(r.categoryId),
          name: r.name,
          description: r.description ?? null,
          basePrice: MoneyAmount.parse(r.basePrice),
          currency: Currency.parse(r.currency),
          code: r.code ?? null,
          weight: r.weight ?? null,
          measureUnit: (r.measureUnit ?? null) as 'g' | 'kg' | 'ml' | 'l' | 'pcs' | null,
          imageUrl: photos[0]?.url ?? null,
          photos,
          allergens: r.allergens ?? [],
          diets: r.diets ?? [],
          sortOrder: r.sortOrder,
          proteins: r.proteins ?? null,
          fats: r.fats ?? null,
          carbs: r.carbs ?? null,
          kcal: r.kcal ?? null,
          sizes: (sizesByItem.get(r.id) ?? []).map<PublishedMenuItemSize>((v) => ({
            id: MenuVariantId.parse(v.id),
            name: v.name,
            price: MoneyAmount.parse(v.price),
            isDefault: v.isDefault,
            sortOrder: v.sortOrder,
          })),
          // The link table stores the order the operator arranged; without this the guest sees
          // whatever order the rows came back in.
          modifierGroupIds: (modifierGroupsByItem.get(r.id) ?? [])
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((m) => MenuModifierId.parse(m.modifierGroupId)),
          extraOptionIds: (extraOptionIdsByItem.get(r.id) ?? [])
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((o) => o.optionId),
          compositionMode: r.compositionMode as 'text' | 'assembled',
          composition: r.composition ?? [],
          compositionLines: r.compositionAssembled,
        };
      });

      const categories = categoriesRows.map<PublishedMenuCategory>((r) => ({
        id: MenuCategoryId.parse(r.id),
        slug: r.slug,
        name: r.name,
        description: r.description ?? null,
        sortOrder: r.sortOrder,
        code: r.code ?? null,
      }));

      const modifierGroups = modifierGroupsRows.map<PublishedMenuModifierGroup>((r) => ({
        id: MenuModifierId.parse(r.id),
        name: r.name,
        display: r.display as 'tiles' | 'tabs',
        behaviour: r.behaviour as 'one' | 'several',
        isRequired: r.isRequired,
        optionIds: (optionIdsByGroup.get(r.id) ?? [])
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((o) => o.optionId),
      }));

      const currency = items[0]?.currency ?? Currency.parse('USD');

      return {
        tenantId,
        version,
        currency,
        categories: categories.sort((a, b) => a.sortOrder - b.sortOrder),
        items: items.sort((a, b) => a.sortOrder - b.sortOrder),
        modifierGroups,
        modifierOptions: [...modifierOptionsById.values()],
      };
    });
  }

  async findPublishedItem(itemId: string): Promise<PublishedMenuItem | null> {
    return this.db.withTenant(async (_tx, scoped) => {
      const where = and(eq(schema.menuItems.id, itemId), eq(schema.menuItems.status, 'published'));
      const items = await scoped.selectFrom(schema.menuItems, where).limit(1);
      const row = items[0];
      if (!row) return null;

      const [sizes, links, itemOptions] = await Promise.all([
        scoped.selectFrom(schema.menuItemSizes, eq(schema.menuItemSizes.menuItemId, row.id)),
        scoped.selectFrom(
          schema.menuItemModifierGroups,
          eq(schema.menuItemModifierGroups.menuItemId, row.id),
        ),
        scoped.selectFrom(
          schema.menuItemModifierOptions,
          eq(schema.menuItemModifierOptions.menuItemId, row.id),
        ),
      ]);
      const photos = this.publicPhotos(row.photos);
      return {
        id: MenuItemId.parse(row.id),
        slug: row.slug,
        categoryId: MenuCategoryId.parse(row.categoryId),
        name: row.name,
        description: row.description ?? null,
        basePrice: MoneyAmount.parse(row.basePrice),
        currency: Currency.parse(row.currency),
        code: row.code ?? null,
        weight: row.weight ?? null,
        measureUnit: (row.measureUnit ?? null) as 'g' | 'kg' | 'ml' | 'l' | 'pcs' | null,
        imageUrl: photos[0]?.url ?? null,
        photos,
        allergens: row.allergens ?? [],
        diets: row.diets ?? [],
        sortOrder: row.sortOrder,
        proteins: row.proteins ?? null,
        fats: row.fats ?? null,
        carbs: row.carbs ?? null,
        kcal: row.kcal ?? null,
        sizes: sizes.map<PublishedMenuItemSize>((v) => ({
          id: MenuVariantId.parse(v.id),
          name: v.name,
          price: MoneyAmount.parse(v.price),
          isDefault: v.isDefault,
          sortOrder: v.sortOrder,
        })),
        modifierGroupIds: links.map((m) => MenuModifierId.parse(m.modifierGroupId)),
        extraOptionIds: itemOptions
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((o) => o.optionId),
        compositionMode: row.compositionMode as 'text' | 'assembled',
        composition: row.composition ?? [],
        compositionLines: row.compositionAssembled,
      };
    });
  }

  async upsertCategory(input: UpsertCategoryRow): Promise<{ id: string }> {
    return this.db.withTenant(async (_tx, scoped) => {
      try {
        const [row] = await scoped
          .insertInto(schema.menuCategories, {
            ...(input.id ? { id: input.id } : {}),
            parentId: input.parentId ?? null,
            slug: input.slug,
            name: input.name,
            description: input.description,
            sortOrder: input.sortOrder,
            code: input.code,
          })
          .onConflictDoUpdate({
            target: [schema.menuCategories.tenantId, schema.menuCategories.slug],
            set: {
              parentId: input.parentId ?? null,
              name: input.name,
              description: input.description,
              sortOrder: input.sortOrder,
              code: input.code,
              updatedAt: new Date(),
            },
          })
          .returning({ id: schema.menuCategories.id });
        if (!row) throw new Error('upsertCategory: insert returned no row');
        return { id: row.id };
      } catch (err) {
        if (isCodeUniqueViolation(err, 'menu_categories_tenant_code_uq')) {
          throw new CatalogCodeConflictError('category', input.code ?? '');
        }
        throw err;
      }
    });
  }

  async upsertItem(
    input: UpsertItemRow,
  ): Promise<{ id: string; slugChanged?: { oldSlug: string } }> {
    try {
      return await this.db.withTenant(async (_tx, scoped) => {
        const parentCategory = await scoped
          .selectFrom(schema.menuCategories, eq(schema.menuCategories.id, input.categoryId))
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
          oldSlug = existingRow?.slug ?? null;

          if (existing.length === 0) {
            let row: { id: string } | undefined;
            try {
              [row] = await scoped
                .insertInto(schema.menuItems, {
                  id: input.id,
                  categoryId: input.categoryId,
                  slug: input.slug,
                  name: input.name,
                  description: input.description,
                  basePrice: input.basePrice,
                  currency: input.currency,
                  photos,
                  allergens: input.allergens ? [...input.allergens] : null,
                  diets: input.diets ? [...input.diets] : null,
                  composition: input.composition ? [...input.composition] : null,
                  compositionMode: input.compositionMode,
                  compositionAssembled: [...input.compositionAssembled],
                  metaTitle: input.metaTitle,
                  metaDescription: input.metaDescription,
                  proteins: input.proteins === null ? null : input.proteins.toString(),
                  fats: input.fats === null ? null : input.fats.toString(),
                  carbs: input.carbs === null ? null : input.carbs.toString(),
                  kcal: input.kcal,
                  source: input.source,
                  needsReview: input.needsReview,
                  sourceExternalId: input.sourceExternalId,
                  status: input.status,
                  sortOrder: input.sortOrder,
                  code: input.code,
                  weight: input.weight === null ? null : input.weight.toString(),
                  measureUnit: input.measureUnit,
                })
                .returning({ id: schema.menuItems.id });
            } catch (insertErr) {
              if (isCodeUniqueViolation(insertErr, 'menu_items_pkey')) {
                throw new MenuItemNotFoundError(input.id);
              }
              throw insertErr;
            }
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
                  diets: input.diets ? [...input.diets] : null,
                  composition: input.composition ? [...input.composition] : null,
                  compositionMode: input.compositionMode,
                  compositionAssembled: [...input.compositionAssembled],
                  metaTitle: input.metaTitle,
                  metaDescription: input.metaDescription,
                  proteins: input.proteins === null ? null : input.proteins.toString(),
                  fats: input.fats === null ? null : input.fats.toString(),
                  carbs: input.carbs === null ? null : input.carbs.toString(),
                  kcal: input.kcal,
                  source: input.source,
                  needsReview: input.needsReview,
                  sourceExternalId: input.sourceExternalId,
                  status: input.status,
                  sortOrder: input.sortOrder,
                  code: input.code,
                  weight: input.weight === null ? null : input.weight.toString(),
                  measureUnit: input.measureUnit,
                  updatedAt: new Date(),
                },
                eq(schema.menuItems.id, input.id),
              )
              .returning({ id: schema.menuItems.id });
            if (!row) throw new MenuItemNotFoundError(input.id);
            rowId = row.id;
          }
        } else {
          const [row] = await scoped
            .insertInto(schema.menuItems, {
              categoryId: input.categoryId,
              slug: input.slug,
              name: input.name,
              description: input.description,
              basePrice: input.basePrice,
              currency: input.currency,
              photos,
              allergens: input.allergens ? [...input.allergens] : null,
              diets: input.diets ? [...input.diets] : null,
              composition: input.composition ? [...input.composition] : null,
              compositionMode: input.compositionMode,
              compositionAssembled: [...input.compositionAssembled],
              metaTitle: input.metaTitle,
              metaDescription: input.metaDescription,
              proteins: input.proteins === null ? null : input.proteins.toString(),
              fats: input.fats === null ? null : input.fats.toString(),
              carbs: input.carbs === null ? null : input.carbs.toString(),
              kcal: input.kcal,
              source: input.source,
              needsReview: input.needsReview,
              sourceExternalId: input.sourceExternalId,
              status: input.status,
              sortOrder: input.sortOrder,
              code: input.code,
              weight: input.weight === null ? null : input.weight.toString(),
              measureUnit: input.measureUnit,
            })
            .onConflictDoUpdate({
              target: [schema.menuItems.tenantId, schema.menuItems.slug],
              set: {
                categoryId: input.categoryId,
                name: input.name,
                description: input.description,
                basePrice: input.basePrice,
                currency: input.currency,
                photos,
                allergens: input.allergens ? [...input.allergens] : null,
                diets: input.diets ? [...input.diets] : null,
                composition: input.composition ? [...input.composition] : null,
                compositionMode: input.compositionMode,
                compositionAssembled: [...input.compositionAssembled],
                metaTitle: input.metaTitle,
                metaDescription: input.metaDescription,
                proteins: input.proteins === null ? null : input.proteins.toString(),
                fats: input.fats === null ? null : input.fats.toString(),
                carbs: input.carbs === null ? null : input.carbs.toString(),
                kcal: input.kcal,
                source: input.source,
                needsReview: input.needsReview,
                sourceExternalId: input.sourceExternalId,
                status: input.status,
                sortOrder: input.sortOrder,
                code: input.code,
                weight: input.weight === null ? null : input.weight.toString(),
                measureUnit: input.measureUnit,
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
    } catch (err) {
      if (isCodeUniqueViolation(err, 'menu_items_tenant_code_uq')) {
        throw new CatalogCodeConflictError('item', input.code ?? '');
      }
      throw err;
    }
  }

  async upsertModifierGroup(input: UpsertModifierGroupRow): Promise<{ id: string }> {
    return this.db.withTenant(async (_tx, scoped) => {
      if (input.id) {
        const [row] = await scoped
          .updateTable(
            schema.menuModifierGroups,
            {
              name: input.name,
              display: input.display,
              behaviour: input.behaviour,
              isRequired: input.isRequired,
              updatedAt: new Date(),
            },
            eq(schema.menuModifierGroups.id, input.id),
          )
          .returning({ id: schema.menuModifierGroups.id });
        if (!row) throw new MenuModifierGroupNotFoundError(input.id);
        return { id: row.id };
      }
      const [row] = await scoped
        .insertInto(schema.menuModifierGroups, {
          name: input.name,
          display: input.display,
          behaviour: input.behaviour,
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
              name: input.name,
              description: input.description,
              imageS3Key: input.imageS3Key,
              priceDelta: input.priceDelta,
              defaultAmount: input.defaultAmount,
              freeAmount: input.freeAmount,
              sortOrder: input.sortOrder,
              minAmount: input.minAmount,
              maxAmount: input.maxAmount,
              source: input.source,
              sourceExternalId: input.sourceExternalId,
              updatedAt: new Date(),
            },
            eq(schema.menuModifierOptions.id, input.id),
          )
          .returning({ id: schema.menuModifierOptions.id });
        if (!row) throw new MenuModifierOptionNotFoundError(input.id);
        return { id: row.id };
      }
      const [row] = await scoped
        .insertInto(schema.menuModifierOptions, {
          name: input.name,
          description: input.description,
          imageS3Key: input.imageS3Key,
          priceDelta: input.priceDelta,
          defaultAmount: input.defaultAmount,
          freeAmount: input.freeAmount,
          sortOrder: input.sortOrder,
          minAmount: input.minAmount,
          maxAmount: input.maxAmount,
          source: input.source,
          sourceExternalId: input.sourceExternalId,
        })
        .returning({ id: schema.menuModifierOptions.id });
      if (!row) throw new Error('upsertModifierOption: insert returned no row');
      return { id: row.id };
    });
  }

  async upsertItemSize(input: UpsertItemSizeRow): Promise<{ id: string }> {
    return this.db.withTenant(async (_tx, scoped) => {
      const parentItem = await scoped
        .selectFrom(schema.menuItems, eq(schema.menuItems.id, input.menuItemId))
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
            eq(schema.menuItemSizes.id, input.id),
          )
          .returning({ id: schema.menuItemSizes.id });
        if (!row) throw new MenuItemSizeNotFoundError(input.id);
        return { id: row.id };
      }
      const [row] = await scoped
        .insertInto(schema.menuItemSizes, {
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

  async replaceItemModifierGroups(input: {
    itemId: string;
    modifierGroupIds: readonly string[];
  }): Promise<{ id: string }> {
    return this.db.withTenant(async (tx, scoped) => {
      const itemRows = await scoped
        .selectFrom(schema.menuItems, eq(schema.menuItems.id, input.itemId))
        .limit(1);
      if (!itemRows[0]) {
        throw new MenuItemNotFoundError(input.itemId);
      }

      const dedupedIds = [...new Set(input.modifierGroupIds)];

      if (dedupedIds.length > 0) {
        const foundGroups = await scoped.selectFrom(
          schema.menuModifierGroups,
          inArray(schema.menuModifierGroups.id, dedupedIds),
        );
        const foundSet = new Set(foundGroups.map((g) => g.id));
        const firstMissing = dedupedIds.find((id) => !foundSet.has(id));
        if (firstMissing !== undefined) {
          throw new MenuModifierGroupNotFoundError(firstMissing);
        }
      }

      // Migration 0053 grants this DELETE. PK (menu_item_id, modifier_group_id) bounds rows per item
      // so this is the canonical replace-links inverse of INSERT — not a soft-delete escape (ADR-0020 I-1).
      const ctx = requireTenantContext();
      await tx
        .delete(schema.menuItemModifierGroups)
        .where(
          and(
            eq(schema.menuItemModifierGroups.tenantId, ctx.tenantId),
            eq(schema.menuItemModifierGroups.menuItemId, input.itemId),
          ),
        );

      for (const [i, modifierGroupId] of dedupedIds.entries()) {
        await scoped.insertInto(schema.menuItemModifierGroups, {
          menuItemId: input.itemId,
          modifierGroupId,
          sortOrder: i,
        });
      }

      return { id: input.itemId };
    });
  }

  async replaceGroupModifierOptions(input: {
    modifierGroupId: string;
    optionIds: readonly string[];
  }): Promise<{ id: string }> {
    return this.db.withTenant(async (tx, scoped) => {
      const groupRows = await scoped
        .selectFrom(
          schema.menuModifierGroups,
          eq(schema.menuModifierGroups.id, input.modifierGroupId),
        )
        .limit(1);
      if (!groupRows[0]) {
        throw new MenuModifierGroupNotFoundError(input.modifierGroupId);
      }

      const dedupedIds = [...new Set(input.optionIds)];
      if (dedupedIds.length > 0) {
        const foundOptions = await scoped.selectFrom(
          schema.menuModifierOptions,
          and(
            inArray(schema.menuModifierOptions.id, dedupedIds),
            isNull(schema.menuModifierOptions.archivedAt),
          ),
        );
        const foundSet = new Set(foundOptions.map((o) => o.id));
        const firstMissing = dedupedIds.find((id) => !foundSet.has(id));
        if (firstMissing !== undefined) {
          throw new MenuModifierOptionNotFoundError(firstMissing);
        }
      }

      const ctx = requireTenantContext();
      await tx
        .delete(schema.menuModifierGroupOptions)
        .where(
          and(
            eq(schema.menuModifierGroupOptions.tenantId, ctx.tenantId),
            eq(schema.menuModifierGroupOptions.modifierGroupId, input.modifierGroupId),
          ),
        );

      for (const [i, optionId] of dedupedIds.entries()) {
        await scoped.insertInto(schema.menuModifierGroupOptions, {
          modifierGroupId: input.modifierGroupId,
          optionId,
          sortOrder: i,
        });
      }

      return { id: input.modifierGroupId };
    });
  }

  async replaceItemModifierOptions(input: {
    itemId: string;
    optionIds: readonly string[];
  }): Promise<{ id: string }> {
    return this.db.withTenant(async (tx, scoped) => {
      const itemRows = await scoped
        .selectFrom(schema.menuItems, eq(schema.menuItems.id, input.itemId))
        .limit(1);
      if (!itemRows[0]) {
        throw new MenuItemNotFoundError(input.itemId);
      }

      const dedupedIds = [...new Set(input.optionIds)];
      if (dedupedIds.length > 0) {
        const foundOptions = await scoped.selectFrom(
          schema.menuModifierOptions,
          and(
            inArray(schema.menuModifierOptions.id, dedupedIds),
            isNull(schema.menuModifierOptions.archivedAt),
          ),
        );
        const foundSet = new Set(foundOptions.map((o) => o.id));
        const firstMissing = dedupedIds.find((id) => !foundSet.has(id));
        if (firstMissing !== undefined) {
          throw new MenuModifierOptionNotFoundError(firstMissing);
        }
      }

      // D-04: refuse a duplicate single-ingredient attachment before writing, naming the
      // group the ingredient already reaches the dish through.
      if (dedupedIds.length > 0) {
        const assignedGroupLinks = await scoped.selectFrom(
          schema.menuItemModifierGroups,
          eq(schema.menuItemModifierGroups.menuItemId, input.itemId),
        );
        if (assignedGroupLinks.length > 0) {
          const assignedGroupIds = assignedGroupLinks.map((l) => l.modifierGroupId);
          const [groupOptionLinks, groupRows] = await Promise.all([
            scoped.selectFrom(
              schema.menuModifierGroupOptions,
              inArray(schema.menuModifierGroupOptions.modifierGroupId, assignedGroupIds),
            ),
            scoped.selectFrom(
              schema.menuModifierGroups,
              inArray(schema.menuModifierGroups.id, assignedGroupIds),
            ),
          ]);
          const groupIdByOptionId = new Map(
            groupOptionLinks.map((l) => [l.optionId, l.modifierGroupId]),
          );
          const groupNameById = new Map(groupRows.map((g) => [g.id, g.name]));
          for (const optionId of dedupedIds) {
            const groupId = groupIdByOptionId.get(optionId);
            if (groupId === undefined) continue;
            const groupName = groupNameById.get(groupId);
            throw new MenuIngredientAlreadyAttachedError(
              optionId,
              groupName ? pickLocaleName(groupName) : groupId,
            );
          }
        }
      }

      const ctx = requireTenantContext();
      await tx
        .delete(schema.menuItemModifierOptions)
        .where(
          and(
            eq(schema.menuItemModifierOptions.tenantId, ctx.tenantId),
            eq(schema.menuItemModifierOptions.menuItemId, input.itemId),
          ),
        );

      for (const [i, optionId] of dedupedIds.entries()) {
        await scoped.insertInto(schema.menuItemModifierOptions, {
          menuItemId: input.itemId,
          optionId,
          sortOrder: i,
        });
      }

      return { id: input.itemId };
    });
  }

  async setItemComposition(input: {
    itemId: string;
    mode: 'text' | 'assembled';
    text: readonly string[];
    lines: readonly { optionId: string; removable: boolean }[];
  }): Promise<{ id: string }> {
    return this.db.withTenant(async (_tx, scoped) => {
      const itemRows = await scoped
        .selectFrom(schema.menuItems, eq(schema.menuItems.id, input.itemId))
        .limit(1);
      if (!itemRows[0]) {
        throw new MenuItemNotFoundError(input.itemId);
      }

      if (input.lines.length > 0) {
        const optionIds = [...new Set(input.lines.map((l) => l.optionId))];
        const foundOptions = await scoped.selectFrom(
          schema.menuModifierOptions,
          and(
            inArray(schema.menuModifierOptions.id, optionIds),
            isNull(schema.menuModifierOptions.archivedAt),
          ),
        );
        const foundSet = new Set(foundOptions.map((o) => o.id));
        const firstMissing = optionIds.find((id) => !foundSet.has(id));
        if (firstMissing !== undefined) {
          throw new MenuModifierOptionNotFoundError(firstMissing);
        }
      }

      // D-15/D-16: both payloads are always written together, so a mode switch
      // can never leave the other one stale. Array position is the line order.
      await scoped.updateTable(
        schema.menuItems,
        {
          compositionMode: input.mode,
          composition: [...input.text],
          compositionAssembled: [...input.lines],
          updatedAt: new Date(),
        },
        eq(schema.menuItems.id, input.itemId),
      );

      return { id: input.itemId };
    });
  }

  async addToStopList(input: StopListInsertRow): Promise<{ id: string; itemSlug: string }> {
    return this.db.withTenant(async (_tx, scoped) => {
      // slug is captured before insert so it can ride in the outbox event payload for slug-keyed consumers.
      // Item lookup relies on ScopedTx's tenant-grain filter (auto-applied by
      // selectFrom); the stop-list row itself is keyed on locationId below.
      const existingItem = await scoped
        .selectFrom(schema.menuItems, eq(schema.menuItems.id, input.itemId))
        .limit(1);
      const itemRow = existingItem[0];
      if (!itemRow) {
        throw new MenuItemNotFoundError(input.itemId);
      }
      const itemSlug = itemRow.slug;

      const inserted = await scoped
        .insertInto(schema.menuStopList, {
          locationId: input.locationId,
          itemId: input.itemId,
          reason: input.reason,
          stoppedByUserId: input.stoppedByUserId,
        })
        .onConflictDoNothing({
          target: [
            schema.menuStopList.tenantId,
            schema.menuStopList.locationId,
            schema.menuStopList.itemId,
          ],
        })
        .returning({ id: schema.menuStopList.id });
      await this.#bumpStopVersion(scoped, input.locationId);
      if (inserted[0]) {
        return { id: inserted[0].id, itemSlug };
      }
      const existing = await scoped
        .selectFrom(
          schema.menuStopList,
          and(
            eq(schema.menuStopList.itemId, input.itemId),
            eq(schema.menuStopList.locationId, input.locationId),
          ),
        )
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
    locationId: string;
  }): Promise<{ removed: boolean; itemSlug: string | null }> {
    return this.db.withTenant(async (tx, scoped) => {
      const itemRow = (
        await scoped.selectFrom(schema.menuItems, eq(schema.menuItems.id, input.itemId)).limit(1)
      )[0];
      const itemSlug = itemRow?.slug ?? null;

      // Sole sanctioned hard DELETE on a tenant-scoped table — migration 0040 grants the privilege.
      // Three-column predicate satisfies RLS + ScopedTx auto-filter contract (ADR-0020 I-1).
      const ctx = requireTenantContext();
      const result = await tx
        .delete(schema.menuStopList)
        .where(
          and(
            eq(schema.menuStopList.tenantId, ctx.tenantId),
            eq(schema.menuStopList.locationId, input.locationId),
            eq(schema.menuStopList.itemId, input.itemId),
          ),
        )
        .returning({ id: schema.menuStopList.id });

      await this.#bumpStopVersion(scoped, input.locationId);

      return { removed: result.length > 0, itemSlug };
    });
  }

  async addOptionToStopList(input: OptionStopListInsertRow): Promise<{ id: string }> {
    return this.db.withTenant(async (_tx, scoped) => {
      const inserted = await scoped
        .insertInto(schema.menuOptionStopList, {
          locationId: input.locationId,
          optionId: input.optionId,
          reason: input.reason,
          stoppedByUserId: input.stoppedByUserId,
        })
        .onConflictDoNothing({
          target: [
            schema.menuOptionStopList.tenantId,
            schema.menuOptionStopList.locationId,
            schema.menuOptionStopList.optionId,
          ],
        })
        .returning({ id: schema.menuOptionStopList.id });
      await this.#bumpStopVersion(scoped, input.locationId);
      if (inserted[0]) {
        return { id: inserted[0].id };
      }
      const existing = await scoped
        .selectFrom(
          schema.menuOptionStopList,
          and(
            eq(schema.menuOptionStopList.optionId, input.optionId),
            eq(schema.menuOptionStopList.locationId, input.locationId),
          ),
        )
        .limit(1);
      const existingRow = existing[0];
      if (!existingRow) {
        throw new Error('addOptionToStopList: conflict path could not locate existing row');
      }
      return { id: existingRow.id };
    });
  }

  async removeOptionFromStopList(input: {
    optionId: string;
    locationId: string;
  }): Promise<{ removed: boolean }> {
    return this.db.withTenant(async (tx, scoped) => {
      // Same sanctioned hard DELETE family as removeFromStopList — migration 0019 grants the privilege.
      const ctx = requireTenantContext();
      const result = await tx
        .delete(schema.menuOptionStopList)
        .where(
          and(
            eq(schema.menuOptionStopList.tenantId, ctx.tenantId),
            eq(schema.menuOptionStopList.locationId, input.locationId),
            eq(schema.menuOptionStopList.optionId, input.optionId),
          ),
        )
        .returning({ id: schema.menuOptionStopList.id });

      await this.#bumpStopVersion(scoped, input.locationId);

      return { removed: result.length > 0 };
    });
  }

  async #bumpStopVersion(
    scoped: Parameters<Parameters<TenantAwareDb['withTenant']>[0]>[1],
    locationId: string,
  ): Promise<void> {
    await scoped
      .insertInto(schema.catalogLocationStopVersion, { locationId, stopVersion: 2 })
      .onConflictDoUpdate({
        target: [
          schema.catalogLocationStopVersion.locationId,
          schema.catalogLocationStopVersion.tenantId,
        ],
        set: { stopVersion: sql`${schema.catalogLocationStopVersion.stopVersion} + 1` },
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
    moves: readonly { id: string; parentId: string | null; sortOrder: number }[];
  }): Promise<{ updated: number }> {
    return this.db.withTenant(async (_tx, scoped) => {
      const all = await scoped.selectFrom(schema.menuCategories);
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
            eq(schema.menuCategories.id, move.id),
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
        rows: await Promise.all(
          sliced.map<Promise<ItemListRow>>(async (r) => {
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
                ? {
                    s3Key: primaryPhoto.s3Key,
                    sortOrder: primaryPhoto.sortOrder,
                    url: await this.imageUrl.presignGet(
                      primaryPhoto.s3Key,
                      CatalogDrizzleRepository.PHOTO_URL_TTL_SECONDS,
                    ),
                  }
                : null,
              basePrice: r.basePrice,
              currency: r.currency,
              status: r.status as 'draft' | 'published' | 'archived',
              hasSizes: sizeByItem.has(r.id),
              stoppedAt: stoppedAt ? stoppedAt.toISOString() : null,
              sortOrder: r.sortOrder,
            };
          }),
        ),
        total,
      };
    });
  }

  async getItemById(id: string): Promise<ItemDetailRow | null> {
    return this.db.withTenant(async (_tx, scoped) => {
      const rows = await scoped.selectFrom(schema.menuItems, eq(schema.menuItems.id, id)).limit(1);
      const r = rows[0];
      if (!r) return null;
      const [sizes, links, optionLinks] = await Promise.all([
        scoped
          .selectFrom(schema.menuItemSizes, eq(schema.menuItemSizes.menuItemId, id))
          .orderBy(asc(schema.menuItemSizes.sortOrder)),
        scoped.selectFrom(
          schema.menuItemModifierGroups,
          eq(schema.menuItemModifierGroups.menuItemId, id),
        ),
        scoped
          .selectFrom(
            schema.menuItemModifierOptions,
            eq(schema.menuItemModifierOptions.menuItemId, id),
          )
          .orderBy(asc(schema.menuItemModifierOptions.sortOrder)),
      ]);
      return {
        id: r.id,
        categoryId: r.categoryId,
        slug: r.slug,
        name: r.name,
        description: r.description ?? null,
        basePrice: r.basePrice,
        currency: r.currency,
        photos: await Promise.all(
          r.photos.map(async (ph) => ({
            ...ph,
            url: await this.imageUrl.presignGet(
              ph.s3Key,
              CatalogDrizzleRepository.PHOTO_URL_TTL_SECONDS,
            ),
          })),
        ),
        allergens: r.allergens ?? null,
        diets: r.diets ?? null,
        composition: r.composition ?? null,
        compositionMode: r.compositionMode as 'text' | 'assembled',
        compositionAssembled: r.compositionAssembled,
        metaTitle: r.metaTitle ?? null,
        metaDescription: r.metaDescription ?? null,
        proteins: r.proteins === null ? null : Number(r.proteins),
        fats: r.fats === null ? null : Number(r.fats),
        carbs: r.carbs === null ? null : Number(r.carbs),
        kcal: r.kcal,
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
        modifierOptionIds: optionLinks.map((m) => m.optionId),
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
      const [groupOptions, links] = await Promise.all([
        scoped.selectFrom(
          schema.menuModifierGroupOptions,
          inArray(schema.menuModifierGroupOptions.modifierGroupId, groupIds),
        ),
        scoped.selectFrom(
          schema.menuItemModifierGroups,
          inArray(schema.menuItemModifierGroups.modifierGroupId, groupIds),
        ),
      ]);
      const optionCount = new Map<string, number>();
      for (const o of groupOptions)
        optionCount.set(o.modifierGroupId, (optionCount.get(o.modifierGroupId) ?? 0) + 1);
      const usageCount = new Map<string, number>();
      for (const l of links)
        usageCount.set(l.modifierGroupId, (usageCount.get(l.modifierGroupId) ?? 0) + 1);
      return groups.map<ModifierGroupListRow>((g) => ({
        id: g.id,
        name: g.name,
        display: g.display as 'tiles' | 'tabs',
        behaviour: g.behaviour as 'one' | 'several',
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
      const links = await scoped
        .selectFrom(
          schema.menuModifierGroupOptions,
          eq(schema.menuModifierGroupOptions.modifierGroupId, id),
        )
        .orderBy(asc(schema.menuModifierGroupOptions.sortOrder));
      const optionRows =
        links.length === 0
          ? []
          : await scoped.selectFrom(
              schema.menuModifierOptions,
              inArray(
                schema.menuModifierOptions.id,
                links.map((l) => l.optionId),
              ),
            );
      const optionById = new Map(optionRows.map((o) => [o.id, o]));
      const options = (
        await Promise.all(
          links.map(async (l) => {
            const o = optionById.get(l.optionId);
            if (!o) return null;
            return {
              id: o.id,
              name: o.name,
              description: o.description ?? null,
              imageUrl: o.imageS3Key
                ? await this.imageUrl.presignGet(
                    o.imageS3Key,
                    CatalogDrizzleRepository.PHOTO_URL_TTL_SECONDS,
                  )
                : null,
              priceDelta: o.priceDelta,
              defaultAmount: o.defaultAmount,
              freeAmount: o.freeAmount,
              sortOrder: l.sortOrder,
            };
          }),
        )
      ).filter((o): o is NonNullable<typeof o> => o !== null);
      return {
        id: g.id,
        name: g.name,
        display: g.display as 'tiles' | 'tabs',
        behaviour: g.behaviour as 'one' | 'several',
        isRequired: g.isRequired,
        options,
      };
    });
  }

  // D-27: no search, no paging — a restaurant has tens of ingredients.
  async listModifierOptions(): Promise<ModifierOptionListRow[]> {
    return this.db.withTenant(async (_tx, scoped) => {
      const options = await scoped.selectFrom(
        schema.menuModifierOptions,
        isNull(schema.menuModifierOptions.archivedAt),
      );
      if (options.length === 0) return [];

      const [groupOptionsRows, itemOptionsRows, itemsRows] = await Promise.all([
        scoped.selectFrom(schema.menuModifierGroupOptions),
        scoped.selectFrom(schema.menuItemModifierOptions),
        scoped.selectFrom(schema.menuItems),
      ]);

      const groupCountByOption = new Map<string, number>();
      for (const row of groupOptionsRows) {
        groupCountByOption.set(row.optionId, (groupCountByOption.get(row.optionId) ?? 0) + 1);
      }

      // D-22: dishCount is the union of direct attachment and composition
      // membership — being reachable through a group is not being "in" the dish.
      const dishIdsByOption = new Map<string, Set<string>>();
      const addDish = (optionId: string, dishId: string): void => {
        const set = dishIdsByOption.get(optionId);
        if (set) set.add(dishId);
        else dishIdsByOption.set(optionId, new Set([dishId]));
      };
      for (const row of itemOptionsRows) addDish(row.optionId, row.menuItemId);
      for (const item of itemsRows) {
        for (const line of item.compositionAssembled) addDish(line.optionId, item.id);
      }

      const rows = await Promise.all(
        options.map(async (o) => ({
          id: o.id,
          name: o.name,
          description: o.description ?? null,
          priceDelta: o.priceDelta,
          imageUrl: o.imageS3Key
            ? await this.imageUrl.presignGet(
                o.imageS3Key,
                CatalogDrizzleRepository.PHOTO_URL_TTL_SECONDS,
              )
            : null,
          imageS3Key: o.imageS3Key,
          groupCount: groupCountByOption.get(o.id) ?? 0,
          dishCount: dishIdsByOption.get(o.id)?.size ?? 0,
        })),
      );

      return rows.sort((a, b) => pickLocaleName(a.name).localeCompare(pickLocaleName(b.name)));
    });
  }

  async getModifierOptionUsage(optionId: string): Promise<ModifierOptionUsageRow> {
    return this.db.withTenant(async (_tx, scoped) => {
      const groupLinks = await scoped.selectFrom(
        schema.menuModifierGroupOptions,
        eq(schema.menuModifierGroupOptions.optionId, optionId),
      );
      const groupIds = [...new Set(groupLinks.map((l) => l.modifierGroupId))];
      const groupRows =
        groupIds.length === 0
          ? []
          : await scoped.selectFrom(
              schema.menuModifierGroups,
              inArray(schema.menuModifierGroups.id, groupIds),
            );

      const itemLinks = await scoped.selectFrom(
        schema.menuItemModifierOptions,
        eq(schema.menuItemModifierOptions.optionId, optionId),
      );
      const attachedItemIds = [...new Set(itemLinks.map((l) => l.menuItemId))];
      const attachedItemRows =
        attachedItemIds.length === 0
          ? []
          : await scoped.selectFrom(
              schema.menuItems,
              inArray(schema.menuItems.id, attachedItemIds),
            );

      // D-22: composition membership, expressed as jsonb containment against a
      // one-element array — the same `sql` fragment shape listItems uses for ILIKE.
      const compositionItemRows = await scoped.selectFrom(
        schema.menuItems,
        sql`${schema.menuItems.compositionAssembled} @> ${JSON.stringify([{ optionId }])}::jsonb`,
      );

      return {
        groups: groupRows.map((g) => ({ id: g.id, name: g.name })),
        dishesAttached: attachedItemRows.map((i) => ({ id: i.id, name: i.name })),
        dishesInComposition: compositionItemRows.map((i) => ({ id: i.id, name: i.name })),
      };
    });
  }

  async listStopListWithStoppedAt(locationId: string): Promise<StopListEntryRow[]> {
    return this.db.withTenant(async (_tx, scoped) => {
      const stopRows = await scoped
        .selectFrom(schema.menuStopList, eq(schema.menuStopList.locationId, locationId))
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
      return Promise.all(
        stopRows.map<Promise<StopListEntryRow>>(async (s) => {
          const item = itemById.get(s.itemId);
          const primaryPhoto = item
            ? (item.photos.find((ph) => ph.isPrimary) ?? item.photos[0] ?? null)
            : null;
          return {
            id: s.id,
            itemId: s.itemId,
            itemName: item?.name ?? null,
            categoryName: item ? (catById.get(item.categoryId) ?? null) : null,
            photo: primaryPhoto
              ? {
                  s3Key: primaryPhoto.s3Key,
                  sortOrder: primaryPhoto.sortOrder,
                  url: await this.imageUrl.presignGet(
                    primaryPhoto.s3Key,
                    CatalogDrizzleRepository.PHOTO_URL_TTL_SECONDS,
                  ),
                }
              : null,
            stoppedAt: s.stoppedAt.toISOString(),
            reason: s.reason ?? null,
          };
        }),
      );
    });
  }

  async listStoppedItemIds(locationId: string): Promise<string[]> {
    return this.db.withTenant(async (_tx, scoped) => {
      const rows = await scoped.selectFrom(
        schema.menuStopList,
        eq(schema.menuStopList.locationId, locationId),
      );
      return rows.map((r) => r.itemId);
    });
  }

  // D-23: computed per read, never materialised at publish.
  async listStoppedIngredientIds(locationId: string): Promise<string[]> {
    return this.db.withTenant(async (_tx, scoped) => {
      const rows = await scoped.selectFrom(
        schema.menuOptionStopList,
        eq(schema.menuOptionStopList.locationId, locationId),
      );
      return rows.map((r) => r.optionId);
    });
  }

  async listOptionStopListWithStoppedAt(locationId: string): Promise<OptionStopListEntryRow[]> {
    return this.db.withTenant(async (_tx, scoped) => {
      const stopRows = await scoped
        .selectFrom(schema.menuOptionStopList, eq(schema.menuOptionStopList.locationId, locationId))
        .orderBy(desc(schema.menuOptionStopList.stoppedAt));
      if (stopRows.length === 0) return [];
      const optionIds = stopRows.map((s) => s.optionId);
      const options = await scoped.selectFrom(
        schema.menuModifierOptions,
        inArray(schema.menuModifierOptions.id, optionIds),
      );
      const optionById = new Map(options.map((o) => [o.id, o]));
      return Promise.all(
        stopRows.map<Promise<OptionStopListEntryRow>>(async (s) => {
          const option = optionById.get(s.optionId);
          return {
            id: s.id,
            optionId: s.optionId,
            optionName: option?.name ?? null,
            imageUrl: option?.imageS3Key
              ? await this.imageUrl.presignGet(
                  option.imageS3Key,
                  CatalogDrizzleRepository.PHOTO_URL_TTL_SECONDS,
                )
              : null,
            stoppedAt: s.stoppedAt.toISOString(),
            reason: s.reason ?? null,
          };
        }),
      );
    });
  }

  async listStopListAggregateAcrossLocations(
    tenantId: TenantId,
    activeLocationIds: readonly string[],
  ): Promise<{ rows: AggregateStopListRow[]; totalStoppedItems: number }> {
    if (activeLocationIds.length === 0) return { rows: [], totalStoppedItems: 0 };
    return this.db.withTenant(async (tx) => {
      // ScopedTx.selectFrom() cannot express GROUP BY — raw tx + explicit
      // eq(tenantId) is the sanctioned escape hatch (ADR-0020 I-1), same
      // family as removeFromStopList's raw DELETE above.
      const totalRows = await tx
        .select({
          totalStoppedItems: sql<string>`count(distinct ${schema.menuStopList.itemId})`,
        })
        .from(schema.menuStopList)
        .where(
          and(
            eq(schema.menuStopList.tenantId, tenantId),
            inArray(schema.menuStopList.locationId, activeLocationIds),
          ),
        );
      const totalStoppedItems = Number(totalRows[0]?.totalStoppedItems ?? '0');

      const grouped = await tx
        .select({
          itemId: schema.menuStopList.itemId,
          // postgres.js returns bigint (count()) as a string at runtime; sql<string>
          // keeps the TS type honest so the Number() conversion below is not flagged
          // as a no-op by @typescript-eslint/no-unnecessary-type-conversion.
          stoppedLocationCount: sql<string>`count(distinct ${schema.menuStopList.locationId})`,
          lastStoppedAt: sql<Date>`max(${schema.menuStopList.stoppedAt})`,
        })
        .from(schema.menuStopList)
        .where(
          and(
            eq(schema.menuStopList.tenantId, tenantId),
            inArray(schema.menuStopList.locationId, activeLocationIds),
          ),
        )
        .groupBy(schema.menuStopList.itemId)
        .orderBy(desc(sql`max(${schema.menuStopList.stoppedAt})`))
        .limit(AGGREGATE_STOP_LIST_PAGE_SIZE)
        .offset(0);
      if (grouped.length === 0) return { rows: [], totalStoppedItems };

      const itemIds = grouped.map((g) => g.itemId);
      const items = await tx
        .select({
          id: schema.menuItems.id,
          name: schema.menuItems.name,
          categoryId: schema.menuItems.categoryId,
        })
        .from(schema.menuItems)
        .where(and(eq(schema.menuItems.tenantId, tenantId), inArray(schema.menuItems.id, itemIds)));
      const itemById = new Map(items.map((i) => [i.id, i]));
      const categoryIds = Array.from(new Set(items.map((i) => i.categoryId)));
      const categories =
        categoryIds.length > 0
          ? await tx
              .select({ id: schema.menuCategories.id, name: schema.menuCategories.name })
              .from(schema.menuCategories)
              .where(
                and(
                  eq(schema.menuCategories.tenantId, tenantId),
                  inArray(schema.menuCategories.id, categoryIds),
                ),
              )
          : [];
      const catById = new Map(categories.map((c) => [c.id, c.name]));

      const rows = grouped.map<AggregateStopListRow>((g) => {
        const item = itemById.get(g.itemId);
        return {
          itemId: g.itemId,
          itemName: item?.name ?? null,
          categoryName: item ? (catById.get(item.categoryId) ?? null) : null,
          stoppedLocationCount: Number(g.stoppedLocationCount),
          lastStoppedAt: new Date(g.lastStoppedAt).toISOString(),
        };
      });
      return { rows, totalStoppedItems };
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

  async archiveCategory(id: string): Promise<{ found: boolean }> {
    return this.db.withTenant(async (_tx, scoped) => {
      const rows = await scoped
        .updateTable(
          schema.menuCategories,
          { status: 'archived', updatedAt: new Date() },
          eq(schema.menuCategories.id, id),
        )
        .returning({ id: schema.menuCategories.id });
      return { found: rows.length > 0 };
    });
  }

  async archiveItem(id: string): Promise<{ found: boolean }> {
    return this.db.withTenant(async (_tx, scoped) => {
      const rows = await scoped
        .updateTable(
          schema.menuItems,
          { status: 'archived', updatedAt: new Date() },
          eq(schema.menuItems.id, id),
        )
        .returning({ id: schema.menuItems.id });
      return { found: rows.length > 0 };
    });
  }

  // D-28: archive strips the ingredient from every group, every dish attachment
  // and every composition line, in the same tenant-bound transaction.
  async archiveModifierOption(id: string): Promise<{ found: boolean }> {
    return this.db.withTenant(async (tx, scoped) => {
      const rows = await scoped
        .updateTable(
          schema.menuModifierOptions,
          { archivedAt: new Date(), updatedAt: new Date() },
          eq(schema.menuModifierOptions.id, id),
        )
        .returning({ id: schema.menuModifierOptions.id });
      if (rows.length === 0) return { found: false };

      const ctx = requireTenantContext();
      await tx
        .delete(schema.menuModifierGroupOptions)
        .where(
          and(
            eq(schema.menuModifierGroupOptions.tenantId, ctx.tenantId),
            eq(schema.menuModifierGroupOptions.optionId, id),
          ),
        );
      await tx
        .delete(schema.menuItemModifierOptions)
        .where(
          and(
            eq(schema.menuItemModifierOptions.tenantId, ctx.tenantId),
            eq(schema.menuItemModifierOptions.optionId, id),
          ),
        );

      const composedItems = await scoped.selectFrom(
        schema.menuItems,
        sql`${schema.menuItems.compositionAssembled} @> ${JSON.stringify([{ optionId: id }])}::jsonb`,
      );
      for (const item of composedItems) {
        await scoped.updateTable(
          schema.menuItems,
          {
            compositionAssembled: item.compositionAssembled.filter((line) => line.optionId !== id),
            updatedAt: new Date(),
          },
          eq(schema.menuItems.id, item.id),
        );
      }

      return { found: true };
    });
  }
}

const isCodeUniqueViolation = (err: unknown, constraintName: string): boolean => {
  const seen = new Set<unknown>();
  let cur: unknown = err;
  while (typeof cur === 'object' && cur !== null && !seen.has(cur)) {
    seen.add(cur);
    const e = cur as {
      code?: string;
      constraint_name?: string;
      constraint?: string;
      cause?: unknown;
    };
    if (e.code === '23505') {
      const constraint = e.constraint_name ?? e.constraint;
      if (constraint === constraintName) return true;
    }
    cur = e.cause;
  }
  return false;
};

// Mirrors application/slug-util.ts's pickDefaultLocaleValue — kept local here so
// infrastructure does not reach into the application layer for a one-line pick.
const pickLocaleName = (name: Record<string, string>): string => {
  if (typeof name.ru === 'string' && name.ru.length > 0) return name.ru;
  if (typeof name.en === 'string' && name.en.length > 0) return name.en;
  for (const value of Object.values(name)) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
};

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
