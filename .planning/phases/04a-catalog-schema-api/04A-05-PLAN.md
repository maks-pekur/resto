---
phase: 04a-catalog-schema-api
plan: 05
type: execute
wave: 5
depends_on: ['04A-04']
files_modified:
  - packages/events/src/contracts/catalog.ts
  - packages/events/src/index.ts
  - apps/api/src/contexts/catalog/application/dto.ts
  - apps/api/src/contexts/catalog/domain/errors.ts
  - apps/api/src/contexts/audit/application/record-audit.service.ts
autonomous: true
requirements:
  - CAT-02
  - CAT-04
  - CAT-05
  - CAT-09
tags: [catalog, events, dto, zod, audit]
goal: Define the 4 new catalog event contracts (`menu_first_published.v1`, `menu_republished.v1`, `item_stopped.v1`, `item_unstopped.v1`), refactor `catalog/application/dto.ts` with all new schemas (CAT-09 max-length constraints, photos JSONB, BJU, source, slug auto-derive, modifier groups, item sizes, stop-list), wire `ACTION_TARGET_KIND` map entries for the 4 new event types, and add new domain error classes.

must_haves:
  truths:
    - '`packages/events/src/contracts/catalog.ts` exports 4 event contracts: `MenuFirstPublishedV1`, `MenuRepublishedV1`, `ItemStoppedV1`, `ItemUnstoppedV1` — each with payload schema + inferred type + `defineEventContract` triple per identity.ts analog.'
    - "`packages/events/src/index.ts` re-exports the 4 contracts so `apps/api` imports as `import { MenuFirstPublishedV1 } from '@resto/events'`."
    - '`apps/api/src/contexts/catalog/application/dto.ts` has: `UpsertCategoryInputSchema` extended with `parentId`; `UpsertItemInputSchema` with `photos`, BJU, `source`, `nutritionEstimated`, `needsReview`, `sourceExternalId` (replacing `imageS3Key`); new `UpsertModifierGroupInputSchema`, `UpsertModifierOptionInputSchema`, `UpsertItemSizeInputSchema`, `StopItemInputSchema` matching SCHEMA-MAP shapes.'
    - 'All free-text Zod fields have `.max(N)` per CAT-09: slug 120 (via @resto/domain Slug), LocalizedText value 255 (centralized in @resto/domain), description via LocalizedText, allergen tag 100, s3Key 1024, alt 255, reason 500, source_external_id 255.'
    - "`apps/api/src/contexts/audit/application/record-audit.service.ts` has `ACTION_TARGET_KIND` entries for `catalog.menu_first_published` ('menu'), `catalog.menu_republished` ('menu'), `catalog.item_stopped` ('menu_item'), `catalog.item_unstopped` ('menu_item'); the `targetId` resolver handles `targetType === 'menu_item'` (reads `payload.itemId`) and `targetType === 'menu'` (reads `payload.tenantId`)."
    - '`apps/api/src/contexts/catalog/domain/errors.ts` exports new error classes: `MenuModifierGroupNotFoundError`, `MenuItemSizeNotFoundError`, `StopListItemNotFoundError`, each with `kind` discriminator; the `CatalogDomainError` union includes them.'
    - '`UpsertModifierInputSchema` and `UpsertModifierInputDto` are REMOVED from dto.ts (renamed to `UpsertModifierGroupInputSchema`); no `imageS3Key` field remains in any schema.'
  artifacts:
    - path: 'packages/events/src/contracts/catalog.ts'
      provides: '4 event contracts following identity.ts pattern'
      contains: 'MenuFirstPublishedV1'
    - path: 'apps/api/src/contexts/catalog/application/dto.ts'
      provides: 'Refactored DTOs for new schema'
      contains: 'MenuItemPhotoSchema'
    - path: 'apps/api/src/contexts/audit/application/record-audit.service.ts'
      provides: 'ACTION_TARGET_KIND covers 4 new catalog event types'
      contains: 'catalog.menu_first_published'
    - path: 'apps/api/src/contexts/catalog/domain/errors.ts'
      provides: '3 new error classes for modifier groups, sizes, stop-list'
      contains: 'MenuModifierGroupNotFoundError'
  key_links:
    - from: 'apps/api/src/contexts/catalog/application/dto.ts'
      to: '@resto/domain (LocalizedText, Slug, MoneyAmountValue, CurrencyValue)'
      via: 'import + Zod schema composition'
      pattern: "from '@resto/domain'"
    - from: 'apps/api/src/contexts/audit/application/record-audit.service.ts'
      to: 'catalog event types'
      via: 'ACTION_TARGET_KIND map'
      pattern: "catalog\\.(menu_first_published|menu_republished|item_stopped|item_unstopped)"
---

<objective>
Land all type-level contracts that the services in plan 06 will implement against: event payload schemas, refactored Zod DTOs covering the iiko-aligned schema, new domain errors, and the audit projection-map entries for the 4 catalog event types.

This plan is type-only — no runtime behavior changes. It unblocks plan 06 (services) and plan 07 (controllers + downstream consumers).

CAT-09 is fully closed here: every free-text field in the new schemas has an explicit `.max(N)` per RESEARCH.md §Phase Requirements row CAT-09 + the centralized caps from `packages/domain`.

Purpose: Provide the type contracts so plan 06 services can be written confidently against final shapes (no DTO-vs-service drift). The "interfaces-first" ordering rule in the planner system prompt motivates this plan's placement.
Output: 5 files modified; types exported; audit projection map covers new events.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/04a-catalog-schema-api/04a-CONTEXT.md
@.planning/phases/04a-catalog-schema-api/04A-RESEARCH.md
@.planning/phases/04a-catalog-schema-api/04A-PATTERNS.md
@apps/api/src/contexts/catalog/application/dto.ts
@apps/api/src/contexts/catalog/domain/errors.ts
@apps/api/src/contexts/audit/application/record-audit.service.ts
@packages/events/src/contracts/identity.ts
@packages/events/src/index.ts

<interfaces>
**Event contract analog (`packages/events/src/contracts/identity.ts` lines 1–30 verified):** Each contract is a triple — a `<Name>Payload` Zod schema, an inferred type alias `type <Name>Payload = z.infer<typeof <Name>Payload>`, and an exported `<Name> = defineEventContract({ type, payload })` constant. Imports are `z` from `zod`, `TenantId` from `@resto/domain`, `defineEventContract` from `../envelope`. NO `@nestjs/*` imports.

**4 catalog contracts to define** (payload shapes per PATTERNS.md §packages/events/src/contracts/catalog.ts + RESEARCH.md §Code Examples — New Event Contracts):

- `MenuFirstPublishedV1` — type `'catalog.menu_first_published.v1'`, payload `{ tenantId: TenantId, version: positive int }`.
- `MenuRepublishedV1` — type `'catalog.menu_republished.v1'`, payload `{ tenantId: TenantId, version: positive int }`.
- `ItemStoppedV1` — type `'catalog.item_stopped.v1'`, payload `{ tenantId, itemId: uuid, itemSlug: string min(1) max(120), stoppedByUserId: uuid nullable, stoppedAt: coerced date }`.
- `ItemUnstoppedV1` — type `'catalog.item_unstopped.v1'`, payload `{ tenantId, itemId: uuid, itemSlug: string min(1) max(120), unstoppedByUserId: uuid nullable }`.

**DTO target field set** (per PATTERNS.md §apps/api/src/contexts/catalog/application/dto.ts — Updated UpsertItemInputSchema):

- `MenuItemPhotoSchema` — `s3Key: string min(1) max(1024) refined to reject http(s)://`, `sortOrder: NonNegInt`, optional `alt: string max(255)`, optional `width/height: positive int`, optional `isPrimary: boolean`.
- `UpsertCategoryInputSchema` extension — make `slug: Slug.optional()`; ADD `parentId: uuid nullable default null`.
- `UpsertItemInputSchema` refactor — REMOVE `imageS3Key`; ADD `photos` array (max 20, default []); ADD BJU `proteins/fats/carbs: number min(0) max(999.99) nullable default null`; ADD `kcal: int min(0) max(32000) nullable default null`; ADD `nutritionEstimated: boolean default false`; ADD `source: enum(['manual','ai_generated','imported_iiko','imported_csv']) default 'manual'`; ADD `needsReview: boolean default false`; ADD `sourceExternalId: string max(255) nullable default null`; constrain `allergens` to array max(50) of strings max(100); change `slug: Slug` to `slug: Slug.optional()`; keep all existing fields (categoryId, basePrice, currency, description as LocalizedText nullable, status enum, sortOrder).
- `UpsertModifierGroupInputSchema` — same structural shape as the removed `UpsertModifierInputSchema` (id optional, name LocalizedText, minSelectable NonNegInt default 0, maxSelectable NonNegInt default 1, isRequired boolean default false) with the same `.refine` rule on max >= min. Just renamed.
- `UpsertModifierOptionInputSchema` — fields: optional id (uuid), modifierGroupId (uuid required), name (LocalizedText), priceDelta (MoneyAmountValue), defaultAmount (NonNegInt default 0), freeAmount (NonNegInt default 0), sortOrder (NonNegInt default 0).
- `UpsertItemSizeInputSchema` — fields: optional id (uuid), menuItemId (uuid required), name (LocalizedText), price (MoneyAmountValue — ABSOLUTE per CAT-05 + Pitfall 6), isDefault (boolean default false), sortOrder (NonNegInt default 0).
- `StopItemInputSchema` — fields: itemId (uuid required), reason (string max(500) nullable default null).

Per CAT-09 + `packages/CLAUDE.md` "Free-text fields MUST have a max length": every `z.string()` carries `.max(N)`. `LocalizedText` from `@resto/domain` already caps locale values internally; the DTO layer reaffirms via compositional usage.

**Audit projection map** (`apps/api/src/contexts/audit/application/record-audit.service.ts` lines 7–24 verified): `ACTION_TARGET_KIND: Record<string, string>` maps event-type prefix (without `.vN` suffix) to a target-kind string used downstream by the `project()` method's `targetId` IIFE. PATTERNS.md §record-audit.service.ts lines 82–93 documents the IIFE pattern.

Add 4 entries (string keys are without `.v1` suffix per existing convention — verified from `identity.role_changed`, `identity.email_dispatch_failed`):

- `'catalog.menu_first_published': 'menu'`
- `'catalog.menu_republished': 'menu'`
- `'catalog.item_stopped': 'menu_item'`
- `'catalog.item_unstopped': 'menu_item'`

For the `targetId` IIFE: add a case where `targetType === 'menu_item'` reads `payload.itemId` (typed as string); `targetType === 'menu'` reads a stable identifier — use `payload.tenantId` as the menu identity, since menus are per-tenant (1:1) and the audit row joins back to the tenant.

**Domain error analog** (`apps/api/src/contexts/catalog/domain/errors.ts` verified — uses `kind` discriminator as `const` + extends `Error` + sets `this.name`; PATTERNS.md §domain/errors.ts).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Create `packages/events/src/contracts/catalog.ts` + re-export from package index</name>
  <files>packages/events/src/contracts/catalog.ts, packages/events/src/index.ts</files>
  <read_first>
    packages/events/src/contracts/identity.ts (full file — exact triple pattern for each contract)
    packages/events/src/index.ts (current re-export shape — find where identity contracts are re-exported)
    .planning/phases/04a-catalog-schema-api/04A-PATTERNS.md (§packages/events/src/contracts/catalog.ts — exact target shape)
    .planning/phases/04a-catalog-schema-api/04A-RESEARCH.md (§Code Examples — New Event Contracts catalog.ts)
  </read_first>
  <action>
    Create `packages/events/src/contracts/catalog.ts`. Imports must match identity.ts lines 1–3: `z` from `zod`; `TenantId` from `@resto/domain`; `defineEventContract` from `../envelope`. NO NestJS imports — `packages/events` has zero framework dependency.

    Define 4 contracts using the identity.ts triple pattern. For each: declare a `<Name>V1Payload` Zod object, infer `<Name>V1Payload` type from it (same identifier shadow as identity.ts), then declare `<Name>V1 = defineEventContract({ type, payload: <Name>V1Payload })`.

    Payload shapes:
    - `MenuFirstPublishedV1Payload`: `tenantId: TenantId`, `version: z.number().int().positive()`.
    - `MenuRepublishedV1Payload`: `tenantId: TenantId`, `version: z.number().int().positive()`.
    - `ItemStoppedV1Payload`: `tenantId: TenantId`, `itemId: z.string().uuid()`, `itemSlug: z.string().min(1).max(120)`, `stoppedByUserId: z.string().uuid().nullable()`, `stoppedAt: z.coerce.date()`.
    - `ItemUnstoppedV1Payload`: `tenantId: TenantId`, `itemId: z.string().uuid()`, `itemSlug: z.string().min(1).max(120)`, `unstoppedByUserId: z.string().uuid().nullable()`.

    Event-type strings (passed to `defineEventContract({ type, payload })`): `'catalog.menu_first_published.v1'`, `'catalog.menu_republished.v1'`, `'catalog.item_stopped.v1'`, `'catalog.item_unstopped.v1'`.

    Update `packages/events/src/index.ts`: re-export the new contracts. Identity / tenancy contracts are re-exported via named re-exports (verified — search for `IdentitySignedInV1` in index.ts to find the export site). Add an analogous block re-exporting `MenuFirstPublishedV1`, `MenuFirstPublishedV1Payload`, `MenuRepublishedV1`, `MenuRepublishedV1Payload`, `ItemStoppedV1`, `ItemStoppedV1Payload`, `ItemUnstoppedV1`, `ItemUnstoppedV1Payload` from `./contracts/catalog`. Match the existing re-export style (named exports preferred over `export *` per project convention).

  </action>
  <verify>
    <automated>test -f packages/events/src/contracts/catalog.ts &amp;&amp; pnpm --filter @resto/events typecheck</automated>
  </verify>
  <done>
    - `packages/events/src/contracts/catalog.ts` exports 4 contracts with payload schemas + types + `defineEventContract` results.
    - `packages/events/src/index.ts` re-exports them.
    - `pnpm --filter @resto/events typecheck` exits 0.
    - `apps/api` can import as `import { MenuFirstPublishedV1 } from '@resto/events'`.
  </done>
  <acceptance_criteria>
    - `grep -c "type: 'catalog.menu_first_published.v1'" packages/events/src/contracts/catalog.ts` returns 1.
    - `grep -c "type: 'catalog.menu_republished.v1'" packages/events/src/contracts/catalog.ts` returns 1.
    - `grep -c "type: 'catalog.item_stopped.v1'" packages/events/src/contracts/catalog.ts` returns 1.
    - `grep -c "type: 'catalog.item_unstopped.v1'" packages/events/src/contracts/catalog.ts` returns 1.
    - `grep -c "defineEventContract" packages/events/src/contracts/catalog.ts` returns 4.
    - `grep -c "MenuFirstPublishedV1\\|MenuRepublishedV1\\|ItemStoppedV1\\|ItemUnstoppedV1" packages/events/src/index.ts` returns ≥ 4 (re-exports wired).
    - `pnpm --filter @resto/events typecheck` exits 0.
  </acceptance_criteria>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Refactor `apps/api/src/contexts/catalog/application/dto.ts` — CAT-09 max-length sweep + new schemas</name>
  <files>apps/api/src/contexts/catalog/application/dto.ts</files>
  <read_first>
    apps/api/src/contexts/catalog/application/dto.ts (full file — current shape; baseline before refactor)
    .planning/phases/04a-catalog-schema-api/04A-PATTERNS.md (§apps/api/src/contexts/catalog/application/dto.ts — exact target for each schema)
    .planning/phases/04a-catalog-schema-api/04A-RESEARCH.md (§Code Examples — Updated UpsertItemInputSchema; §Phase Requirements row CAT-09)
    .planning/phases/04a-catalog-schema-api/04a-CONTEXT.md (D-4a-01/02/03/04/10 — all schema-shape decisions locked)
  </read_first>
  <action>
    Refactor `apps/api/src/contexts/catalog/application/dto.ts` in place. Preserve top imports (`z`, `createZodDto`, `CurrencyValue`, `LocalizedText`, `MoneyAmountValue`, `Slug` from `@resto/domain`). Preserve `const NonNegInt = z.number().int().nonnegative()` declaration.

    Edits, in order:

    1. ADD a `MenuItemPhotoSchema` Zod object near the top after the imports. Fields per the `<interfaces>` block:
       - `s3Key`: string, min 1, max 1024, with a `.refine` rejecting any value starting with `http://` or `https://` (case-insensitive), error message "must be an S3 key, not a URL".
       - `sortOrder`: NonNegInt.
       - `alt`: optional string max 255.
       - `width`, `height`: optional positive integers.
       - `isPrimary`: optional boolean.

    2. Extend `UpsertCategoryInputSchema` (D-4a-01 + D-4a-04):
       - Change `slug: Slug` to `slug: Slug.optional()` (slug is auto-derived from name in plan 06 service if absent).
       - ADD field `parentId: z.string().uuid().nullable().default(null)`.
       - Keep all other fields (id optional, name, description nullable, sortOrder).

    3. Refactor `UpsertItemInputSchema` (D-4a-01/02/03 + CAT-02 + CAT-09):
       - REMOVE field `imageS3Key`.
       - ADD field `photos: z.array(MenuItemPhotoSchema).max(20).default([])` (D-4a-02).
       - ADD BJU fields per D-4a-03: `proteins`, `fats`, `carbs` as `z.number().min(0).max(999.99).nullable().default(null)`; `kcal` as `z.number().int().min(0).max(32000).nullable().default(null)`; `nutritionEstimated` as `z.boolean().default(false)`.
       - ADD provenance fields per D-4a-01: `source: z.enum(['manual','ai_generated','imported_iiko','imported_csv']).default('manual')`; `needsReview: z.boolean().default(false)`; `sourceExternalId: z.string().max(255).nullable().default(null)`.
       - Change `slug: Slug` to `slug: Slug.optional()` (D-4a-04 auto-derive).
       - Constrain `allergens` to `z.array(z.string().min(1).max(100)).max(50).nullable().default(null)` (CAT-09).
       - Keep existing fields: id optional, categoryId, name, description LocalizedText nullable default null, basePrice, currency, status enum, sortOrder.

    4. REMOVE the existing `UpsertModifierInputSchema` + `UpsertModifierInputDto` declarations entirely. ADD `UpsertModifierGroupInputSchema` with the exact same shape and same `.refine` rule (`maxSelectable >= minSelectable`), then export type `UpsertModifierGroupInput` (inferred) and class `UpsertModifierGroupInputDto extends createZodDto(UpsertModifierGroupInputSchema) {}`.

    5. ADD `UpsertModifierOptionInputSchema` (per CAT-04 + iiko alignment with `defaultAmount` + `freeAmount`):
       - Fields: optional id (uuid), modifierGroupId (uuid required), name (LocalizedText), priceDelta (MoneyAmountValue), defaultAmount (NonNegInt default 0), freeAmount (NonNegInt default 0), sortOrder (NonNegInt default 0).
       - Export `UpsertModifierOptionInput` type and `UpsertModifierOptionInputDto` class.

    6. ADD `UpsertItemSizeInputSchema` (per CAT-05 + Pitfall 6 absolute price):
       - Fields: optional id (uuid), menuItemId (uuid required), name (LocalizedText), price (MoneyAmountValue — absolute, NOT delta), isDefault (boolean default false), sortOrder (NonNegInt default 0).
       - Export `UpsertItemSizeInput` type and `UpsertItemSizeInputDto` class.

    7. ADD `StopItemInputSchema` (per D-4a-10):
       - Fields: itemId (uuid required), reason (string max 500 nullable default null).
       - Export `StopItemInput` type and `StopItemInputDto` class.

    Verify after refactor:
    - Zero `imageS3Key` references remain.
    - Zero `UpsertModifierInputSchema` (without "Group") references remain.
    - Every `z.string()` in dto.ts carries `.max(N)` directly or via `Slug` / `LocalizedText` / `MoneyAmountValue` / `CurrencyValue` (which are already capped in `@resto/domain`).
    - `pnpm --filter @resto/api typecheck` still fails (services + repository unfixed until plan 06) — that's expected.

  </action>
  <verify>
    <automated>grep -c "MenuItemPhotoSchema" apps/api/src/contexts/catalog/application/dto.ts &amp;&amp; grep -c "UpsertModifierGroupInputSchema" apps/api/src/contexts/catalog/application/dto.ts &amp;&amp; grep -c "UpsertItemSizeInputSchema" apps/api/src/contexts/catalog/application/dto.ts &amp;&amp; grep -c "StopItemInputSchema" apps/api/src/contexts/catalog/application/dto.ts &amp;&amp; ! grep -q "imageS3Key" apps/api/src/contexts/catalog/application/dto.ts</automated>
  </verify>
  <done>
    - All 7 new/changed schemas exist with correct field shapes.
    - `imageS3Key` removed; `UpsertModifierInputSchema` (without "Group") removed.
    - Every `z.string()` field has explicit `.max()` or wraps an already-capped domain VO.
  </done>
  <acceptance_criteria>
    - `grep -c "MenuItemPhotoSchema = z.object" apps/api/src/contexts/catalog/application/dto.ts` returns 1.
    - `grep -c "parentId: z.string().uuid().nullable()" apps/api/src/contexts/catalog/application/dto.ts` returns 1.
    - `grep -c "photos: z.array(MenuItemPhotoSchema)" apps/api/src/contexts/catalog/application/dto.ts` returns 1.
    - `grep -c "nutritionEstimated: z.boolean()" apps/api/src/contexts/catalog/application/dto.ts` returns 1.
    - `grep -c "source: z.enum(\\['manual','ai_generated','imported_iiko','imported_csv'\\])" apps/api/src/contexts/catalog/application/dto.ts` returns 1.
    - `grep -c "UpsertModifierGroupInputSchema" apps/api/src/contexts/catalog/application/dto.ts` returns ≥ 1.
    - `grep -c "UpsertModifierOptionInputSchema" apps/api/src/contexts/catalog/application/dto.ts` returns ≥ 1.
    - `grep -c "UpsertItemSizeInputSchema" apps/api/src/contexts/catalog/application/dto.ts` returns ≥ 1.
    - `grep -c "StopItemInputSchema" apps/api/src/contexts/catalog/application/dto.ts` returns ≥ 1.
    - `grep -c "imageS3Key" apps/api/src/contexts/catalog/application/dto.ts` returns 0.
    - `grep -c "UpsertModifierInputSchema\\b" apps/api/src/contexts/catalog/application/dto.ts` returns 0 (the bare name without "Group" gone).
    - `grep -c "defaultAmount: NonNegInt" apps/api/src/contexts/catalog/application/dto.ts` returns 1.
    - `grep -c "freeAmount: NonNegInt" apps/api/src/contexts/catalog/application/dto.ts` returns 1.
  </acceptance_criteria>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Add 3 domain error classes + wire audit projection map</name>
  <files>apps/api/src/contexts/catalog/domain/errors.ts, apps/api/src/contexts/audit/application/record-audit.service.ts</files>
  <read_first>
    apps/api/src/contexts/catalog/domain/errors.ts (full file — existing pattern with `kind` discriminator + `CatalogDomainError` union)
    apps/api/src/contexts/audit/application/record-audit.service.ts (full file — locate `ACTION_TARGET_KIND` map at the top + `targetId` IIFE in `project()` method)
    .planning/phases/04a-catalog-schema-api/04A-PATTERNS.md (§apps/api/src/contexts/catalog/domain/errors.ts; §apps/api/src/contexts/audit/application/record-audit.service.ts)
  </read_first>
  <action>
    Edit `apps/api/src/contexts/catalog/domain/errors.ts`:

    Append three new error classes after the existing errors. Each class follows the established pattern verified in the existing file: extends `Error`; has `readonly kind = '<ClassName>' as const`; constructor takes the relevant ID(s) as `public readonly` field(s); sets `this.name = '<ClassName>'`; super-call uses a clear human-readable message.

    Classes to add:
    - `MenuModifierGroupNotFoundError` (`kind = 'MenuModifierGroupNotFoundError'`, constructor `(public readonly groupId: string)`, message `Menu modifier group "${groupId}" was not found.`).
    - `MenuItemSizeNotFoundError` (`kind = 'MenuItemSizeNotFoundError'`, constructor `(public readonly sizeId: string)`).
    - `StopListItemNotFoundError` (`kind = 'StopListItemNotFoundError'`, constructor `(public readonly itemId: string)`).

    Extend the `CatalogDomainError` discriminated union type (existing union at the bottom of the file) by appending `| MenuModifierGroupNotFoundError | MenuItemSizeNotFoundError | StopListItemNotFoundError`. The exhaustive `switch (err.kind)` in plan 07 `error-mapping.ts` will then require handling these via TS's never-check pattern.

    Edit `apps/api/src/contexts/audit/application/record-audit.service.ts`:

    1. Locate the `ACTION_TARGET_KIND: Record<string, string>` constant (around lines 7–24). After the existing `'identity.email_dispatch_failed': 'platform'` line, ADD four entries on consecutive lines, preserving the indentation + quote style + trailing comma of the existing entries:
       - `'catalog.menu_first_published': 'menu'`
       - `'catalog.menu_republished': 'menu'`
       - `'catalog.item_stopped': 'menu_item'`
       - `'catalog.item_unstopped': 'menu_item'`

    2. Locate the `project()` method (PATTERNS.md §record-audit.service.ts lines 82–93) and its `targetId` IIFE. The IIFE currently handles `targetType === 'tenant'`, `'user'`, etc. via switch / if-chain reading specific payload fields.

    Add two new branches:
    - When `targetType === 'menu_item'`: read `payload.itemId` (cast to string; error if missing or non-string — preserve existing safety pattern from neighboring branches).
    - When `targetType === 'menu'`: read `payload.tenantId` as the stable menu identifier (per-tenant menu is 1:1 with tenant). If the existing IIFE has a `default` branch falling back to a constant, use `payload.tenantId` here explicitly so the audit row carries the tenant association for the menu-level events.

    Preserve all existing branches.

  </action>
  <verify>
    <automated>grep -c "MenuModifierGroupNotFoundError\\|MenuItemSizeNotFoundError\\|StopListItemNotFoundError" apps/api/src/contexts/catalog/domain/errors.ts &amp;&amp; grep -c "'catalog.menu_first_published': 'menu'\\|'catalog.item_stopped': 'menu_item'" apps/api/src/contexts/audit/application/record-audit.service.ts</automated>
  </verify>
  <done>
    - Three new error classes exported from `errors.ts` with correct `kind` discriminator + name assignment.
    - `CatalogDomainError` union extended with all three.
    - `ACTION_TARGET_KIND` map has 4 new catalog event entries.
    - `targetId` IIFE handles `'menu_item'` (reads `itemId`) and `'menu'` (reads `tenantId`).
  </done>
  <acceptance_criteria>
    - `grep -c "export class MenuModifierGroupNotFoundError" apps/api/src/contexts/catalog/domain/errors.ts` returns 1.
    - `grep -c "export class MenuItemSizeNotFoundError" apps/api/src/contexts/catalog/domain/errors.ts` returns 1.
    - `grep -c "export class StopListItemNotFoundError" apps/api/src/contexts/catalog/domain/errors.ts` returns 1.
    - `grep -c "kind = 'MenuModifierGroupNotFoundError' as const" apps/api/src/contexts/catalog/domain/errors.ts` returns 1.
    - `grep -c "MenuModifierGroupNotFoundError" apps/api/src/contexts/catalog/domain/errors.ts` returns ≥ 3 (class + union + name string).
    - `grep -c "'catalog.menu_first_published'" apps/api/src/contexts/audit/application/record-audit.service.ts` returns 1.
    - `grep -c "'catalog.menu_republished'" apps/api/src/contexts/audit/application/record-audit.service.ts` returns 1.
    - `grep -c "'catalog.item_stopped'" apps/api/src/contexts/audit/application/record-audit.service.ts` returns 1.
    - `grep -c "'catalog.item_unstopped'" apps/api/src/contexts/audit/application/record-audit.service.ts` returns 1.
  </acceptance_criteria>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                          | Description                                                                 |
| --------------------------------- | --------------------------------------------------------------------------- |
| HTTP body → Zod DTO               | Untrusted input from client; Zod schema is the only authoritative validator |
| event publisher → audit projector | Event payloads must be well-formed; envelope validation enforces structure  |
| domain error → HTTP exception     | Error mapping in plan 07 must cover all union members exhaustively          |

## STRIDE Threat Register

| Threat ID   | Category       | Component                                                                  | Disposition | Mitigation Plan                                                                                                                                                                                                                          |
| ----------- | -------------- | -------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-04a-05-01 | InfoDisclosure | Allergen / description DoS via unbounded string                            | mitigate    | CAT-09 max-length sweep: `allergens` capped at array(50) of strings max(100); `LocalizedText` caps each locale value (centralized in `@resto/domain`); `sourceExternalId` max(255); `reason` max(500); `s3Key` max(1024); `alt` max(255) |
| T-04a-05-02 | Tampering      | photos[].s3Key URL injection (XSS / cookie exfil if URL escapes presigner) | mitigate    | `.refine` rejecting `^https?:` on `s3Key` field; reinforced by `ImageUrlPort.presignGet()` in plan 06 / 07 — only the presigner ever produces a URL                                                                                      |
| T-04a-05-03 | Tampering      | source enum bypass via free-text injection                                 | mitigate    | `z.enum([...])` rejects any value outside the 4 fixed members + DB CHECK constraint `menu_items_source_chk` from plan 02 catches even raw INSERTs                                                                                        |
| T-04a-05-04 | Tampering      | Slug Cyrillic spoof / homograph                                            | mitigate    | `Slug` from `@resto/domain` enforces `^[a-z0-9][a-z0-9-]*$` + max length; auto-derive in plan 06 uses `transliteration` (plan 01); DB CHECK on `menu_items.slug` + `menu_item_slug_aliases.alias`                                        |
| T-04a-05-05 | Spoofing       | Audit event projection mismatch                                            | mitigate    | `ACTION_TARGET_KIND` map covers all 4 catalog event types; the `targetId` IIFE handles `'menu_item'` and `'menu'` target types; exhaustive switch ensures untyped events fall to the existing default branch                             |
| T-04a-05-06 | DoS            | photos array length explosion                                              | mitigate    | `z.array(MenuItemPhotoSchema).max(20)` cap; per-photo `s3Key.max(1024)` cap                                                                                                                                                              |
| T-04a-05-07 | DoS            | BJU overflow / negative values                                             | mitigate    | Zod `z.number().min(0).max(999.99)` for proteins/fats/carbs; `z.number().int().min(0).max(32000)` for kcal; DB column `numeric(5,2)` and `smallint` enforce at storage layer                                                             |

</threat_model>

<verification>
- `pnpm --filter @resto/events typecheck` exits 0.
- `pnpm --filter @resto/api typecheck` is expected to FAIL (services + repository still reference old names; refactored in plan 06) — this is the documented break point.
- `grep -v '^#' apps/api/src/contexts/catalog/application/dto.ts | grep -c "imageS3Key"` returns 0.
- `grep -v '^#' apps/api/src/contexts/catalog/application/dto.ts | grep -c "UpsertModifierInputSchema\\b"` returns 0.
- `grep -c "catalog.menu_first_published\\|catalog.menu_republished\\|catalog.item_stopped\\|catalog.item_unstopped" apps/api/src/contexts/audit/application/record-audit.service.ts` returns 4.
- All 4 event contracts compile (events package typecheck green).
- Three new domain error classes exist with `kind` discriminator + union membership.
</verification>

<success_criteria>

- CAT-02 / CAT-04 / CAT-05 / CAT-09 type contracts complete.
- D-4a-01 / 02 / 03 / 04 / 06 / 10 reflected in DTO + event contracts.
- Audit projection map covers all 4 new catalog event types.
- Plan 06 can implement services against final type shapes without ambiguity.
  </success_criteria>

<output>
Create `.planning/phases/04a-catalog-schema-api/04A-05-SUMMARY.md` when done summarizing:
- The 4 event contract types defined + their re-export site in `packages/events/src/index.ts`.
- The full list of schemas in `dto.ts` after refactor (8 schemas: Category, Item, ModifierGroup, ModifierOption, ItemSize, StopItem, MenuItemPhoto, plus existing pattern).
- The 4 new entries in `ACTION_TARGET_KIND` + the IIFE updates.
- The 3 new domain error classes + how they extend `CatalogDomainError` union.
- A pointer to plan 06's repository refactor as the next step (apps/api typecheck still red).
</output>
