# Phase 4a: Catalog Schema + API — Pattern Map

**Mapped:** 2026-05-30
**Files analyzed:** 22 new/modified files
**Analogs found:** 22 / 22

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/db/src/schema/menu.ts` | schema | CRUD | `packages/db/src/schema/menu.ts` (self — extend) | exact |
| `packages/db/migrations/0029_catalog_phase4a_A.sql` through `0040_catalog_phase4a_L.sql` | migration | batch | `packages/db/migrations/0025_composite_tenant_fk_phase_3b.sql` | exact |
| `packages/events/src/contracts/catalog.ts` | event-contract | event-driven | `packages/events/src/contracts/identity.ts` | exact |
| `apps/api/src/contexts/catalog/application/dto.ts` | Zod DTO schema | request-response | self (extend) | exact |
| `apps/api/src/contexts/catalog/domain/ports.ts` | domain port | CRUD | self (extend) | exact |
| `apps/api/src/contexts/catalog/domain/published-menu.ts` | domain read-model | request-response | self (extend) | exact |
| `apps/api/src/contexts/catalog/domain/errors.ts` | domain error | request-response | self (extend) | exact |
| `apps/api/src/contexts/catalog/application/delayed-publish.service.ts` | service | event-driven | `apps/api/src/contexts/catalog/application/publish-menu.service.ts` | role-match |
| `apps/api/src/contexts/catalog/application/publish-menu.service.ts` | service | event-driven | self (refactor) | exact |
| `apps/api/src/contexts/catalog/application/upsert-category.service.ts` | service | CRUD | self (extend) | exact |
| `apps/api/src/contexts/catalog/application/upsert-item.service.ts` | service | CRUD | self (extend) | exact |
| `apps/api/src/contexts/catalog/application/upsert-modifier-group.service.ts` | service | CRUD | `apps/api/src/contexts/catalog/application/upsert-modifier.service.ts` | exact |
| `apps/api/src/contexts/catalog/application/upsert-modifier-option.service.ts` | service | CRUD | `apps/api/src/contexts/catalog/application/upsert-modifier.service.ts` | exact |
| `apps/api/src/contexts/catalog/application/upsert-item-size.service.ts` | service | CRUD | `apps/api/src/contexts/catalog/application/upsert-modifier.service.ts` | exact |
| `apps/api/src/contexts/catalog/application/stop-list.service.ts` | service | CRUD | `apps/api/src/contexts/catalog/application/upsert-modifier.service.ts` | role-match |
| `apps/api/src/contexts/catalog/application/get-published-menu.service.ts` | service | request-response | self (extend) | exact |
| `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` | Drizzle repository | CRUD | self (refactor) | exact |
| `apps/api/src/contexts/catalog/infrastructure/redis-catalog-cache.adapter.ts` | infrastructure adapter | request-response | self (extend) | exact |
| `apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts` | controller | request-response | self (extend) | exact |
| `apps/api/src/contexts/catalog/interfaces/http/error-mapping.ts` | error mapping | request-response | self (extend) | exact |
| `apps/api/src/contexts/catalog/catalog.module.ts` | NestJS module | CRUD | self (extend) | exact |
| `apps/api/src/contexts/audit/application/record-audit.service.ts` | service | event-driven | self (extend) | exact |

---

## Pattern Assignments

### `packages/db/src/schema/menu.ts` (schema, CRUD — major extension)

**Analog:** `packages/db/src/schema/menu.ts` (self — extends, does not replace)

**Drizzle helper imports pattern** (lines 1–23):
```typescript
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { money, type LocalizedText } from './_types';
import {
  compositeTenantFk,
  pkUuid,
  tenantIdColumn,
  tenantParentUniqueIndex,
  timestampsColumns,
} from './_columns';
import { tenants } from './tenants';
```
Add `numeric`, `smallint`, `timestamp` to the existing import (those are new for BJU + stop-list tables).

**Composite FK pattern** — copy exactly from `menuVariants` table (lines 126–141 of current menu.ts):
```typescript
compositeTenantFk({
  name: 'menu_item_sizes_item_fk',
  child: { id: table.menuItemId, tenantId: table.tenantId },
  parent: { id: menuItems.id, tenantId: menuItems.tenantId },
}).onDelete('cascade'),
tenantParentUniqueIndex('menu_item_sizes', { id: table.id, tenantId: table.tenantId }),
```

**CHECK constraint pattern** — copy from `menuItems` table (lines 98–101):
```typescript
check('menu_items_source_chk', sql`${table.source} IN ('manual','ai_generated','imported_iiko','imported_csv')`),
check('menu_items_slug_format_chk', sql`${table.slug} ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$'`),
```

**JSONB column with typed default** — new pattern needed for `photos`:
```typescript
photos: jsonb('photos')
  .$type<MenuItemPhoto[]>()
  .notNull()
  .default(sql`'[]'::jsonb`),
```
Use `sql` template for the default — raw string `'[]'` is not accepted by Drizzle for JSONB.

**New interface exported alongside schema** (place near `menuItems` table):
```typescript
export interface MenuItemPhoto {
  s3Key: string;
  sortOrder: number;
  alt?: string;
  width?: number;
  height?: number;
  isPrimary?: boolean;
}
```

---

### Migration files: `0029_*.sql` through `0040_*.sql` (migration, batch)

**Analog:** `packages/db/migrations/0025_composite_tenant_fk_phase_3b.sql` and `packages/db/migrations/0013_brands_rls.sql`

**Header comment pattern** (lines 1–5 of 0025):
```sql
-- RES-XXX Phase 4a: <description>.
-- ADR-0020 I-2: <invariant reference>.
```
One short block per migration file. No multi-paragraph prose.

**Statement separator** — every DDL statement ends with:
```sql
--> statement-breakpoint
```
Drizzle-kit requires this between every `ALTER TABLE`, `CREATE TABLE`, `CREATE INDEX`, `CREATE POLICY`.

**RLS migration pattern** (from `0013_brands_rls.sql`, lines 9–16):
```sql
ALTER TABLE menu_stop_list ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE menu_stop_list FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY menu_stop_list_iso ON menu_stop_list
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint
```
Apply the same block to `menu_item_slug_aliases`. New tables only — existing tables already have RLS.

**Column rename** — NOT generated by `drizzle-kit generate`; hand-write only:
```sql
-- Pitfall 3: drizzle-kit treats rename as drop+add. Write manually.
ALTER TABLE menu_modifier_options RENAME COLUMN modifier_id TO modifier_group_id;
--> statement-breakpoint
ALTER TABLE menu_item_modifiers RENAME COLUMN modifier_id TO modifier_group_id;
--> statement-breakpoint
```

**Backfill pattern** (Migration B — photos from imageS3Key):
```sql
UPDATE menu_items
SET photos = jsonb_build_array(
  jsonb_build_object(
    's3Key', image_s3_key,
    'sortOrder', 0,
    'isPrimary', true
  )
)
WHERE image_s3_key IS NOT NULL AND image_s3_key <> '';
--> statement-breakpoint
ALTER TABLE menu_items DROP COLUMN image_s3_key;
--> statement-breakpoint
```

**Sequence creation** (Migration K):
```sql
CREATE SEQUENCE IF NOT EXISTS menu_versions_seq
  START WITH 1 INCREMENT BY 1 NO CYCLE;
--> statement-breakpoint
```

---

### `packages/events/src/contracts/catalog.ts` (event-contract, event-driven)

**Analog:** `packages/events/src/contracts/identity.ts` — exact match. The `IdentityRoleChangedV1` and `IdentityRoleChangedV1Payload` pair (lines 98–110) is the canonical pattern for a recently-added, Phase-3-shipped contract.

**File structure pattern** (lines 1–3 of identity.ts):
```typescript
import { z } from 'zod';
import { TenantId } from '@resto/domain';
import { defineEventContract } from '../envelope';
```
No `@nestjs/*` imports — contracts live in `packages/events/`, which has zero framework dependency.

**Payload schema + type + contract triple** (lines 98–110 of identity.ts):
```typescript
export const IdentityRoleChangedV1Payload = z.object({
  userId: z.string().uuid(),
  tenantId: TenantId,
  previousRole: z.string().min(1).max(64),
  newRole: z.string().min(1).max(64),
  actorUserId: z.string().uuid().optional(),
});
export type IdentityRoleChangedV1Payload = z.infer<typeof IdentityRoleChangedV1Payload>;

export const IdentityRoleChangedV1 = defineEventContract({
  type: 'identity.role_changed.v1',
  payload: IdentityRoleChangedV1Payload,
});
```
Exactly this pattern for each of the four catalog contracts. Export both the `Payload` schema, the inferred `type`, and the `defineEventContract` result.

**The four contracts to define** (types only — use identity.ts triple above for the full shape):
- `catalog.menu_first_published.v1` — payload: `{ tenantId: TenantId, version: z.number().int().positive() }`
- `catalog.menu_republished.v1` — payload: `{ tenantId: TenantId, version: z.number().int().positive() }`
- `catalog.item_stopped.v1` — payload: `{ tenantId: TenantId, itemId: z.string().uuid(), itemSlug: z.string().min(1).max(120), stoppedByUserId: z.string().uuid().nullable(), stoppedAt: z.coerce.date() }`
- `catalog.item_unstopped.v1` — payload: `{ tenantId: TenantId, itemId: z.string().uuid(), itemSlug: z.string().min(1).max(120), unstoppedByUserId: z.string().uuid().nullable() }`

---

### `apps/api/src/contexts/catalog/application/dto.ts` (Zod DTO schema, request-response — extend)

**Analog:** self — extend existing file. Pattern is already established.

**Existing pattern** (lines 1–5 of dto.ts):
```typescript
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { CurrencyValue, LocalizedText, MoneyAmountValue, Slug } from '@resto/domain';
```
All new schemas follow the same triple: `export const XxxInputSchema = z.object({...})`, `export type XxxInput = z.infer<typeof XxxInputSchema>`, `export class XxxInputDto extends createZodDto(XxxInputSchema) {}`.

**`UpsertCategoryInputSchema` extension** — add `parentId` after existing fields:
```typescript
export const UpsertCategoryInputSchema = z.object({
  id: z.string().uuid().optional(),
  slug: Slug.optional(),           // make optional — auto-derived if absent
  parentId: z.string().uuid().nullable().default(null),   // NEW
  name: LocalizedText,
  description: LocalizedText.nullable().default(null),
  sortOrder: NonNegInt.default(0),
});
```

**`UpsertItemInputSchema` extension** — replace `imageS3Key` with `photos`, add BJU + source:
```typescript
export const MenuItemPhotoSchema = z.object({
  s3Key: z.string().min(1).max(1024)
    .refine((s) => !/^https?:/i.test(s), 'must be an S3 key, not a URL'),
  sortOrder: NonNegInt,
  alt: z.string().max(255).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  isPrimary: z.boolean().optional(),
});

export const UpsertItemInputSchema = z.object({
  id: z.string().uuid().optional(),
  categoryId: z.string().uuid(),
  slug: Slug.optional(),            // auto-derived if absent
  name: LocalizedText,
  description: LocalizedText.nullable().default(null),
  basePrice: MoneyAmountValue,
  currency: CurrencyValue,
  photos: z.array(MenuItemPhotoSchema).max(20).default([]),   // replaces imageS3Key
  allergens: z.array(z.string().min(1).max(100)).max(50).nullable().default(null),
  proteins: z.number().min(0).max(999.99).nullable().default(null),
  fats: z.number().min(0).max(999.99).nullable().default(null),
  carbs: z.number().min(0).max(999.99).nullable().default(null),
  kcal: z.number().int().min(0).max(32000).nullable().default(null),
  nutritionEstimated: z.boolean().default(false),
  source: z.enum(['manual', 'ai_generated', 'imported_iiko', 'imported_csv']).default('manual'),
  needsReview: z.boolean().default(false),
  sourceExternalId: z.string().max(255).nullable().default(null),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  sortOrder: NonNegInt.default(0),
});
```

**New schemas to add** (follow `UpsertModifierInputSchema` shape at lines 33–46):
```typescript
export const UpsertModifierGroupInputSchema = z.object({  // renamed from UpsertModifierInputSchema
  id: z.string().uuid().optional(),
  name: LocalizedText,
  minSelectable: NonNegInt.default(0),
  maxSelectable: NonNegInt.default(1),
  isRequired: z.boolean().default(false),
}).refine((m) => m.maxSelectable >= m.minSelectable, {
  message: 'maxSelectable must be >= minSelectable',
  path: ['maxSelectable'],
});

export const UpsertModifierOptionInputSchema = z.object({
  id: z.string().uuid().optional(),
  modifierGroupId: z.string().uuid(),
  name: LocalizedText,
  priceDelta: MoneyAmountValue,
  defaultAmount: z.number().int().min(0).default(0),
  freeAmount: z.number().int().min(0).default(0),
  sortOrder: NonNegInt.default(0),
});

export const UpsertItemSizeInputSchema = z.object({
  id: z.string().uuid().optional(),
  menuItemId: z.string().uuid(),
  name: LocalizedText,
  price: MoneyAmountValue,           // absolute price, not delta
  isDefault: z.boolean().default(false),
  sortOrder: NonNegInt.default(0),
});

export const StopItemInputSchema = z.object({
  itemId: z.string().uuid(),
  reason: z.string().max(500).nullable().default(null),
});
```

---

### `apps/api/src/contexts/catalog/application/delayed-publish.service.ts` (service, event-driven — NEW)

**Analog:** `apps/api/src/contexts/catalog/application/publish-menu.service.ts` (lines 1–20) for the service shell; the delayed-timer logic is novel.

**Service shell pattern** (lines 1–4, 10–13 of publish-menu.service.ts):
```typescript
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
// ... plus Logger from @nestjs/common

@Injectable()
export class DelayedPublishService implements OnModuleDestroy {
  private readonly logger = new Logger(DelayedPublishService.name);
  // ...
}
```

**`OnModuleDestroy` lifecycle hook** — the service implements it to drain pending timers on graceful shutdown. This is the same NestJS lifecycle used by `RedisCatalogCacheAdapter.onApplicationShutdown` (lines 46–50 of redis-catalog-cache.adapter.ts). Use `OnModuleDestroy` (fires earlier than `OnApplicationShutdown`).

**In-memory state + `db.withTenant` in setTimeout** — critical: the setTimeout callback runs outside the HTTP ALS frame. ADR-0020 I-6 mandates `db.withTenant(tenantId, ...)` here, NOT `requireTenantContext()`:
```typescript
readonly #pending = new Map<string, { timerId: NodeJS.Timeout }>();
readonly #DELAY_MS = 5_000;

#schedule(tenantId: string): void {
  this.#cancel(tenantId);
  const timerId = setTimeout(() => {
    this.#pending.delete(tenantId);
    // ADR-0020 I-6: no requireTenantContext() here — setTimeout escapes ALS frame.
    void this.publisher.doPublish(tenantId).catch((err: unknown) => {
      this.logger.error({ tenantId, err }, 'Delayed publish failed.');
    });
  }, this.#DELAY_MS);
  this.#pending.set(tenantId, { timerId });
}
```

---

### `apps/api/src/contexts/catalog/application/publish-menu.service.ts` (service, event-driven — refactor)

**Analog:** self (lines 1–20 current). The shell stays; add `doPublish(tenantId)` public method + first-publish detection + outbox emission.

**Outbox emission pattern** — copy `appendToOutbox` usage from `packages/events/src/outbox/`. The `db.withTenant` wrapper pattern from `catalog-drizzle.repository.ts` (lines 54–55) is the exact shell:
```typescript
await this.db.withTenant(async (tx, _scoped) => {
  const version = await this.versions.bump(tenantId);
  const isFirstPublish = (await this.tenantRepo.getMenuFirstPublishedAt(tenantId)) === null;

  if (isFirstPublish) {
    await tx.update(schema.tenants)
      .set({ menuFirstPublishedAt: new Date() })
      .where(eq(schema.tenants.id, tenantId));
    await appendToOutbox(tx, {
      envelope: buildEnvelope(MenuFirstPublishedV1, { tenantId, version }),
    });
  } else {
    await appendToOutbox(tx, {
      envelope: buildEnvelope(MenuRepublishedV1, { tenantId, version }),
    });
  }
});
```
`buildEnvelope` is the only sanctioned constructor (ADR-0020 I-4). `appendToOutbox` from `@resto/events`.

---

### `apps/api/src/contexts/catalog/application/upsert-modifier-group.service.ts` (service, CRUD — rename)

**Analog:** `apps/api/src/contexts/catalog/application/upsert-modifier.service.ts` (lines 1–23) — exact copy with renames.

**Pattern** (full file, lines 1–23):
```typescript
import { Inject, Injectable } from '@nestjs/common';
import { getBrandId, requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import type { UpsertModifierGroupInput } from './dto';

@Injectable()
export class UpsertModifierGroupService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(input: UpsertModifierGroupInput): Promise<{ id: string }> {
    const ctx = requireTenantContext();
    const brandId = getBrandId() ?? null;
    return this.repo.upsertModifierGroup({
      ...(input.id ? { id: input.id } : {}),
      tenantId: ctx.tenantId,
      brandId,
      name: input.name,
      minSelectable: input.minSelectable,
      maxSelectable: input.maxSelectable,
      isRequired: input.isRequired,
    });
  }
}
```
The service itself is 23 lines. All new upsert services follow this exact shape.

---

### `apps/api/src/contexts/catalog/application/upsert-item-size.service.ts` (service, CRUD — NEW)

**Analog:** `apps/api/src/contexts/catalog/application/upsert-modifier.service.ts` (exact shape, different DTO)

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { getBrandId, requireTenantContext } from '@resto/db';
import { MoneyAmount } from '@resto/domain';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import type { UpsertItemSizeInput } from './dto';

@Injectable()
export class UpsertItemSizeService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(input: UpsertItemSizeInput): Promise<{ id: string }> {
    const price = input.price as MoneyAmount;
    const ctx = requireTenantContext();
    const brandId = getBrandId() ?? null;
    return this.repo.upsertItemSize({
      ...(input.id ? { id: input.id } : {}),
      tenantId: ctx.tenantId,
      brandId,
      menuItemId: input.menuItemId,
      name: input.name,
      price,
      isDefault: input.isDefault,
      sortOrder: input.sortOrder,
    });
  }
}
```

---

### `apps/api/src/contexts/catalog/application/stop-list.service.ts` (service, CRUD — NEW)

**Analog:** `apps/api/src/contexts/catalog/application/upsert-modifier.service.ts` for the shell. Notable difference: stop-list service also calls `cachePort.invalidate(tenantId, version)` after write (Option B from RESEARCH.md) and emits outbox events.

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { getBrandId, requireTenantContext, schema } from '@resto/db';
import { appendToOutbox, buildEnvelope } from '@resto/events';
import { eq } from 'drizzle-orm';
import {
  CATALOG_CACHE_PORT,
  CATALOG_REPOSITORY,
  MENU_VERSION_PORT,
  type CatalogCachePort,
  type CatalogRepository,
  type MenuVersionPort,
} from '../domain/ports';
import { ItemStoppedV1, ItemUnstoppedV1 } from '../../../../../../packages/events/src/contracts/catalog';
// (use @resto/events export once catalog.ts is wired into index.ts)
```
The `db.withTenant` + `appendToOutbox` pattern inside is identical to `publish-menu.service.ts` refactor above.

---

### `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` (Drizzle repo, CRUD — major refactor)

**Analog:** self (entire 343-line file). All structural patterns stay; column and table names change throughout.

**Key renames in this file** (find/replace scope):
- `schema.menuVariants` → `schema.menuItemSizes`
- `schema.menuModifiers` → `schema.menuModifierGroups`
- `schema.menuItemModifiers` → `schema.menuItemModifierGroups`
- `r.imageS3Key` → `r.photos` (sign array, not single key)
- `m.modifierId` → `m.modifierGroupId` (junction FK column)
- `v.priceDelta` → `v.price` (absolute price in sizes)

**Sign-photos pattern** (replaces `signImage` at lines 44–47):
```typescript
private async signPhotos(photos: MenuItemPhoto[]): Promise<SignedPhoto[]> {
  return Promise.all(
    photos.map(async (p) => ({
      ...p,
      url: await this.imageUrl.presignGet(p.s3Key, IMAGE_URL_TTL_SECONDS),
    })),
  );
}
```

**Stop-list overlay in `loadPublishedMenu`** — add third parallel query after existing two (lines 79–86):
```typescript
const [categoriesRows, itemsRows, stopListRows] = await Promise.all([
  scoped.selectFrom(schema.menuCategories, brandId ? eq(schema.menuCategories.brandId, brandId) : undefined),
  scoped.selectFrom(schema.menuItems, itemsBaseConditions),
  scoped.selectFrom(schema.menuStopList),   // NEW
]);
const stoppedItemIds = new Set(stopListRows.map((r) => r.itemId));
```
Then filter: `itemsRows.filter((r) => !stoppedItemIds.has(r.id))` before the `Promise.all` map.

**`upsertCategory` — add `parentId` field** to the existing `onConflictDoUpdate` `set` block (lines 228–250). Copy exact `onConflictDoUpdate` shape from lines 239–249.

**New methods needed** (add after `upsertModifier`):
- `upsertModifierGroup(input: UpsertModifierGroupRow)` — copy `upsertModifier` exactly, rename `schema.menuModifiers` → `schema.menuModifierGroups`
- `upsertModifierOption(input: UpsertModifierOptionRow)` — insert/update pattern; has natural `(modifierGroupId)` parent FK
- `upsertItemSize(input: UpsertItemSizeRow)` — copy `upsertModifier` shape; `menuItemId` is the parent reference
- `addToStopList(input)` / `removeFromStopList(input)` — insert with `onConflictDoNothing` / update `archived_at`

---

### `apps/api/src/contexts/catalog/infrastructure/redis-catalog-cache.adapter.ts` (adapter, request-response — extend)

**Analog:** self (lines 1–103). Add Postgres `nextval` fallback to the `bump()` method.

**Existing `bump()` pattern** (lines 65–73):
```typescript
async bump(tenantId: TenantId): Promise<number> {
  if (!this.client) return Date.now();
  try {
    return await this.client.incr(VERSION_KEY(tenantId));
  } catch (err) {
    this.logger.warn({ err }, 'Failed to bump menu version — falling back to wall clock.');
    return Date.now();
  }
}
```

**D-4a-07 extension** — replace the `Date.now()` fallback in the catch block with `nextval`:
```typescript
} catch (redisErr) {
  this.logger.warn({ tenantId, err: redisErr }, 'Redis unavailable — falling back to menu_versions_seq.');
  const result = await this.db.withoutTenant(
    'menu version nextval fallback — Redis unavailable',
    async (tx) => tx.execute(sql`SELECT nextval('menu_versions_seq') AS v`),
  );
  return Number((result.rows[0] as { v: string }).v);
}
```
Constructor must receive `@Inject(TenantAwareDb) private readonly db: TenantAwareDb` in addition to existing `Env` inject.

**Add `invalidate()` method** (new — called by `StopListService`):
```typescript
async invalidate(tenantId: TenantId, version: number, brandId?: string | null): Promise<void> {
  if (!this.client) return;
  try {
    await this.client.del(MENU_KEY(tenantId, version, brandId ?? null));
  } catch (err) {
    this.logger.warn({ err }, 'Failed to invalidate catalog cache key.');
  }
}
```
Add `invalidate` method to `CatalogCachePort` interface in `domain/ports.ts`.

---

### `apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts` (controller, request-response — extend)

**Analog:** self (lines 1–94). New endpoints follow existing `@Post` + `@HttpCode(HttpStatus.OK)` + `@ApiBody` + `@ApiOkResponse` + `wrap()` pattern.

**Existing endpoint pattern** (lines 54–63):
```typescript
@Post('categories')
@HttpCode(HttpStatus.OK)
@ApiBody({ type: UpsertCategoryInputDto })
@ApiOkResponse({ type: IdResponseDto })
@ApiUnauthorizedResponse({ type: ProblemDetailsDto })
category(
  @Body(new RestoZodValidationPipe(UpsertCategoryInputDto)) input: UpsertCategoryInputDto,
): Promise<IdResponseDto> {
  return wrap(() => this.upsertCategory.execute(input));
}
```
Copy this pattern for:
- `POST /internal/v1/catalog/modifier-groups` → `UpsertModifierGroupInputDto`
- `POST /internal/v1/catalog/modifier-options` → `UpsertModifierOptionInputDto`
- `POST /internal/v1/catalog/item-sizes` → `UpsertItemSizeInputDto`
- `POST /internal/v1/catalog/stop-list` → `StopItemInputDto`
- `DELETE /internal/v1/catalog/stop-list/:itemId` → no body (use `@Param`)

**Publish endpoints** — replace `@Inject(PublishMenuService)` with `@Inject(DelayedPublishService)`. Add `DELETE /internal/v1/catalog/publish` for cancel-pending.

---

### `apps/api/src/contexts/catalog/interfaces/http/error-mapping.ts` (error mapping, request-response — extend)

**Analog:** self (lines 1–39). Add new error classes following the exact `switch (err.kind)` shape.

**Existing `mapKnown` pattern** (lines 14–36):
```typescript
const mapKnown = (err: CatalogDomainError): HttpException => {
  switch (err.kind) {
    case 'MenuItemNotFoundError':
      return new NotFoundException({ code: 'catalog.menu_item_not_found', message: err.message });
    case 'CatalogPublishConflictError':
      return new ConflictException({ code: 'catalog.publish_conflict', message: err.message });
    default: {
      const exhaustive: never = err;
      return exhaustive;
    }
  }
};
```
Add new cases for `MenuModifierGroupNotFoundError`, `MenuItemSizeNotFoundError`, `StopListItemNotFoundError` as needed.

---

### `apps/api/src/contexts/catalog/domain/errors.ts` (domain error — extend)

**Analog:** self (lines 1–28). Each new error follows:
```typescript
export class MenuModifierGroupNotFoundError extends Error {
  readonly kind = 'MenuModifierGroupNotFoundError' as const;
  constructor(public readonly groupId: string) {
    super(`Menu modifier group "${groupId}" was not found.`);
    this.name = 'MenuModifierGroupNotFoundError';
  }
}
```
`kind` is `as const` so the discriminated union and `switch` exhaustiveness check work.

---

### `apps/api/src/contexts/catalog/domain/ports.ts` (domain port — extend)

**Analog:** self (lines 1–99). Add new `UpsertXxxRow` interfaces + new port methods to `CatalogRepository`.

**UpsertXxxRow interface shape** (lines 63–88 of ports.ts):
```typescript
export interface UpsertModifierGroupRow {
  readonly id?: string;
  readonly tenantId: string;
  readonly brandId?: string | null;
  readonly name: Record<string, string>;
  readonly minSelectable: number;
  readonly maxSelectable: number;
  readonly isRequired: boolean;
}

export interface UpsertItemSizeRow {
  readonly id?: string;
  readonly tenantId: string;
  readonly brandId?: string | null;
  readonly menuItemId: string;
  readonly name: Record<string, string>;
  readonly price: string;            // absolute price, numeric string
  readonly isDefault: boolean;
  readonly sortOrder: number;
}
```

**Add `invalidate` to `CatalogCachePort`** (after line 43):
```typescript
export interface CatalogCachePort {
  get(tenantId: TenantId, version: number, brandId?: string | null): Promise<PublishedMenu | null>;
  set(menu: PublishedMenu, ttlSeconds: number, brandId?: string | null): Promise<void>;
  invalidate(tenantId: TenantId, version: number, brandId?: string | null): Promise<void>;  // NEW
}
```

---

### `apps/api/src/contexts/catalog/domain/published-menu.ts` (domain read-model — extend)

**Analog:** self (lines 1–101). Rename `PublishedMenuVariant` → `PublishedMenuItemSize`, `PublishedMenuModifier` → `PublishedMenuModifierGroup`.

**New fields on `PublishedMenuItem`** (after existing fields):
```typescript
export interface PublishedMenuItem {
  readonly id: MenuItemId;
  readonly slug: string;
  readonly categoryId: MenuCategoryId;
  readonly name: LocalizedText;
  readonly description: LocalizedText | null;
  readonly basePrice: MoneyAmount;
  readonly currency: Currency;
  readonly imageUrl: string | null;       // keep for backward-compat — presigned URL of photos[0]
  readonly photos: readonly PublishedMenuItemPhoto[];   // NEW
  readonly allergens: readonly string[];
  readonly sortOrder: number;
  readonly sizes: readonly PublishedMenuItemSize[];     // renamed from variants
  readonly modifierGroupIds: readonly MenuModifierGroupId[];  // renamed from modifierIds
  // NEW BJU fields
  readonly proteins: string | null;   // decimal string; null if not set
  readonly fats: string | null;
  readonly carbs: string | null;
  readonly kcal: number | null;
  readonly nutritionEstimated: boolean;
}
```

---

### `apps/api/src/contexts/catalog/catalog.module.ts` (NestJS module — extend)

**Analog:** self (lines 1–40). Wire new services in `providers[]`.

**Existing wiring pattern** (lines 25–37):
```typescript
providers: [
  { provide: CATALOG_REPOSITORY, useClass: CatalogDrizzleRepository },
  RedisCatalogCacheAdapter,
  { provide: CATALOG_CACHE_PORT, useExisting: RedisCatalogCacheAdapter },
  { provide: MENU_VERSION_PORT, useExisting: RedisCatalogCacheAdapter },
  { provide: IMAGE_URL_PORT, useClass: S3SignedImageUrlAdapter },
  GetPublishedMenuService,
  // ...existing services...
],
```
Add each new service (`UpsertModifierGroupService`, `UpsertModifierOptionService`, `UpsertItemSizeService`, `StopListService`, `DelayedPublishService`) to `providers[]`. Add new service imports to constructor of `InternalCatalogController`.

---

### `apps/api/src/contexts/audit/application/record-audit.service.ts` (service, event-driven — extend)

**Analog:** self (lines 7–24). Extend `ACTION_TARGET_KIND` map only. No structural changes.

**Existing map pattern** (lines 7–24):
```typescript
const ACTION_TARGET_KIND: Record<string, string> = {
  'tenancy.tenant_provisioned': 'tenant',
  // ...
  'identity.role_changed': 'user',
  'identity.email_dispatch_failed': 'platform',
};
```

**New entries to add** (after `identity.email_dispatch_failed`):
```typescript
  'catalog.menu_first_published': 'menu',
  'catalog.menu_republished': 'menu',
  'catalog.item_stopped': 'menu_item',
  'catalog.item_unstopped': 'menu_item',
```
The `project()` method resolves `targetId` from `payload.itemId` for `menu_item`-typed events — add a case in the `targetId` IIFE (lines 82–93) for `targetType === 'menu_item'`.

---

## Shared Patterns

### ScopedTx + `db.withTenant` for all write paths
**Source:** `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` lines 228–253
**Apply to:** All new repository methods, `DelayedPublishService.doPublish`, `StopListService`
```typescript
return this.db.withTenant(async (_tx, scoped) => {
  const [row] = await scoped
    .insertInto(schema.menuStopList, { ... })
    .onConflictDoNothing()
    .returning({ id: schema.menuStopList.id });
  if (!row) throw new Error('addToStopList: insert returned no row');
  return { id: row.id };
});
```
Never use `requireTenantContext()` inside a `setTimeout` callback — ADR-0020 I-6.

### `buildEnvelope` for all outbox events
**Source:** `packages/events/src/envelope.ts` lines 139–168
**Apply to:** `PublishMenuService.doPublish`, `StopListService`
```typescript
buildEnvelope(MenuFirstPublishedV1, { tenantId, version })
buildEnvelope(ItemStoppedV1, { tenantId, itemId, itemSlug, stoppedByUserId, stoppedAt: new Date() })
```
Pass the contract as the first argument, payload object as the second. Never construct `EventEnvelope` literals directly.

### `wrapWith(mapCatalogError)` controller pattern
**Source:** `apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts` lines 21–22
**Apply to:** All new controller endpoints
```typescript
const wrap = wrapWith(mapCatalogError);
// Then in each handler:
return wrap(() => this.newService.execute(input));
```

### `RestoZodValidationPipe` per-parameter
**Source:** `apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts` lines 60–61
**Apply to:** All new `@Post` endpoints with body
```typescript
@Body(new RestoZodValidationPipe(UpsertModifierGroupInputDto)) input: UpsertModifierGroupInputDto
```
NOT a global pipe — always per-parameter.

### Composite FK on every new tenant-scoped child table
**Source:** `packages/db/src/schema/_columns.ts` lines 64–73 + `packages/db/migrations/0025_composite_tenant_fk_phase_3b.sql`
**Apply to:** `menu_stop_list`, `menu_item_slug_aliases`, `menu_item_sizes` (via schema rename), `menu_item_modifier_groups` (junction)
```typescript
compositeTenantFk({
  name: 'menu_stop_list_item_fk',
  child: { id: table.itemId, tenantId: table.tenantId },
  parent: { id: menuItems.id, tenantId: menuItems.tenantId },
}).onDelete('cascade'),
tenantParentUniqueIndex('menu_stop_list', { id: table.id, tenantId: table.tenantId }),
```

### Drizzle `onConflictDoUpdate` upsert pattern
**Source:** `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` lines 257–289
**Apply to:** All new upsert methods in `CatalogDrizzleRepository`
```typescript
const [row] = await scoped
  .insertInto(schema.menuItemSizes, { ...values })
  .onConflictDoUpdate({
    target: [schema.menuItemSizes.tenantId, schema.menuItemSizes.id],
    set: { ...updatableFields, updatedAt: new Date() },
  })
  .returning({ id: schema.menuItemSizes.id });
if (!row) throw new Error('upsertItemSize: insert returned no row');
```

### NestJS service class structure
**Source:** `apps/api/src/contexts/catalog/application/upsert-category.service.ts` lines 1–23
**Apply to:** All new `*.service.ts` files
```typescript
@Injectable()
export class NewService {
  constructor(@Inject(SOME_PORT) private readonly repo: SomePort) {}

  async execute(input: SomeInput): Promise<SomeOutput> {
    const ctx = requireTenantContext();
    const brandId = getBrandId() ?? null;
    return this.repo.doSomething({ tenantId: ctx.tenantId, brandId, ...input });
  }
}
```
Single public `execute(input)` method. Private class fields use `#` only when the pattern requires encapsulation (as in `DelayedPublishService`).

### Logger declaration
**Source:** `apps/api/src/contexts/catalog/infrastructure/redis-catalog-cache.adapter.ts` line 31
**Apply to:** `DelayedPublishService`, `StopListService`, `PublishMenuService` (after refactor)
```typescript
private readonly logger = new Logger(DelayedPublishService.name);
```
Structured logging: `this.logger.warn({ tenantId, err }, 'Message.')` — object first, string second.

---

## No Analog Found

All files have close analogs. No file in Phase 4a requires a wholly novel pattern without codebase precedent. The closest to "no precedent" is `delayed-publish.service.ts` (in-memory timer with `OnModuleDestroy`), but the NestJS lifecycle hooks are used in `RedisCatalogCacheAdapter.onApplicationShutdown()` and the timer pattern itself is documented in RESEARCH.md.

| File | Role | Data Flow | Note |
|---|---|---|---|
| `delayed-publish.service.ts` timer logic | service | event-driven | `OnModuleDestroy` hook exists in codebase; 5s in-memory state is novel but the class shell is identical to other services |

---

## Metadata

**Analog search scope:** `apps/api/src/contexts/catalog/`, `packages/db/src/schema/`, `packages/db/migrations/`, `packages/events/src/contracts/`, `apps/api/src/contexts/audit/`
**Files scanned:** 25
**Pattern extraction date:** 2026-05-30
