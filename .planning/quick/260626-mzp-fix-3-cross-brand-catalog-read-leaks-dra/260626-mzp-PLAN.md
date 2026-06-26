---
phase: quick-260626-mzp
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/api/src/contexts/catalog/domain/ports.ts
  - apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts
  - apps/api/src/contexts/catalog/application/get-draft-diff.service.ts
  - apps/api/src/contexts/catalog/application/list-modifier-groups.service.ts
  - apps/api/src/contexts/catalog/application/get-stop-list.service.ts
  - apps/api/src/contexts/catalog/interfaces/http/catalog.controller.ts
  - apps/api/test/e2e/catalog.e2e.spec.ts
autonomous: true
requirements: [CR-04]

must_haves:
  truths:
    - "An operator with brand context = Brand A receives ONLY Brand A's draft-diff items, modifier groups, and stop-list entries — never Brand B's, within the same tenant"
    - 'GET /v1/catalog/draft-diff returns 403 when no brand is bound (parity with modifier-groups and stop-list, which already do)'
    - 'All three repository reads filter by brandId in addition to the existing tenant scope'
  artifacts:
    - path: apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts
      provides: 'brand-filtered reads in computeDraftDiff, listModifierGroups, listStopListWithStoppedAt'
      contains: 'eq(schema.menuItems.brandId, brandId)'
    - path: apps/api/test/e2e/catalog.e2e.spec.ts
      provides: '2-brand cross-brand isolation e2e for all three read endpoints'
      contains: 'x-brand-slug'
  key_links:
    - from: apps/api/src/contexts/catalog/interfaces/http/catalog.controller.ts
      to: '@RequireBrand on getDraftDiff route'
      via: 'decorator'
      pattern: '@RequireBrand'
    - from: apps/api/src/contexts/catalog/application/get-draft-diff.service.ts
      to: 'requireBrandContext()'
      via: 'brand resolution passed into computeDraftDiff'
      pattern: 'requireBrandContext'
---

<objective>
Close three cross-brand catalog read leaks found by the 07.6 cross-lens review (07.6-REVIEWS.md). Three GET endpoints are decorated `@RequireBrand()` (or, for draft-diff, are *missing* the decorator entirely) but their repository reads are tenant-scoped only — an operator scoped to Brand A receives Brand B's data within the same tenant.

Fix all three by adding the same `eq(schema.<table>.brandId, brandId)` predicate that every other brand-scoped catalog read already uses (mirror `archiveItem` / `listStoppedItemIds`). Thread `brandId` from each calling service via `requireBrandContext()`. Add `@RequireBrand()` to the draft-diff route so it gates the same way the other two already do.

Purpose: A multi-brand tenant must not leak one brand's menu authoring state (draft items, modifier groups, stop list) to an operator working inside a different brand. This closes the security part of Phase 7.6's CR-04 split.
Output: Brand-filtered reads + a 2-brand cross-brand isolation e2e proving the observable response, not just types.

OUT OF SCOPE (do NOT touch): `catalog_menu_version`, `catalog_brand_stop_version`, `publish`/`cancelPublish`, `delayed-publish`, the menu-version adapter, events/outbox. Those belong to the deferred per-brand publish rework (plans 07.6-08/09, `deferred: true`).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/phases/07.6-admin-vite-spa/07.6-REVIEWS.md

@apps/api/src/contexts/catalog/domain/ports.ts
@apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts
@apps/api/src/contexts/catalog/interfaces/http/catalog.controller.ts

<interfaces>
<!-- Contracts the executor needs. Use these directly — no codebase exploration required. -->

requireBrandContext() — from `@resto/db`, returns the bound brandId as `string`, throws if no brand context is bound (see packages/db/src/context.ts:88). Already used by ReorderCategoriesService.

The brand-filtered-read pattern to MIRROR (already in catalog-drizzle.repository.ts):
listStoppedItemIds(brandId): scoped.selectFrom(schema.menuStopList, eq(schema.menuStopList.brandId, brandId))
archiveItem(id, brandId): ...and(eq(schema.menuItems.id, id), eq(schema.menuItems.brandId, brandId))

Schema columns (confirmed present, all `uuid('brand_id').notNull()`):
schema.menuItems.brandId
schema.menuModifierGroups.brandId
schema.menuStopList.brandId

CatalogRepository port methods to change (apps/api/src/contexts/catalog/domain/ports.ts):
Line ~33: listModifierGroups(): Promise<ModifierGroupListRow[]>
Line ~35: listStopListWithStoppedAt(): Promise<StopListEntryRow[]>
Line ~37: computeDraftDiff(input: { tenantId: TenantId }): Promise<{ items: DraftDiffEntryRow[]; totalCount: number }>

Repository methods to change (apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts):
listModifierGroups ~line 1140 — `groups` read at ~1142 selects schema.menuModifierGroups with NO brand predicate
listStopListWithStoppedAt ~line 1203 — `stopRows` read at ~1205 selects schema.menuStopList with NO brand predicate
computeDraftDiff ~line 1248 — `items` read at ~1260 (`scoped.selectFrom(schema.menuItems)`) has NO brand predicate

scoped.selectFrom signature accepts an optional WHERE as a second arg, e.g.
scoped.selectFrom(schema.menuStopList, eq(schema.menuStopList.brandId, brandId))
For the chained `.orderBy(...)` reads (listModifierGroups groups, listStopListWithStoppedAt stopRows, computeDraftDiff items) keep the existing `.orderBy`/iteration and just add the predicate as the second selectFrom arg. `eq` and `and` are already imported in the repository.

Controller route to gate (apps/api/src/contexts/catalog/interfaces/http/catalog.controller.ts):
getDraftDiff ~line 389 — currently @Get('draft-diff') + @HttpCode + @Permissions + @ApiOkResponse + @ApiForbiddenResponse, MISSING @RequireBrand. Mirror archiveItem's decorator stack (line 285): @RequireBrand() sits directly under @Permissions. `RequireBrand` is already imported (line 23).
</interfaces>

<test-fixture>
<!-- catalog.e2e.spec.ts patterns the new test reuses. -->

setupAuthedTenant(app, label) → { id, slug, brandSlug, authed } where
authed = { cookie, 'x-tenant-id', 'x-brand-slug' } (one tenant, one brand = Brand A)

To add a SECOND brand to the SAME tenant (pattern already used at catalog.e2e.spec.ts:792-803):
POST /v1/me/brands
headers: { cookie: tenant.authed.cookie, 'x-tenant-id': tenant.id }
payload: { slug: brandBSlug, displayName: 'Brand B' }
→ expect 201

To make a brand-scoped catalog request against Brand B, override only the brand-slug header:
headers: { ...tenant.authed, 'x-brand-slug': brandBSlug }

Catalog write/read endpoints already used in the spec:
POST /v1/catalog/categories → { id }
POST /v1/catalog/items (payload incl. categoryId, slug, name, basePrice, currency, status) → { id }
POST /v1/catalog/modifier-groups (payload incl. name, minSelectable, maxSelectable, isRequired) → { id }
POST /v1/catalog/stop-list (payload { itemId, reason? }) → { id } (item must be in the SAME brand)
GET /v1/catalog/draft-diff → { unpublishedCount, items: [{ id, name, status, entityType }], truncatedCount }
GET /v1/catalog/modifier-groups → { items: [{ id, name, ... }] }
GET /v1/catalog/stop-list → { items: [{ id, itemId, ... }] }
</test-fixture>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Brand-filter the three catalog reads + gate draft-diff</name>
  <files>apps/api/src/contexts/catalog/domain/ports.ts, apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts, apps/api/src/contexts/catalog/application/get-draft-diff.service.ts, apps/api/src/contexts/catalog/application/list-modifier-groups.service.ts, apps/api/src/contexts/catalog/application/get-stop-list.service.ts, apps/api/src/contexts/catalog/interfaces/http/catalog.controller.ts</files>
  <action>
Thread `brandId` (from `requireBrandContext()`) into all three reads and add the brand predicate at the DB layer. Mirror the existing brand-filtered reads (`listStoppedItemIds`, `archiveItem`) exactly — same `eq(schema.<table>.brandId, brandId)` style. `eq`/`and` are already imported in the repository; `requireBrandContext` is already exported from `@resto/db`.

(1) DRAFT-DIFF

- `domain/ports.ts`: change `computeDraftDiff` input type to `{ tenantId: TenantId; brandId: string }`.
- `catalog-drizzle.repository.ts` `computeDraftDiff` (~1248): change the items read from `scoped.selectFrom(schema.menuItems)` to `scoped.selectFrom(schema.menuItems, eq(schema.menuItems.brandId, input.brandId))`. Leave the `tenants.menuFirstPublishedAt` lookup and the draft/modified/archived classification untouched.
- `get-draft-diff.service.ts`: after `requireTenantContext()`, resolve `const brandId = requireBrandContext();` and pass `{ tenantId, brandId }` to `computeDraftDiff`. Import `requireBrandContext` from `@resto/db`.
- `catalog.controller.ts` `getDraftDiff` route (~389): add `@RequireBrand()` directly beneath `@Permissions({ menu: ['read'] })`, mirroring `archiveItem`'s decorator stack. (RequireBrand already imported.)

(2) MODIFIER-GROUPS

- `domain/ports.ts`: change signature to `listModifierGroups(brandId: string): Promise<ModifierGroupListRow[]>`.
- `catalog-drizzle.repository.ts` `listModifierGroups` (~1140): accept `brandId: string`; change the `groups` read (~1142) to `scoped.selectFrom(schema.menuModifierGroups, eq(schema.menuModifierGroups.brandId, brandId)).orderBy(asc(schema.menuModifierGroups.id))`. Leave the options/links sub-reads (already keyed by the brand-scoped groupIds) and the count mapping untouched.
- `list-modifier-groups.service.ts`: replace bare `requireTenantContext();` with `requireTenantContext(); const brandId = requireBrandContext();` and pass `brandId` to `this.repo.listModifierGroups(brandId)`. Import `requireBrandContext`.

(3) STOP-LIST

- `domain/ports.ts`: change signature to `listStopListWithStoppedAt(brandId: string): Promise<StopListEntryRow[]>`.
- `catalog-drizzle.repository.ts` `listStopListWithStoppedAt` (~1203): accept `brandId: string`; change the `stopRows` read (~1205) to `scoped.selectFrom(schema.menuStopList, eq(schema.menuStopList.brandId, brandId)).orderBy(desc(schema.menuStopList.stoppedAt))`. Leave the items/categories enrichment sub-reads untouched.
- `get-stop-list.service.ts`: replace bare `requireTenantContext();` with `requireTenantContext(); const brandId = requireBrandContext();` and pass `brandId` to `this.repo.listStopListWithStoppedAt(brandId)`. Import `requireBrandContext`.

Honor CLAUDE.md invariants: reads stay inside `db.withTenant(...)` (ScopedTx), no raw SQL outside packages/db, single `execute()` per service, no `!` assertions, DI by Symbol token (unchanged). Do NOT touch publish/version/event code.
</action>
<verify>
<automated>pnpm --filter @resto/api exec tsc --noEmit -p tsconfig.json</automated>
</verify>
<done>tsc passes; all three repo reads carry `eq(schema.<table>.brandId, brandId)`; `computeDraftDiff` input type carries `brandId`; the two changed port signatures accept `brandId`; `getDraftDiff` route has `@RequireBrand()`; each calling service resolves brand via `requireBrandContext()` and threads it.</done>
</task>

<task type="auto">
  <name>Task 2: 2-brand cross-brand isolation e2e for all three reads</name>
  <files>apps/api/test/e2e/catalog.e2e.spec.ts</files>
  <action>
Add ONE `it(...)` (or a small `describe` with focused `it`s) to the existing suite proving the three reads are brand-isolated using a single tenant with two brands. Use `setupAuthedTenant(stack.app, 'cafe-xbrand')` (Brand A) then create Brand B in the SAME tenant via `POST /v1/me/brands` (mirror catalog.e2e.spec.ts:792-803). Build the Brand-B header set as `{ ...tenant.authed, 'x-brand-slug': brandBSlug }`.

Seed BRAND A (default `tenant.authed` headers):

- POST /v1/catalog/categories → categoryId (A)
- POST /v1/catalog/items with status:'draft' → produces a draft-diff row for A
- POST /v1/catalog/modifier-groups (name {en:'A-only group'}) → groupAId
- POST /v1/catalog/items with status:'published' (a publishable A item) + POST /v1/catalog/stop-list {itemId} → a stop-list entry for A

Seed BRAND B (Brand-B headers):

- POST /v1/catalog/categories → categoryId (B)
- POST /v1/catalog/items status:'draft' (distinct slug, e.g. 'b-draft') → draft-diff row for B
- POST /v1/catalog/modifier-groups (name {en:'B-only group'}) → groupBId
- POST /v1/catalog/items status:'published' (B item) + POST /v1/catalog/stop-list {itemId} → stop-list entry for B

Assert ISOLATION (request as Brand A using `tenant.authed`):

- GET /v1/catalog/draft-diff → response.items map of ids CONTAINS A's draft item id, does NOT contain B's draft item id (assert on the parsed JSON ids, not types).
- GET /v1/catalog/modifier-groups → items map of ids CONTAINS groupAId, does NOT contain groupBId.
- GET /v1/catalog/stop-list → items map of `itemId` CONTAINS A's stopped itemId, does NOT contain B's stopped itemId.

Also assert the gate parity for draft-diff:

- GET /v1/catalog/draft-diff with headers that carry cookie + x-tenant-id but NO x-brand-slug → expect 403 (matches the existing @RequireBrand behavior the other two reads already enforce). Build headers as `{ cookie: tenant.authed.cookie, 'x-tenant-id': tenant.id }` (omit x-brand-slug).

Each request asserts statusCode 200 on the happy reads before asserting body. Give the `it` a 60_000ms timeout like the other heavy specs. No comments in the test body (describe/it names document intent, per apps/CLAUDE.md).
</action>
<verify>
<automated>pnpm --filter @resto/api vitest run test/e2e/catalog.e2e.spec.ts</automated>
</verify>
<done>The new cross-brand spec passes (and the whole catalog.e2e suite stays green). Brand A reads exclude Brand B's draft-diff item, modifier group, and stop-list entry; draft-diff returns 403 without a bound brand. Assertions check the observable HTTP JSON, not just compile-time types.</done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                                      | Description                                                                                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| operator (Brand A session) → catalog read API | An authenticated operator scoped to one brand requests catalog data; the response must not include another brand's rows within the same tenant. |

## STRIDE Threat Register

| Threat ID | Category               | Component                                             | Disposition | Mitigation Plan                                                                                                                                                                                                   |
| --------- | ---------------------- | ----------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-mzp-01  | Information Disclosure | GET /v1/catalog/draft-diff (computeDraftDiff)         | mitigate    | Add `eq(schema.menuItems.brandId, brandId)` to the items read; gate route with `@RequireBrand()`; brand resolved via `requireBrandContext()`. Cross-brand e2e asserts B's draft item is absent from A's response. |
| T-mzp-02  | Information Disclosure | GET /v1/catalog/modifier-groups (listModifierGroups)  | mitigate    | Add `eq(schema.menuModifierGroups.brandId, brandId)` to the groups read; thread brandId from service. e2e asserts B's group absent from A's response.                                                             |
| T-mzp-03  | Information Disclosure | GET /v1/catalog/stop-list (listStopListWithStoppedAt) | mitigate    | Add `eq(schema.menuStopList.brandId, brandId)` to the stop rows read; thread brandId from service. e2e asserts B's stop entry absent from A's response.                                                           |
| T-mzp-04  | Elevation of Privilege | draft-diff route without brand binding                | mitigate    | `@RequireBrand()` forces a bound brand; missing brand → 403, asserted by e2e.                                                                                                                                     |
| T-mzp-SC  | Tampering              | npm/pip/cargo installs                                | accept      | No new dependencies introduced; all imports (`requireBrandContext`, `eq`, `and`) already present in the codebase.                                                                                                 |

</threat_model>

<verification>
- `pnpm --filter @resto/api exec tsc --noEmit -p tsconfig.json` passes.
- `pnpm --filter @resto/api vitest run test/e2e/catalog.e2e.spec.ts` passes, including the new cross-brand isolation spec and the existing suite (no regressions).
- Grep gate: all three reads carry a brand predicate — `grep -n "schema.menuItems.brandId\|schema.menuModifierGroups.brandId\|schema.menuStopList.brandId" apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` shows the new predicates in `computeDraftDiff` / `listModifierGroups` / `listStopListWithStoppedAt`.
- No publish/version/event files appear in the diff.
</verification>

<success_criteria>

- All three catalog read endpoints return only the requesting brand's rows for a 2-brand tenant.
- GET /v1/catalog/draft-diff returns 403 with no bound brand (parity with modifier-groups and stop-list).
- New cross-brand e2e is green and asserts observable HTTP responses.
- Typecheck green; no out-of-scope (publish/version/event) files touched.
  </success_criteria>

<output>
Create `.planning/quick/260626-mzp-fix-3-cross-brand-catalog-read-leaks-dra/260626-mzp-01-SUMMARY.md` when done.
</output>
