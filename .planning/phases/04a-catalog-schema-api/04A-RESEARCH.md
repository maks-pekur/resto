# Phase 4a: Catalog Schema + API - Research

**Researched:** 2026-05-30
**Domain:** Catalog domain redesign — iiko nomenclature alignment, Drizzle schema migration, NestJS DDD bounded-context refactor, delayed-publish with outbox
**Confidence:** HIGH (codebase verified; iiko entity shapes verified via 2 independent SDK sources)

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-4a-01:** `source` provenance enum on `menu_items` (`manual / ai_generated / imported_iiko / imported_csv`)
- **D-4a-02:** Replace `imageS3Key TEXT` with `photos JSONB[]` forward-compat; each entry `{ s3Key, sortOrder, alt? }`
- **D-4a-03:** Structured BJU as 4 nullable fields per 100g + `nutrition_estimated boolean`
- **D-4a-04:** Slug Cyrillic-to-ASCII transliteration + `menu_item_slug_aliases` table; composite FK `(item_id, tenant_id, alias)`; old slugs resolve via alias
- **D-4a-05:** Delayed-publish (NOT instant+undo): 5s in-memory window → THEN write snapshot bump + emit outbox event; if cancelled within 5s, nothing written
- **D-4a-06:** Distinct `catalog.menu_first_published.v1` + `catalog.menu_republished.v1` event contracts
- **D-4a-07:** Redis menu-version primary + Postgres `nextval('menu_versions_seq')` fallback
- **D-4a-08:** Regenerate `docs/api/openapi.yaml` + CI drift-check (`pnpm openapi:check`)
- **D-4a-09:** Public `/v1/menu` DTO inherits new fields automatically
- **D-4a-10:** Stop-list shape — researcher recommends (resolved below)

### Claude's Discretion

- Stop-list shape recommendation (D-4a-10) — researcher choice (resolved: separate `menu_stop_list` table)
- Drizzle migration split strategy (how many files, ordering)
- Transliteration library selection
- Precise Zod max-length constants for CAT-09

### Deferred Ideas (OUT OF SCOPE)

- Admin UI (→ Phase 4b)
- Customer site rendering (→ Phase 5)
- QR-menu polish (→ Phase 6)
- Auto-save-draft vs explicit Save UX (→ Phase 4b)
- Stop-list UX placement (→ Phase 4b)
- Multi-photo gallery UI (→ v2, schema is forward-compatible in 4a)
- Full ТТК recipe entity (→ v2)
- Auto-reset stop-list cron (→ v2)
- Stop-list with reason field in UI (→ v2, schema column added in 4a as nullable)
- Selective publish (→ v2)
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID     | Description                                                                                               | Research Support                                                                                                                                                                                   |
| ------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CAT-02 | Operator creates/edits/archives menu items (name, description, price, allergens, BJU, ingredients, photo) | BJU fields: 4 nullable decimal columns on menu_items; photos: JSONB array; allergens: existing TEXT[] preserved                                                                                    |
| CAT-04 | Operator creates/edits modifier groups + options (per-option price delta)                                 | Rename menu_modifiers → menu_modifier_groups; menu_modifier_options stays; new endpoint `UpsertModifierGroupInputDto` + `UpsertModifierOptionInputDto`                                             |
| CAT-05 | Operator creates variants (size/portion) per item with price overrides                                    | Rename menu_variants → menu_item_sizes; price_delta → absolute price; new `UpsertItemSizeInputDto`                                                                                                 |
| CAT-06 | Operator triggers publish; snapshot becomes new published version (cache version bumped)                  | Delayed-publish (D-4a-05): 5s in-memory delay per tenant, then ScopedTx bump + appendToOutbox; first-publish event distinction (D-4a-06)                                                           |
| CAT-09 | Catalog DTO/Zod max-length constraints on all free-text fields                                            | Slug: max 120 (existing); LocalizedText values: max 255 per locale key; description: max 2000; allergen tag: max 100; photos[].s3Key: max 1024; photos[].alt: max 255; reason (stop-list): max 500 |
| CAT-10 | Redis menu-version uses Postgres nextval fallback when Redis unavailable                                  | Postgres sequence `menu_versions_seq`; MenuVersionPort.bump() catches Redis errors and falls back to nextval(); sequence created in migration K                                                    |

</phase_requirements>

---

## Summary

Phase 4a is a pure backend structural refactor of the existing catalog bounded context. The goal is to align the Drizzle schema with the iiko nomenclature model — which is the de-facto standard entity model for Russian-market restaurants — so that MVP-3 iiko integration is a thin adapter rather than a structural re-shape. Zero paying customers exist at this point, making this the cheapest possible migration window.

The research confirms: (1) the current schema is structurally correct in its tenancy enforcement and layering; the changes are entity-level naming + column additions, not architectural rewrites; (2) the iiko entity model maps cleanly to the proposed RestOS schema with two renames (`menu_variants` → `menu_item_sizes`, `menu_modifiers` → `menu_modifier_groups`) and one new table (`menu_stop_list`); (3) the delayed-publish mechanism is the correct choice for the outbox model — no compensating events needed; (4) all six open questions from CONTEXT.md are resolved with concrete recommendations below.

**Primary recommendation:** Execute schema migration in 12 ordered steps (see SCHEMA-MAP); refactor catalog bounded context services and ports; add 4 new event contracts; regen openapi.yaml. Estimated effort: 4–5 solo days for schema + service layer + tests.

---

## Architectural Responsibility Map

| Capability                | Primary Tier                             | Secondary Tier                        | Rationale                                                             |
| ------------------------- | ---------------------------------------- | ------------------------------------- | --------------------------------------------------------------------- |
| Schema migration          | Database (packages/db)                   | —                                     | Drizzle schema + migrations live in packages/db                       |
| Catalog CRUD services     | API/Backend (apps/api catalog context)   | —                                     | Application services own write path                                   |
| Delayed-publish mechanism | API/Backend (in-memory per-tenant timer) | Database (outbox)                     | Timer is process-scoped; actual write+event are DB-backed via outbox  |
| Menu version management   | API/Backend (MenuVersionPort)            | Database (Postgres sequence fallback) | Redis primary, sequence fallback per D-4a-07                          |
| Public /v1/menu read path | API/Backend (catalog application)        | CDN/Redis cache                       | Redis cache keyed by (tenantId, version); invalidated by publish bump |
| Stop-list read overlay    | API/Backend (catalog read service)       | Database (menu_stop_list join)        | Stop-list is DB-backed; overlaid at read time, NOT via version bump   |
| Outbox event emission     | Database (via appendToOutbox in same tx) | NATS (downstream)                     | ADR-0020 I-6 — no runInTenantContext, use withTenant                  |
| Slug transliteration      | API/Backend (DTO/service layer)          | —                                     | Server-side only; transliteration lib runs at write time              |
| OpenAPI regen             | Build / CI                               | —                                     | pnpm openapi:emit + CI drift-check                                    |

---

## Standard Stack

### Core (all already in project)

| Library         | Version                           | Purpose                                          | Why Standard                                                             |
| --------------- | --------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| drizzle-orm     | ^0.45.2 [VERIFIED: package.json]  | ORM + schema definition                          | Project standard; `_columns.ts` helpers already encode ADR-0020 patterns |
| drizzle-kit     | ^0.31.10 [VERIFIED: package.json] | Migration generation                             | Already wired via `pnpm db:generate`                                     |
| zod             | ^3.24.1 [VERIFIED: package.json]  | DTO schema source of truth                       | Project standard; `createZodDto` for NestJS                              |
| nestjs-zod      | 5.3.0 [VERIFIED: package.json]    | Zod-native NestJS DTO validation                 | Already in use across all contexts                                       |
| @nestjs/swagger | 8.1.0 [VERIFIED: package.json]    | OpenAPI generation                               | Already in use; `pnpm openapi:emit`                                      |
| @resto/events   | workspace                         | Outbox + event contracts                         | `appendToOutbox` + `buildEnvelope` + `defineEventContract` already wired |
| @resto/db       | workspace                         | TenantAwareDb + ScopedTx + schema                | All catalog operations go through this                                   |
| @resto/domain   | workspace                         | Value objects (LocalizedText, Slug, MoneyAmount) | Reused across all new DTOs                                               |

### New Dependency (one package needed)

| Library         | Version                        | Purpose                               | Why Standard                                                                                                         |
| --------------- | ------------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| transliteration | 2.6.1 [VERIFIED: npm registry] | Cyrillic → ASCII slug auto-suggestion | Handles CJK + Cyrillic + all Unicode; well-maintained (2.6.1 current); `slugify()` function is exactly what's needed |

### Package Legitimacy Audit

> slopcheck was not available at research time (pip install failed silently). All packages below are tagged per registry verification only.

| Package         | Registry | Age     | Downloads                            | Source Repo                      | slopcheck | Disposition                                                                                            |
| --------------- | -------- | ------- | ------------------------------------ | -------------------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| transliteration | npm      | ~9 yrs  | [ASSUMED: popular based on npm rank] | github.com/dzcpy/transliteration | [ASSUMED] | Approved — verified version 2.6.1 exists on npm registry; widely used for Cyrillic/CJK transliteration |
| slugify         | npm      | ~10 yrs | [ASSUMED: very popular]              | github.com/simov/slugify         | [ASSUMED] | Alternative option; `transliteration` preferred for better Cyrillic handling                           |

_Packages tagged `[ASSUMED]` — planner must add `checkpoint:human-verify` before install._

**Installation:**

```bash
pnpm add transliteration
```

---

## Architecture Patterns

### System Architecture Diagram

```
Operator (Phase 4b UI) → HTTP POST /internal/v1/catalog/*
                          ↓
                    NestJS Controller
                    (InternalTokenGuard → requireTenantContext)
                          ↓
                    Application Service
                    (UpsertItemService, UpsertModifierGroupService, etc.)
                          ↓
                    CatalogRepository port (ScopedTx)
                          ↓
                    Drizzle / PostgreSQL (RLS + composite FK)

Operator → POST /internal/v1/catalog/publish
                          ↓
                    DelayedPublishService
                    (5s in-memory per-tenant Map<tenantId, NodeJS.Timeout>)
                    ↓ [after 5s, or immediate if already pending]
                    PublishMenuService.doPublish()
                    ↓
                    db.withTenant(tx => {
                      MenuVersionPort.bump()          ← Redis primary
                      appendToOutbox(tx, firstPublishedEvent OR republishedEvent)
                      if first publish: UPDATE tenants SET menu_first_published_at = NOW()
                    })

GET /v1/menu
  → GetPublishedMenuService
    → CatalogCachePort.get(tenantId, version)  ← Redis HIT → return
    → CatalogCachePort MISS:
        → CatalogRepository.loadPublishedMenu()
            → ScopedTx SELECT menu_categories + menu_items
            → LEFT JOIN menu_stop_list → filter stopped items from response
            → SELECT menu_item_sizes + menu_modifier_groups + menu_modifier_options
            → presign photos[0].s3Key via ImageUrlPort
        → CatalogCachePort.set(menu, ttl)
    → return PublishedMenu DTO
```

### Recommended Project Structure (catalog context additions)

```
apps/api/src/contexts/catalog/
├── domain/
│   ├── errors.ts              (existing)
│   ├── ports.ts               (extend: add new row types for sizes, modifier groups, stop-list)
│   └── published-menu.ts      (extend: add photos[], BJU, sizes, modifier groups)
├── application/
│   ├── dto.ts                 (extend: new schemas for sizes, modifier groups, stop-list)
│   ├── delayed-publish.service.ts    (NEW — 5s timer logic)
│   ├── publish-menu.service.ts       (refactor: call delayed-publish, emit first/re-publish events)
│   ├── upsert-category.service.ts    (extend: add parentId support)
│   ├── upsert-item.service.ts        (extend: photos, BJU, source, slug transliteration)
│   ├── upsert-modifier-group.service.ts   (RENAME from upsert-modifier.service.ts)
│   ├── upsert-modifier-option.service.ts  (NEW)
│   ├── upsert-item-size.service.ts        (NEW — was upsert-modifier-variant logic)
│   ├── stop-list.service.ts               (NEW)
│   ├── get-published-menu.service.ts      (extend: overlay stop-list)
│   └── get-menu-item.service.ts           (extend: photos, BJU)
├── infrastructure/
│   ├── catalog-drizzle.repository.ts  (refactor: all renamed tables, photos, stop-list join)
│   ├── redis-catalog-cache.adapter.ts  (extend: nextval fallback for version)
│   └── s3-signed-image-url.adapter.ts (extend: sign array of photos)
├── interfaces/http/
│   ├── internal-catalog.controller.ts (extend: new endpoints for sizes, modifier groups, stop-list)
│   ├── public-menu.controller.ts      (no change)
│   └── error-mapping.ts               (add new error types)
└── catalog.module.ts          (wire new services)

packages/events/src/contracts/
└── catalog.ts                 (NEW — 4 event contracts)

packages/db/src/schema/
└── menu.ts                    (major extension — see SCHEMA-MAP)
```

### Pattern 1: Delayed-Publish with In-Memory Timer

**What:** Instead of immediately bumping the menu version and emitting the outbox event on publish click, hold a per-tenant pending state in memory for 5 seconds. Only after the window elapses (without cancellation) does the service perform the actual DB write + outbox emit.

**When to use:** Any publish action where operator wants a brief undo window without snapshot rollback complexity.

**Implementation sketch:**

```typescript
// Source: D-4a-05 + CTO M4 design decision (verified pattern)
@Injectable()
export class DelayedPublishService implements OnModuleDestroy {
  // Map: tenantId → { timerId, resolvePromise }
  readonly #pending = new Map<string, { timerId: NodeJS.Timeout }>();
  readonly #DELAY_MS = 5_000;

  constructor(
    @Inject(PublishMenuService) private readonly publisher: PublishMenuService,
  ) {}

  /**
   * Queue a publish for `tenantId`. If one is already pending,
   * cancel + replace it (operator double-clicked Publish = reset timer).
   * Returns a cancel function valid for the 5s window.
   */
  async schedule(tenantId: string): Promise<{ cancel: () => boolean }> {
    this.#cancel(tenantId); // clear any in-flight timer
    let cancelled = false;
    const timerId = setTimeout(async () => {
      if (!cancelled) {
        this.#pending.delete(tenantId);
        await this.publisher.doPublish(tenantId);
      }
    }, this.#DELAY_MS);
    this.#pending.set(tenantId, { timerId });
    return {
      cancel: () => {
        if (this.#pending.has(tenantId)) {
          this.#cancel(tenantId);
          cancelled = true;
          return true; // undo was in time
        }
        return false; // already published
      },
    };
  }

  onModuleDestroy() {
    // On process restart: pending timers are lost. All tenants with
    // a pending timer at process death get no publish. Boot-time:
    // no cleanup needed — timer state was never persisted.
    // See Pitfall 1 below for the tradeoff.
    for (const { timerId } of this.#pending.values()) clearTimeout(timerId);
    this.#pending.clear();
  }

  #cancel(tenantId: string) {
    const existing = this.#pending.get(tenantId);
    if (existing) {
      clearTimeout(existing.timerId);
      this.#pending.delete(tenantId);
    }
  }
}
```

**Outbox event timing:** The `catalog.menu_first_published.v1` or `catalog.menu_republished.v1` event fires ONLY after the 5s window elapses without cancellation. UI shows optimistic "Published" state during the window. Audit log timestamp is accurate (event occurred when publish actually committed, not when operator clicked).

### Pattern 2: Stop-List Overlay at Read Time (not version-bump)

**What:** Stop-list changes do NOT bump the menu version. The published snapshot is immutable; stopped status is a real-time overlay from `menu_stop_list` table at GET /v1/menu time.

**Why:** Bumping version on every stop would cold-cache all customer reads during peak service. The stop state is operationally different from the editorial draft→publish lifecycle.

**Implementation in loadPublishedMenu:**

```typescript
// Source: CTO M3 design decision + stop_list table recommendation
const [categoriesRows, itemsRows, stopListRows] = await Promise.all([
  scoped.selectFrom(schema.menuCategories, brandFilter),
  scoped.selectFrom(schema.menuItems, publishedFilter),
  scoped.selectFrom(schema.menuStopList), // NEW: per-tenant stop-list
]);

const stoppedItemIds = new Set(stopListRows.map((r) => r.itemId));
const visibleItems = itemsRows.filter((r) => !stoppedItemIds.has(r.id));
```

**Cache TTL note:** Stop-list changes bypass the version-keyed cache. Two options:

- (A) Short global TTL on the cache key (e.g., 30s) — stale stop reads for up to 30s
- (B) Stop-list mutations also call `CatalogCachePort.invalidate(tenantId)` (flush the current version cache key) — stale reads for 0s but one extra cache miss on stop-list change

**Recommendation:** Option (B). The stop-list mutation service calls `cachePort.invalidate(tenantId, currentVersion)` after writing to `menu_stop_list`. This is a single extra Redis DEL call. The cache then cold-starts on the next read, picks up the stop-list state, and caches again. Negligible cost; correct behavior.

### Pattern 3: First-Publish Detection

```typescript
// Source: D-4a-06 design decision
// In PublishMenuService.doPublish():
const isFirstPublish =
  (await this.tenantRepository.getMenuFirstPublishedAt(tenantId)) === null;

await db.withTenant(async (tx, scoped) => {
  const version = await this.versions.bump(tenantId);

  if (isFirstPublish) {
    await tx
      .update(schema.tenants)
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

### Pattern 4: Cyrillic Slug Auto-Transliteration

```typescript
// Source: D-4a-04 + Growth Marketer HIGH-4
// In UpsertItemService.execute() or UpsertCategoryService.execute():
import { slugify } from 'transliteration';

const normalizeSlug = (input: string): string =>
  slugify(input, {
    lowercase: true,
    separator: '-',
    trim: true,
  })
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

// When operator provides a slug, validate it against Slug schema.
// If the slug is NOT provided (optional field), auto-derive from name:
const derivedSlug = normalizeSlug(input.name[defaultLocale] ?? '');
```

**Alias creation on slug change:**

```typescript
// When an item already has a slug and the new slug differs:
if (existingItem && existingItem.slug !== newSlug) {
  await tx
    .insert(schema.menuItemSlugAliases)
    .values({
      tenantId,
      itemId: existingItem.id,
      alias: existingItem.slug,
    })
    .onConflictDoNothing(); // idempotent — alias may already exist
}
```

### Anti-Patterns to Avoid

- **Bumping menu version on stop-list change:** Creates noisy cache invalidation during Friday peak. Use overlay read pattern instead.
- **Emitting outbox event at publish-button click (not at end of 5s window):** Requires compensating events for undo. The delayed-publish pattern avoids this entirely.
- **Using `runInTenantContext` in `DelayedPublishService.setTimeout` callback:** The setTimeout callback runs outside the HTTP middleware ALS frame. Use `db.withTenant(tenantId, ...)` in the callback (ADR-0020 I-6).
- **Storing `imageS3Key` as a top-level string after migration:** All image access must go through `photos[0].s3Key` and the `ImageUrlPort`. No raw S3 key at the API boundary (RES-92).
- **Decimal(5,2) overflow for BJU:** `DECIMAL(5,2)` range is 0.00 to 999.99. Real food BJU values are 0–99.9 per 100g for most items (fats can approach 100g/100g for oils). `DECIMAL(5,2)` is safe. Kcal: up to ~900kcal/100g for pure fat — `SMALLINT` (max 32767) is safe.

---

## Don't Hand-Roll

| Problem                            | Don't Build                                                                   | Use Instead                                                            | Why                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Cyrillic → ASCII transliteration   | Custom regex replacement table                                                | `transliteration` npm package                                          | Unicode covers 150+ scripts; hand-rolled tables miss edge cases (ё, й, ъ, ь, ч, ш, щ, etc.) |
| Menu version bump + Redis fallback | Direct Redis + manual nextval call                                            | Encapsulate in `MenuVersionPort.bump()` with try/catch redis → nextval | Single place to reason about version source; testable port                                  |
| Outbox event construction          | `{ id: randomUUID(), type: '...', correlationId: randomUUID(), ... }` literal | `buildEnvelope(contract, payload)`                                     | ADR-0020 I-4: correlationId must derive from OTel span; direct literals are forbidden       |
| Composite FK enforcement           | Manual WHERE tenant_id checks in every query                                  | `ScopedTx` + composite FK in Drizzle schema                            | ADR-0020 I-1 + I-2: double enforcement; no bypass                                           |
| DTO validation                     | Hand-written validators                                                       | Zod schema + `createZodDto` + `RestoZodValidationPipe` per-parameter   | Existing project pattern; Zod is single source of truth                                     |
| Slug uniqueness check              | SELECT + INSERT                                                               | `onConflictDoUpdate` with `(tenantId, slug)` unique index              | Drizzle already has this pattern in `upsertCategory` — replicate                            |

---

## Common Pitfalls

### Pitfall 1: Delayed-Publish Timer Lost on Process Restart

**What goes wrong:** Operator clicks Publish at 14:59:58, server restarts at 15:00:01 (5s timer in flight), publish never completes. Operator thinks menu is published (UI showed optimistic state). Customer sees stale menu.
**Why it happens:** In-memory `setTimeout` is ephemeral. No persistence across process restarts.
**How to avoid:** Two options: (a) Accept the failure mode — if timer is lost, operator must click Publish again. UI must not show "permanently published" until the server confirms via a `/v1/catalog/publish/status` poll or SSE. (b) Add a `menu_pending_publish` table with a TTL column; on boot, check if any tenant has a pending publish row older than 5s and execute it. Option (b) is the production-safe path.
**Warning signs:** Operator reports "I published but the menu didn't update." In Phase 4a with internal token (no real operators), option (a) is acceptable. Phase 4b should add option (b) or a confirmation ping-back endpoint.

### Pitfall 2: photos JSONB Array vs item_photos Table — Indexing Limitation

**What goes wrong:** Queries like "find all items with photos" or "find items with a specific s3Key" require JSONB array scanning if using the `photos JSONB` column approach.
**Why it happens:** Postgres JSONB array elements are not individually indexed without a GIN index on specific paths.
**How to avoid:** For MVP-1, this is not a problem — queries are always scoped by `tenant_id` and the `photos` column is read-only at the item level. A GIN index `CREATE INDEX menu_items_photos_gin ON menu_items USING gin(photos)` can be added if search-by-photo becomes needed. No `item_photos` table needed in 4a — the JSONB column avoids an extra join on every menu read (which is the hot path).

### Pitfall 3: menu_modifier_options.modifier_id → modifier_group_id Column Rename

**What goes wrong:** Drizzle generates a migration that DROPs the old column and ADDs a new one (data loss) instead of renaming.
**Why it happens:** Drizzle-kit `generate` detects column drops + adds as separate operations; column renames are treated as drop+add by default.
**How to avoid:** Write the migration SQL manually for the rename: `ALTER TABLE menu_modifier_options RENAME COLUMN modifier_id TO modifier_group_id`. Drizzle-kit 0.31.x supports `--custom` migration files or manual migration insertion into the `meta/` journal.

### Pitfall 4: RLS Policy Missing on New Tables

**What goes wrong:** `menu_stop_list`, `menu_item_slug_aliases` tables created without RLS enabled → `resto_app` role can read any tenant's stop-list rows.
**Why it happens:** `pgTable()` in Drizzle does not automatically emit RLS DDL — that lives in a separate migration file.
**How to avoid:** After every new `pgTable` addition, add a corresponding `ALTER TABLE <name> ENABLE ROW LEVEL SECURITY; ALTER TABLE <name> FORCE ROW LEVEL SECURITY;` in the migration. Follow existing pattern from `packages/db/migrations/0024_*.sql`.

### Pitfall 5: Slug Constraint Tightening Breaks Existing Seeds

**What goes wrong:** The current `Slug` regex allows trailing hyphens (`^[a-z0-9][a-z0-9-]*$`). D-4a-04 tightens to `^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$` (no trailing hyphens, max 64 chars). Any existing seed data with trailing-hyphen slugs will fail on the new constraint.
**Why it happens:** Seed scripts used loose slug generation.
**How to avoid:** Before tightening the Zod constraint, run `SELECT slug FROM menu_items WHERE slug ~ '-$'` on dev DB. Current seed data confirmed clean (no trailing hyphens observed). DB-level check constraint in `menu_categories` already disallows trailing hyphens (`^[a-z0-9][a-z0-9-]*$` — technically allows them; tighten DB check constraint in migration too).

### Pitfall 6: menu_item_sizes — Price Semantic Change Breaks Existing Consumers

**What goes wrong:** If any code reads `variant.priceDelta` and adds it to `item.basePrice`, after the rename to `price` (absolute), the total doubles.
**Why it happens:** The semantic change from delta to absolute is invisible to the type system if both are `money` columns.
**How to avoid:** In the same migration that renames the column, backfill: `UPDATE menu_item_sizes SET price = (SELECT base_price FROM menu_items WHERE id = menu_item_id)` (since all current priceDelta = 0, price = basePrice). Then update ALL code reading this column to treat it as absolute. Search codebase for `priceDelta` and `price_delta` references in catalog context and update.

### Pitfall 7: AppendToOutbox Outside withTenant in Delayed-Publish Timer

**What goes wrong:** `setTimeout` callback has no ALS frame from the original HTTP request. Calling `requireTenantContext()` inside the callback throws.
**Why it happens:** setTimeout escapes the ALS frame of the HTTP request that scheduled it.
**How to avoid:** In the `setTimeout` callback, explicitly call `db.withTenant(tenantId, async (tx) => { await appendToOutbox(tx, envelope); ... })` — never `requireTenantContext()` or `runInTenantContext()` (ADR-0020 I-6).

---

## Code Examples

### New Event Contracts (catalog.ts)

```typescript
// Source: packages/events/src/contracts/tenancy.ts as pattern
import { z } from 'zod';
import { TenantId } from '@resto/domain';
import { defineEventContract } from '../envelope';

export const MenuFirstPublishedV1Payload = z.object({
  tenantId: TenantId,
  version: z.number().int().positive(),
});
export type MenuFirstPublishedV1Payload = z.infer<
  typeof MenuFirstPublishedV1Payload
>;
export const MenuFirstPublishedV1 = defineEventContract({
  type: 'catalog.menu_first_published.v1',
  payload: MenuFirstPublishedV1Payload,
});

export const MenuRepublishedV1Payload = z.object({
  tenantId: TenantId,
  version: z.number().int().positive(),
});
export const MenuRepublishedV1 = defineEventContract({
  type: 'catalog.menu_republished.v1',
  payload: MenuRepublishedV1Payload,
});

export const ItemStoppedV1Payload = z.object({
  tenantId: TenantId,
  itemId: z.string().uuid(),
  itemSlug: z.string(),
  stoppedByUserId: z.string().nullable(),
  stoppedAt: z.coerce.date(),
});
export const ItemStoppedV1 = defineEventContract({
  type: 'catalog.item_stopped.v1',
  payload: ItemStoppedV1Payload,
});

export const ItemUnstoppedV1Payload = z.object({
  tenantId: TenantId,
  itemId: z.string().uuid(),
  itemSlug: z.string(),
  unstoppedByUserId: z.string().nullable(),
});
export const ItemUnstoppedV1 = defineEventContract({
  type: 'catalog.item_unstopped.v1',
  payload: ItemUnstoppedV1Payload,
});
```

### Updated UpsertItemInputSchema (CAT-09 max-length constraints)

```typescript
// Source: D-4a-02 + D-4a-03 + CAT-09
export const MenuItemPhotoSchema = z.object({
  s3Key: z
    .string()
    .min(1)
    .max(1024)
    .refine((s) => /^https?:/i.test(s) === false, 'must be S3 key, not URL'),
  sortOrder: z.number().int().nonnegative(),
  alt: z.string().max(255).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  isPrimary: z.boolean().optional(),
});

export const UpsertItemInputSchema = z.object({
  id: z.string().uuid().optional(),
  categoryId: z.string().uuid(),
  slug: Slug.optional(), // auto-derived from name if absent
  name: LocalizedText, // each value max 255 (enforced in LocalizedText)
  description: LocalizedText.nullable().default(null),
  basePrice: MoneyAmountValue,
  currency: CurrencyValue,
  photos: z.array(MenuItemPhotoSchema).max(20).default([]),
  allergens: z
    .array(z.string().min(1).max(100))
    .max(50)
    .nullable()
    .default(null),
  // BJU
  proteins: z.number().min(0).max(999.99).nullable().default(null),
  fats: z.number().min(0).max(999.99).nullable().default(null),
  carbs: z.number().min(0).max(999.99).nullable().default(null),
  kcal: z.number().int().min(0).max(32000).nullable().default(null),
  nutritionEstimated: z.boolean().default(false),
  // Provenance
  source: z
    .enum(['manual', 'ai_generated', 'imported_iiko', 'imported_csv'])
    .default('manual'),
  needsReview: z.boolean().default(false),
  sourceExternalId: z.string().max(255).nullable().default(null),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  sortOrder: z.number().int().nonneg().default(0),
});
```

### MenuVersionPort — Redis + nextval fallback (CAT-10)

```typescript
// Source: D-4a-07 design decision
@Injectable()
export class RedisMenuVersionAdapter implements MenuVersionPort {
  constructor(
    private readonly redis: Redis,
    @Inject(TenantAwareDb) private readonly db: TenantAwareDb,
  ) {}

  async bump(tenantId: TenantId): Promise<number> {
    const key = `menu:version:${tenantId}`;
    try {
      const version = await this.redis.incr(key);
      return version;
    } catch (redisErr) {
      // Redis unavailable — fall back to Postgres sequence
      this.logger.warn(
        { tenantId, err: redisErr },
        'Redis unavailable; falling back to menu_versions_seq',
      );
      const result = await this.db.withoutTenant(
        'menu version nextval fallback — Redis unavailable',
        async (tx) => tx.execute(sql`SELECT nextval('menu_versions_seq') AS v`),
      );
      return Number((result.rows[0] as { v: string }).v);
    }
  }

  async current(tenantId: TenantId): Promise<number> {
    const key = `menu:version:${tenantId}`;
    const val = await this.redis.get(key);
    if (val) return parseInt(val, 10);
    return 0; // no version yet = never published
  }
}
```

---

## Runtime State Inventory

> This is a schema migration phase. All existing catalog data is dev-seed only.

| Category            | Items Found                                                                                                                             | Action Required                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Stored data         | `menu_categories`, `menu_items`, `menu_variants`, `menu_modifiers`, `menu_modifier_options`, `menu_item_modifiers` — dev seed data only | Forward-only migration with backfill steps; `db:reset` acceptable for local dev recovery |
| Live service config | None — no paying tenants, no external service config with catalog entity names                                                          | None                                                                                     |
| OS-registered state | None                                                                                                                                    | None                                                                                     |
| Secrets/env vars    | `REDIS_URL` — existing; `DATABASE_URL` — existing; no new env vars needed                                                               | None                                                                                     |
| Build artifacts     | `packages/api-client/src/generated/api.ts` — will be stale after schema changes                                                         | Regen via `pnpm openapi:emit` as part of D-4a-08                                         |

---

## State of the Art

| Old Approach                                      | Current Approach                                                  | When Changed | Impact                                                   |
| ------------------------------------------------- | ----------------------------------------------------------------- | ------------ | -------------------------------------------------------- |
| Single `imageS3Key TEXT`                          | `photos JSONB[]` array                                            | Phase 4a     | Forward-compat multi-photo; Phase 5/6 can render gallery |
| `menu_variants` (priceDelta, not reusable)        | `menu_item_sizes` (absolute price per item)                       | Phase 4a     | Cleaner iiko alignment; Phase 7 cart simpler             |
| `menu_modifiers` (confusingly named group entity) | `menu_modifier_groups` (correct naming)                           | Phase 4a     | Code clarity; iiko adapter mapping                       |
| No stop-list state                                | `menu_stop_list` table (real-time overlay)                        | Phase 4a     | Operational stop-list without version bump               |
| Single `catalog.menu_published.v1` event          | `catalog.menu_first_published.v1` + `catalog.menu_republished.v1` | Phase 4a     | Phase 13/14 activation funnel measurement                |
| Redis-only menu version                           | Redis primary + `menu_versions_seq` fallback                      | Phase 4a     | Concurrent-publish collision safety during Redis outage  |

---

## Open Questions Resolved

All 6 open questions from `04a-CONTEXT.md <schema_redesign_direction>` are resolved — see `04A-SCHEMA-MAP.md §Open Questions Resolved` for full rationale. Summary:

1. **Hierarchical Группы:** Add `parent_id` nullable self-FK to `menu_categories`. Admin UI starts flat; schema ready for tree.
2. **Размер as standalone or embedded:** Keep per-item (`menu_item_sizes`). Rename `menu_variants`, change `price_delta` → absolute `price`. Phase 7 cart references `menu_item_size_id`.
3. **Modifier / ModifierGroup split:** Already structurally split. Rename `menu_modifiers` → `menu_modifier_groups`. Add `defaultAmount` + `freeAmount` on options.
4. **ТТК:** BJU columns only in 4a. No schema lock-in — future `menu_item_recipes` table can reference `menu_items(id, tenant_id)` independently.
5. **Stop-list shape:** Separate `menu_stop_list` table. Read-time overlay, not version bump.
6. **Stop-list reason field:** Add `reason TEXT NULLABLE` in 4a table creation. MVP-1 UI ignores it; v2 can expose without migration.

---

## Assumptions Log

| #   | Claim                                                                                                                         | Section                             | Risk if Wrong                                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | All existing `menu_variants.price_delta` values are 0 (no real size pricing in dev seed)                                      | Standard Stack / Migration Strategy | If any variants have non-zero priceDelta, the backfill formula `price = item.base_price` would be wrong; need `price = base_price + price_delta` instead                                                                |
| A2  | `transliteration` npm package handles Cyrillic correctly (verified version exists, behavior assumed from package description) | Standard Stack                      | If package fails to transliterate correctly, use `slugify` as alternative; both verified on npm                                                                                                                         |
| A3  | `menu_versions_seq` as a global Postgres sequence (not per-tenant) is acceptable for version fallback                         | Code Examples (MenuVersionPort)     | A single global sequence means version numbers are not monotonic per-tenant; they're still globally unique and usable as cache-busting keys; no logical issue unless analytics depends on per-tenant version continuity |
| A4  | iiko's `is_group_modifier` field on `NomenclatureGroupModel` (boolean) distinguishes modifier groups from product groups      | Entity Mapping Table                | If modifier groups need to be modeled as categories with `isGroupModifier = true`, the current separate `menu_modifier_groups` table is still correct; this field is not needed for RestOS MVP-1                        |

---

## Environment Availability

| Dependency              | Required By           | Available         | Version      | Fallback                   |
| ----------------------- | --------------------- | ----------------- | ------------ | -------------------------- |
| Node.js                 | All                   | ✓                 | v24.15.0     | —                          |
| pnpm                    | Package management    | ✓                 | 9.15.0       | —                          |
| Docker                  | Integration tests     | ✓                 | 29.4.0       | Skip docker-required tests |
| PostgreSQL (via Docker) | DB migrations + tests | ✓ (via Docker)    | —            | —                          |
| Redis (via Docker)      | Menu version + cache  | ✓ (via Docker)    | —            | —                          |
| drizzle-kit             | Migration generation  | ✓                 | 0.31.10      | —                          |
| transliteration         | Cyrillic slug         | ✗ (not installed) | 2.6.1 on npm | `slugify` as alternative   |

**Missing dependencies with no fallback:** None — `transliteration` has an alternative (`slugify`).

**Missing dependencies with fallback:**

- `transliteration` (not installed): `pnpm add transliteration` before implementing slug auto-derive; fallback to `slugify` if package verification fails.

---

## Project Constraints (from CLAUDE.md)

All constraints actively enforced in this phase's deliverables:

- **TypeScript end-to-end, strict mode** — all new code in TS; `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` (NestJS relaxed)
- **Zod schemas as source of truth** — all new DTOs use `z.object()` → `z.infer<>` → `createZodDto()`; no standalone `type` declarations
- **ScopedTx + RLS double-enforcement** — every new table query goes through `scoped.selectFrom()` or `scoped.insertInto()`; no raw `tx.select()` on tenant-scoped tables
- **Composite FK on every tenant-scoped child table** (ADR-0020 I-2) — `menu_stop_list`, `menu_item_slug_aliases`, `menu_item_sizes` (renamed), `menu_modifier_options` (updated FK) all have `compositeTenantFk`
- **RLS ENABLE + FORCE on all new tables** — migration must include `ALTER TABLE <name> ENABLE ROW LEVEL SECURITY; ALTER TABLE <name> FORCE ROW LEVEL SECURITY;`
- **`buildEnvelope` for all outbox events** — no direct `EventEnvelope` literal construction (ADR-0020 I-4)
- **`db.withTenant` in setTimeout callback** — never `runInTenantContext` outside HTTP middleware (ADR-0020 I-6)
- **No hard deletes** — stop-list: soft toggle via `menu_stop_list` insert/delete; item archive via `status = 'archived'`; `archived_at` timestamp for audit
- **Conventional Commits prefix** — all commits: `feat:`, `refactor:`, `fix:`, `docs:`, `chore:`, `test:`; no multi-line commit bodies
- **No Claude attribution in commits** — per user global CLAUDE.md override
- **Free-text fields MUST have max-length** (packages/domain CLAUDE.md) — CAT-09 requirement; all new Zod string fields have `.max(N)`
- **URL fields must restrict scheme** — `photos[].s3Key` is a storage key (not URL); `ImageUrlPort.presignGet()` returns the signed URL; the key field must NOT accept `http:` prefix
- **`withoutTenant` requires non-empty reason string** — `menu version nextval fallback — Redis unavailable` is the reason

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category         | Applies                                         | Standard Control                                                |
| --------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| V2 Authentication     | No (internal token auth unchanged)              | `InternalTokenGuard` already applied                            |
| V3 Session Management | No                                              | Unchanged                                                       |
| V4 Access Control     | Yes — stop-list mutations must be tenant-scoped | `ScopedTx` + RLS prevents cross-tenant access                   |
| V5 Input Validation   | Yes                                             | Zod schemas on all DTOs; `RestoZodValidationPipe` per-parameter |
| V6 Cryptography       | No (S3 presigning unchanged)                    | `ImageUrlPort.presignGet()` unchanged                           |

### Known Threat Patterns

| Pattern                               | STRIDE    | Standard Mitigation                                                                                               |
| ------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------- |
| Cross-tenant stop-list manipulation   | Tampering | `menu_stop_list` composite FK `(item_id, tenant_id)` + RLS prevents tenant A from stopping tenant B's items       |
| S3 key injection via `photos[].s3Key` | Tampering | Zod refine: reject values starting with `https?:` (must be S3 key, not URL); `ImageUrlPort` presigns at read time |
| Slug injection via Cyrillic names     | Spoofing  | Server-side `transliteration.slugify()` + Zod regex `^[a-z0-9][a-z0-9-]*$` enforced; DB CHECK constraint          |
| DoS via large photos array            | DoS       | `z.array(MenuItemPhotoSchema).max(20)` cap; each `s3Key` max 1024 chars                                           |
| BJU overflow attack                   | Tampering | `decimal(5,2)` column type + Zod `z.number().min(0).max(999.99)`                                                  |

---

## Sources

### Primary (HIGH confidence)

- `/Users/mp_dev/projects/RestOS/packages/db/src/schema/menu.ts` — current Drizzle schema (verified by direct read)
- `/Users/mp_dev/projects/RestOS/apps/api/src/contexts/catalog/` — entire bounded context (verified by direct read)
- `/Users/mp_dev/projects/RestOS/packages/events/src/` — envelope + outbox patterns (verified)
- `/Users/mp_dev/projects/RestOS/packages/domain/src/` — value objects (verified)
- `.planning/phases/04a-catalog-schema-api/04a-CONTEXT.md` — locked decisions D-4a-01..D-4a-10 (source of truth)
- `.planning/phases/04-catalog-admin/PERSONA-CTO.md` + `PERSONA-SKEPTIC.md` + `PERSONA-PRODUCT-STRATEGIST.md` + `PERSONA-GROWTH-MARKETER.md` (all verified)

### Secondary (MEDIUM confidence — iiko entity shapes)

- `https://github.com/kebrick/pyiikocloudapi/blob/main/pyiikocloudapi/models.py` — Python Pydantic models for iiko entities; verified via WebFetch; consistent with Go source
- `https://pkg.go.dev/github.com/wollzy/iiko-go` — Go struct definitions for iiko entities; verified via WebFetch; cross-referenced against Python models
- `https://github.com/salesduck/iiko-cloud-api` — TypeScript SDK generated from iiko OpenAPI schema; README verified; full type definitions not fetched due to SPA limitations

### Tertiary (LOW confidence)

- `https://ru.iiko.help/articles/#!api-documentations/elementy-nomenklatury` — official iiko docs; NOT REACHABLE via WebFetch (SPA); entity shapes inferred from SDK sources above

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all project dependencies verified in package.json
- Architecture patterns: HIGH — CTO/Skeptic persona analysis + direct code read
- iiko entity shapes: MEDIUM — two independent SDK sources (Python + Go) agree; official docs unreachable
- Pitfalls: HIGH — identified from existing codebase patterns + ADR-0020 invariants
- Migration strategy: HIGH — based on actual Drizzle schema and migration patterns in packages/db

**Research date:** 2026-05-30
**Valid until:** 2026-07-30 (stable stack; iiko API unlikely to change entity structure)
