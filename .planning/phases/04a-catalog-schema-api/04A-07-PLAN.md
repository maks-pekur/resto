---
phase: 04a-catalog-schema-api
plan: 07
type: execute
wave: 7
depends_on: ['04A-06']
files_modified:
  - apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts
  - apps/api/src/contexts/catalog/interfaces/http/error-mapping.ts
  - apps/api/test/e2e/catalog.e2e.spec.ts
  - apps/api/test/e2e/menu-brand-response.e2e.spec.ts
  - apps/api/test/e2e/tenant-isolation.spec.ts
  - apps/qr-menu/src/api/types.ts
  - docs/api/openapi.yaml
  - packages/api-client/src/generated/api.ts
  - apps/api/package.json
  - .github/workflows/ci.yml
  - apps/api/src/contexts/catalog/application/delayed-publish.service.ts
  - tools/openapi-check.ts
  - package.json
autonomous: true
requirements:
  - CAT-02
  - CAT-04
  - CAT-05
  - CAT-06
tags: [catalog, controller, e2e, openapi, drift-check, downstream-refactor]
goal: Wire new HTTP endpoints (modifier-groups, modifier-options, item-sizes, stop-list add/remove, publish schedule + cancel) per RESEARCH.md flow; extend error mapping with new domain errors; refactor downstream consumers (qr-menu types, e2e specs, tenant-isolation matrix); regenerate `docs/api/openapi.yaml` + `packages/api-client/src/generated/api.ts`; add `pnpm openapi:check` script + CI drift-check (D-4a-08); ensure public `/v1/menu` DTO automatically carries the new fields (D-4a-09).

must_haves:
  truths:
    - '`internal-catalog.controller.ts` has new POST endpoints: `/internal/v1/catalog/modifier-groups`, `/internal/v1/catalog/modifier-options`, `/internal/v1/catalog/item-sizes`, `/internal/v1/catalog/stop-list`; new DELETE endpoint `/internal/v1/catalog/stop-list/:itemId`; refactored `/internal/v1/catalog/publish` to call `DelayedPublishService.schedule`; new DELETE `/internal/v1/catalog/publish` to call the returned `cancel()` function (operator Undo).'
    - '`error-mapping.ts` switch covers the 3 new error kinds (`MenuModifierGroupNotFoundError`, `MenuItemSizeNotFoundError`, `StopListItemNotFoundError`) with exhaustive `never`-check; each maps to `NotFoundException` with stable `code` string.'
    - '`apps/api/test/e2e/catalog.e2e.spec.ts` updated: POST payload uses `photos` array (not `imageS3Key`); GET assertion reads `photos[0].url` (presigned) rather than `imageUrl` raw key; new test cases cover BJU + source enum round-trip + modifier-group + item-size + stop-list create/list/remove.'
    - '`apps/api/test/e2e/menu-brand-response.e2e.spec.ts` updated to read `photos` array shape from `/v1/menu`.'
    - '`apps/api/test/e2e/tenant-isolation.spec.ts` extended cross-tenant matrix: adds `menu_stop_list`, `menu_item_slug_aliases`, `menu_item_sizes`, `menu_modifier_groups`, `menu_item_modifier_groups` to the isolation fixture set; each entity has a cross-tenant SELECT-should-be-empty assertion and a cross-tenant INSERT-should-error assertion.'
    - '`apps/qr-menu/src/api/types.ts` updated: `MenuItemDto` has `photos?: readonly MenuPhotoDto[]`; `imageUrl` retained as convenience projection from `photos[0].url`; `modifiers` field renamed to `modifierGroups` with typed shape; new `bju` field (or per-field BJU columns) added; new `sizes` field renamed from `variants`.'
    - '`docs/api/openapi.yaml` regenerated via `pnpm --filter @resto/api openapi:emit`; all new catalog endpoints + DTO shapes appear; committed to git.'
    - '`packages/api-client/src/generated/api.ts` regenerated from new openapi.yaml; no `imageS3Key` field remains; new types present.'
    - '`pnpm openapi:check` script added at root that runs `pnpm --filter @resto/api openapi:emit` into a temp file and diffs against the committed `docs/api/openapi.yaml`; exits non-zero if drift detected (D-4a-08); CI workflow runs `pnpm openapi:check` as a gate.'
    - 'Public `/v1/menu` DTO automatically inherits all new fields (D-4a-09 verified via e2e test reading `photos`, `sizes`, `modifierGroups`, `bju` fields).'
  artifacts:
    - path: 'apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts'
      provides: 'New POST/DELETE endpoints for modifier-groups, modifier-options, item-sizes, stop-list, delayed-publish'
      contains: 'DelayedPublishService'
    - path: 'docs/api/openapi.yaml'
      provides: 'Regenerated OpenAPI spec covering all new endpoints + DTO shapes'
      contains: 'menu_first_published'
    - path: 'packages/api-client/src/generated/api.ts'
      provides: 'Regenerated TS client from openapi.yaml'
      contains: 'photos'
    - path: '.github/workflows/ci.yml'
      provides: 'openapi:check CI gate'
      contains: 'openapi:check'
  key_links:
    - from: 'InternalCatalogController POST /publish'
      to: 'DelayedPublishService.schedule'
      via: 'service injection'
      pattern: 'DelayedPublishService'
    - from: 'docs/api/openapi.yaml'
      to: 'packages/api-client/src/generated/api.ts'
      via: 'openapi-typescript codegen'
      pattern: 'photos'
    - from: '.github/workflows/ci.yml'
      to: 'pnpm openapi:check'
      via: 'CI step'
      pattern: 'openapi:check'
---

<objective>
Land the HTTP surface, downstream consumer refactors, OpenAPI regeneration, and CI drift-check that close Phase 4a. After this plan:
- All new entities (modifier groups, modifier options, item sizes, stop-list, publish-with-undo) are reachable via the internal admin API.
- The public `/v1/menu` DTO automatically carries all new fields (D-4a-09).
- `docs/api/openapi.yaml` is the canonical contract; CI prevents drift via `pnpm openapi:check`.
- The downstream-consumer refactors flagged by Skeptic HIGH-3 land: qr-menu types, api-client generated DTO, tenant-isolation cross-tenant test net, e2e specs.

Purpose: Phase 4a's external surface (HTTP + generated client + e2e net) is final and shippable. Phase 4b can build admin UI against the stable API contracts; Phase 5 (website) and Phase 6 (qr-menu) can render `/v1/menu` with all new fields.
Output: 10 files modified; all e2e tests green; openapi.yaml + api-client regen committed; CI gate present.
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
@.planning/phases/04a-catalog-schema-api/04A-SCHEMA-MAP.md
@apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts
@apps/api/src/contexts/catalog/interfaces/http/error-mapping.ts
@apps/qr-menu/src/api/types.ts

<interfaces>
**Controller pattern** (PATTERNS.md §internal-catalog.controller.ts lines 54–63 — existing `categories` endpoint):
- `@Post('<path>')` + `@HttpCode(HttpStatus.OK)` + `@ApiBody({ type: SomeInputDto })` + `@ApiOkResponse({ type: IdResponseDto })` + `@ApiUnauthorizedResponse({ type: ProblemDetailsDto })` decorators.
- Method body: `wrap(() => this.service.execute(input))` where `wrap = wrapWith(mapCatalogError)`.
- `@Body(new RestoZodValidationPipe(InputDto)) input: InputDto` — per-parameter pipe per PROJECT.md.

**New endpoints to add:**

1. `POST /internal/v1/catalog/modifier-groups` → `UpsertModifierGroupInputDto` → `IdResponseDto`. Service: `UpsertModifierGroupService`.
2. `POST /internal/v1/catalog/modifier-options` → `UpsertModifierOptionInputDto` → `IdResponseDto`. Service: `UpsertModifierOptionService`.
3. `POST /internal/v1/catalog/item-sizes` → `UpsertItemSizeInputDto` → `IdResponseDto`. Service: `UpsertItemSizeService`.
4. `POST /internal/v1/catalog/stop-list` → `StopItemInputDto` → `IdResponseDto`. Service: `StopListService.stop`.
5. `DELETE /internal/v1/catalog/stop-list/:itemId` → no body, `@Param('itemId') itemId: string`. Service: `StopListService.unstop`. Returns 204 No Content.
6. `POST /internal/v1/catalog/publish` (refactored) → no body → returns `{ scheduled: true, cancelAfterMs: 5000 }`. Service: stores the `cancel` function in a per-process map keyed by tenantId (or relies on `DelayedPublishService.schedule` returning the cancel handle and is stateless on the controller side because the next call to `schedule` cancels any prior pending timer). Choose the stateless path — the controller simply calls `schedule(tenantId)` and discards the returned cancel handle since `schedule` already auto-cancels prior pending timers on each call.
7. `DELETE /internal/v1/catalog/publish` (NEW) → calls `DelayedPublishService` to cancel the current pending timer for the active tenant. Add a method `cancelPending(tenantId): boolean` on the service (cancels the pending timer if present; returns true if cancelled, false if no pending or already executed). Controller returns `{ cancelled: boolean }`.

The controller already has `@UseGuards(InternalTokenGuard)` at class level + `requireTenantContext()` for tenancy resolution; new endpoints inherit the same guards.

**Error mapping** (PATTERNS.md §error-mapping.ts):

- Add 3 new cases to the `switch (err.kind)` for `MenuModifierGroupNotFoundError`, `MenuItemSizeNotFoundError`, `StopListItemNotFoundError`.
- Each maps to `NotFoundException` with a stable `code` string: `catalog.modifier_group_not_found`, `catalog.item_size_not_found`, `catalog.stop_list_item_not_found`.
- Update the exhaustive `never`-check default to include the new union members (TS will fail compile if any is missing).

**Downstream consumers** (per Skeptic HIGH-3 + SCHEMA-MAP §Downstream Consumer Inventory):

1. **`apps/qr-menu/src/api/types.ts`**:
   - Existing `MenuItemDto.imageUrl: string | null` stays as backward-compat convenience.
   - ADD `photos?: readonly MenuPhotoDto[]` where `MenuPhotoDto = { s3Key: string; url: string; sortOrder: number; alt?: string; isPrimary?: boolean }`.
   - RENAME `variants?: readonly unknown[]` → `sizes?: readonly MenuItemSizeDto[]` with shape `{ id: string; name: LocalizedText; price: string; isDefault: boolean }`.
   - RENAME `modifiers?: readonly unknown[]` → `modifierGroups?: readonly MenuModifierGroupDto[]` with shape `{ id: string; name: LocalizedText; minSelectable: number; maxSelectable: number; isRequired: boolean; options: readonly MenuModifierOptionDto[] }`.
   - ADD BJU fields per CAT-02: `proteins: string | null`, `fats: string | null`, `carbs: string | null`, `kcal: number | null`, `nutritionEstimated: boolean`.
   - Stopped items should NOT appear in the response (filtered server-side per Plan 06 stop-list overlay) — no type-level marker needed.

2. **`packages/api-client/src/generated/api.ts`**:
   - Regenerated entirely from new `docs/api/openapi.yaml` via `pnpm --filter @resto/api openapi:emit` (emits openapi.yaml) then `pnpm openapi:gen` (or equivalent codegen — verify the actual codegen command by inspecting `packages/api-client/package.json`).
   - No `imageS3Key` field remains.
   - New types: `MenuItemPhotoSchema`, `UpsertModifierGroupInputDto`, `UpsertModifierOptionInputDto`, `UpsertItemSizeInputDto`, `StopItemInputDto`.

3. **`apps/api/test/e2e/catalog.e2e.spec.ts`** (verified lines 89, 116-117 reference `imageS3Key` / `imageUrl`):
   - Replace `imageS3Key: 'menu/margherita.webp'` in POST payload with `photos: [{ s3Key: 'menu/margherita.webp', sortOrder: 0, isPrimary: true }]`.
   - Update GET assertion: `menu.items[0].photos[0].url` is a presigned URL (matches `https://`); `imageUrl` is the same URL as backward-compat.
   - The existing `expect(JSON.stringify(menu)).not.toContain('imageS3Key')` (line 117) still passes (the raw key is never serialized; only presigned URLs are).
   - ADD new test cases:
     - POST modifier-group + GET via published menu confirms presence.
     - POST modifier-option referencing the group; confirm `priceDelta`, `defaultAmount`, `freeAmount` round-trip.
     - POST item-size referencing the item; confirm absolute `price` in published menu.
     - POST stop-list, GET /v1/menu confirms item is filtered out, DELETE stop-list, GET /v1/menu confirms item reappears.
     - POST publish + immediate DELETE publish: confirm no `MenuFirstPublishedV1` event was inserted to outbox (timer cancelled).
     - POST publish + wait 5s + assert outbox has `MenuFirstPublishedV1` for first publish; second publish emits `MenuRepublishedV1`.
     - PUT item with new slug: confirm a row appears in `menu_item_slug_aliases` for the old slug.

4. **`apps/api/test/e2e/menu-brand-response.e2e.spec.ts`**:
   - Update assertion to read `photos` array shape (existing reads `imageUrl` which still works as backward-compat).

5. **`apps/api/test/e2e/tenant-isolation.spec.ts`** (canonical RLS regression net per packages/db CLAUDE.md):
   - Extend the cross-tenant matrix with fixtures for `menu_stop_list`, `menu_item_slug_aliases`, `menu_item_sizes`, `menu_modifier_groups`, `menu_item_modifier_groups`.
   - For each: tenant A inserts a row; tenant B's SELECT must return zero rows; tenant B's INSERT with tenant A's parent IDs must error (composite FK rejects).

**CI drift-check (D-4a-08):**

- Add `openapi:check` script at root `package.json`:
  - `"openapi:check": "pnpm --filter @resto/api openapi:emit && diff -u docs/api/openapi.yaml.bak docs/api/openapi.yaml || (echo 'OpenAPI drift detected. Run pnpm --filter @resto/api openapi:emit and commit the result.' && exit 1)"`.
  - Better approach: `"openapi:check": "tsx tools/openapi-check.ts"` with a small script that emits to a temp path and diffs.
  - Simplest: copy committed `docs/api/openapi.yaml` to `.tmp`, run `openapi:emit`, diff, restore on cleanup. Or use `git diff --exit-code docs/api/openapi.yaml` after running emit — exits non-zero if file changed.
  - Final choice (simplest + reliable): the script runs `pnpm --filter @resto/api openapi:emit` then `git diff --exit-code docs/api/openapi.yaml`. Two lines, no temp files. The CI workflow first checks out main and runs this; if the emitted file differs from the committed file the gate fails with a clear message.
- Add a CI step in `.github/workflows/ci.yml` running `pnpm openapi:check` after install + before tests. If `ci.yml` does not exist, create one with build/lint/typecheck/test/openapi-check steps.

**Public DTO inheritance (D-4a-09)**:

- The public `/v1/menu` DTO is constructed by `get-published-menu.service.ts` from the repository's read-model. Plan 06's `loadPublishedMenu` already returns photos/sizes/modifierGroups/BJU. The OpenAPI emission (NestJS Swagger introspects the DTO classes) automatically includes these fields. No special work — verify by checking the regenerated yaml.
  </interfaces>
  </context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Wire new controller endpoints + extend error mapping</name>
  <files>apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts, apps/api/src/contexts/catalog/interfaces/http/error-mapping.ts, apps/api/src/contexts/catalog/application/delayed-publish.service.ts</files>
  <read_first>
    apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts (full file — existing categories/items/modifiers endpoints; preserve their shape)
    apps/api/src/contexts/catalog/interfaces/http/error-mapping.ts (full file — existing `mapKnown` + `mapCatalogError` exports; preserve the discriminated union exhaustive check)
    .planning/phases/04a-catalog-schema-api/04A-PATTERNS.md (§internal-catalog.controller.ts — endpoint pattern; §error-mapping.ts — switch shape)
  </read_first>
  <action>
    Edit `apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts`:

    1. Update existing `modifiers` POST endpoint to use `UpsertModifierGroupInputDto` (renamed) and inject `UpsertModifierGroupService` (renamed). Change route from `/modifiers` to `/modifier-groups` per `<interfaces>` plan. Drop the old service field; the constructor parameter list is updated.

    2. Add new endpoints per `<interfaces>` plan:
       - `POST /modifier-options` calling `UpsertModifierOptionService.execute`.
       - `POST /item-sizes` calling `UpsertItemSizeService.execute`.
       - `POST /stop-list` calling `StopListService.stop`.
       - `DELETE /stop-list/:itemId` calling `StopListService.unstop`. Use `@HttpCode(HttpStatus.NO_CONTENT)` for 204.

    3. Refactor the existing publish endpoint:
       - `POST /publish` — controller now injects `DelayedPublishService`. Handler reads `requireTenantContext()` for tenantId, calls `await this.delayed.schedule(tenantId)`, returns `{ scheduled: true, cancelAfterMs: 5000 }`. Wrap in `wrap(() => ...)`.
       - `DELETE /publish` (NEW) — calls `this.delayed.cancelPending(tenantId)` (new public method on the service — see Task 1 step 4); returns `{ cancelled: boolean }`.

    4. Add `cancelPending(tenantId: string): boolean` to `DelayedPublishService` (small extension of plan 06):
       - If `this.#pending.has(tenantId)`: clear the timer, delete the map entry, return `true`.
       - Else return `false` (no pending timer; nothing to cancel).

    5. Update constructor argument list of `InternalCatalogController` to inject all new services (`UpsertModifierGroupService`, `UpsertModifierOptionService`, `UpsertItemSizeService`, `StopListService`, `DelayedPublishService`).

    Edit `apps/api/src/contexts/catalog/interfaces/http/error-mapping.ts`:

    6. Add three new `case` branches to the `switch (err.kind)` in `mapKnown`:
       - `case 'MenuModifierGroupNotFoundError'`: return `new NotFoundException({ code: 'catalog.modifier_group_not_found', message: err.message })`.
       - `case 'MenuItemSizeNotFoundError'`: return `new NotFoundException({ code: 'catalog.item_size_not_found', message: err.message })`.
       - `case 'StopListItemNotFoundError'`: return `new NotFoundException({ code: 'catalog.stop_list_item_not_found', message: err.message })`.
       - The `default` branch's `const exhaustive: never = err` will type-check after the `CatalogDomainError` union extension from plan 05; if any case is missing TS errors.

    Run `pnpm --filter @resto/api typecheck` to verify all wiring.

  </action>
  <verify>
    <automated>grep -c "POST.*'modifier-groups'\\|@Post('modifier-groups')" apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts &amp;&amp; grep -c "@Post('stop-list')\\|@Delete('stop-list" apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts &amp;&amp; grep -c "DelayedPublishService" apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts &amp;&amp; grep -c "MenuModifierGroupNotFoundError\\|MenuItemSizeNotFoundError\\|StopListItemNotFoundError" apps/api/src/contexts/catalog/interfaces/http/error-mapping.ts &amp;&amp; pnpm --filter @resto/api typecheck</automated>
  </verify>
  <done>
    - 5+ new endpoints (POST modifier-groups, POST modifier-options, POST item-sizes, POST stop-list, DELETE stop-list/:itemId, POST publish refactored, DELETE publish new) wired with correct Zod-pipe validation + error wrapping.
    - Error mapping covers 3 new error kinds with stable `code` strings.
    - `apps/api` typecheck exits 0.
  </done>
  <acceptance_criteria>
    - `grep -c "@Post('modifier-groups')\\|@Post(\"modifier-groups\")" apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts` returns 1.
    - `grep -c "@Post('modifier-options')\\|@Post(\"modifier-options\")" apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts` returns 1.
    - `grep -c "@Post('item-sizes')\\|@Post(\"item-sizes\")" apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts` returns 1.
    - `grep -c "@Post('stop-list')\\|@Post(\"stop-list\")" apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts` returns 1.
    - `grep -c "@Delete('stop-list" apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts` returns 1.
    - `grep -c "@Delete('publish" apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts` returns 1.
    - `grep -c "DelayedPublishService" apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts` returns ≥ 2 (constructor inject + method call).
    - `grep -c "case 'MenuModifierGroupNotFoundError'\\|case 'MenuItemSizeNotFoundError'\\|case 'StopListItemNotFoundError'" apps/api/src/contexts/catalog/interfaces/http/error-mapping.ts` returns 3.
    - `grep -c "catalog.modifier_group_not_found\\|catalog.item_size_not_found\\|catalog.stop_list_item_not_found" apps/api/src/contexts/catalog/interfaces/http/error-mapping.ts` returns 3.
    - `pnpm --filter @resto/api typecheck` exits 0.
  </acceptance_criteria>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Refactor downstream consumers — qr-menu types + e2e specs + tenant-isolation matrix</name>
  <files>apps/qr-menu/src/api/types.ts, apps/api/test/e2e/catalog.e2e.spec.ts, apps/api/test/e2e/menu-brand-response.e2e.spec.ts, apps/api/test/e2e/tenant-isolation.spec.ts</files>
  <read_first>
    apps/qr-menu/src/api/types.ts (full file — current `MenuItemDto`, `MenuModifierDto`, `MenuVariantDto` shapes)
    apps/api/test/e2e/catalog.e2e.spec.ts (lines 80-130 — the POST + GET round-trip test using imageS3Key + imageUrl)
    apps/api/test/e2e/menu-brand-response.e2e.spec.ts (full file — assertion shape)
    apps/api/test/e2e/tenant-isolation.spec.ts (or packages/db/test/integration/tenant-isolation.spec.ts — per packages/db/CLAUDE.md the canonical net lives at one of these; verify path)
    .planning/phases/04a-catalog-schema-api/04A-SCHEMA-MAP.md (§Downstream Consumer Inventory — exact refactor list per file)
  </read_first>
  <action>
    Edit `apps/qr-menu/src/api/types.ts`:

    1. Keep `MenuItemDto.imageUrl: string | null` for backward-compat (it's the presigned URL of `photos[0]` per plan 06 repository).
    2. ADD `MenuPhotoDto` interface (or type alias): `{ readonly s3Key: string; readonly url: string; readonly sortOrder: number; readonly alt?: string; readonly isPrimary?: boolean }`.
    3. ADD `photos: readonly MenuPhotoDto[]` to `MenuItemDto`.
    4. ADD BJU fields to `MenuItemDto`: `proteins: string | null`, `fats: string | null`, `carbs: string | null`, `kcal: number | null`, `nutritionEstimated: boolean`.
    5. RENAME existing `variants` (or `MenuVariantDto`) → `sizes` (and `MenuItemSizeDto`) with shape `{ id: string; name: LocalizedText; price: string; isDefault: boolean }`. The `priceDelta` field is gone; `price` is absolute.
    6. RENAME existing `modifiers` (or `MenuModifierDto`) → `modifierGroups` (and `MenuModifierGroupDto`) with shape `{ id: string; name: LocalizedText; minSelectable: number; maxSelectable: number; isRequired: boolean; options: readonly MenuModifierOptionDto[] }`. Add `MenuModifierOptionDto` `{ id: string; name: LocalizedText; priceDelta: string; defaultAmount: number; freeAmount: number; sortOrder: number }`.

    Edit `apps/api/test/e2e/catalog.e2e.spec.ts`:

    7. Line 89 (POST payload): replace `imageS3Key: 'menu/margherita.webp'` with `photos: [{ s3Key: 'menu/margherita.webp', sortOrder: 0, isPrimary: true }]`.
    8. Lines 115-117 assertion block (GET /v1/menu): replace single-key `imageUrl` assertion with: confirm `menu.items[0].imageUrl` is a presigned URL (starts with `https?://`), and `menu.items[0].photos[0].url` matches the same value; the existing `not.toContain('imageS3Key')` still passes.
    9. Add the new test cases enumerated in `<interfaces>` block (Task 2 list):
       - Modifier group create + appears in `/v1/menu`.
       - Modifier option create + roundtrip with `defaultAmount`/`freeAmount`.
       - Item size create + roundtrip with absolute `price`.
       - Stop-list create → `/v1/menu` excludes item → DELETE stop-list → `/v1/menu` includes item again.
       - Publish + immediate DELETE publish within 5s → outbox has zero events for `catalog.menu_first_published`.
       - Publish + wait 5s → outbox has `MenuFirstPublishedV1`; second publish + wait → outbox has `MenuRepublishedV1`.
       - PUT item with changed slug → SELECT * FROM `menu_item_slug_aliases` returns the old slug.

    Edit `apps/api/test/e2e/menu-brand-response.e2e.spec.ts`:

    10. Update any `imageUrl` assertion to also accept the `photos[0].url` shape; OR keep `imageUrl` as backward-compat assertion target (it's still present). Confirm BJU + sizes + modifierGroups fields are exposed on the response shape.

    Edit `apps/api/test/e2e/tenant-isolation.spec.ts` (or the canonical net at `packages/db/test/integration/tenant-isolation.spec.ts` — verify which one is referenced by Phase 01 TEN-08; the planning context names `apps/api/test/e2e/tenant-isolation.spec.ts`; if the file doesn't exist there, edit the `packages/db` integration spec):

    11. Extend cross-tenant fixture set with rows for each new entity:
        - `menu_stop_list` — tenant A inserts a stop entry for a tenant A item; tenant B's SELECT returns zero rows (RLS); tenant B's INSERT with tenant A's item_id errors (composite FK rejects).
        - `menu_item_slug_aliases` — analogous: tenant A inserts; tenant B's SELECT empty; tenant B's INSERT errors.
        - `menu_item_sizes` (renamed) — same matrix.
        - `menu_modifier_groups` (renamed) — same matrix.
        - `menu_item_modifier_groups` (renamed junction) — same matrix.
    12. If the original spec hardcoded old names (`menu_variants`, `menu_modifiers`, `menu_item_modifiers`), rename those references too.

  </action>
  <verify>
    <automated>grep -c "photos:\\|MenuPhotoDto\\|MenuItemSizeDto\\|MenuModifierGroupDto" apps/qr-menu/src/api/types.ts &amp;&amp; grep -c "photos: \\[{" apps/api/test/e2e/catalog.e2e.spec.ts &amp;&amp; ! grep -q "imageS3Key:" apps/api/test/e2e/catalog.e2e.spec.ts &amp;&amp; grep -c "menu_stop_list\\|menu_item_slug_aliases\\|menu_item_sizes\\|menu_modifier_groups" apps/api/test/e2e/tenant-isolation.spec.ts packages/db/test/integration/tenant-isolation.spec.ts 2>/dev/null</automated>
  </verify>
  <done>
    - qr-menu types reflect new shape; `imageUrl` retained as backward-compat.
    - catalog e2e spec POST payload uses `photos`; all new test cases (modifier-group, modifier-option, item-size, stop-list, delayed-publish, slug-alias) present.
    - menu-brand-response spec passes with new DTO shape.
    - tenant-isolation cross-tenant matrix extended for 5 new entities.
  </done>
  <acceptance_criteria>
    - `grep -c "MenuPhotoDto\\|photos: readonly" apps/qr-menu/src/api/types.ts` returns ≥ 2.
    - `grep -c "MenuItemSizeDto" apps/qr-menu/src/api/types.ts` returns ≥ 1.
    - `grep -c "MenuModifierGroupDto" apps/qr-menu/src/api/types.ts` returns ≥ 1.
    - `grep -c "nutritionEstimated" apps/qr-menu/src/api/types.ts` returns ≥ 1.
    - `grep -c "photos: \\[" apps/api/test/e2e/catalog.e2e.spec.ts` returns ≥ 1.
    - `grep -c "imageS3Key:" apps/api/test/e2e/catalog.e2e.spec.ts` returns 0.
    - `grep -c "stop-list\\|menu_stop_list" apps/api/test/e2e/catalog.e2e.spec.ts` returns ≥ 2.
    - `grep -c "menu_first_published.v1\\|menu_republished.v1" apps/api/test/e2e/catalog.e2e.spec.ts` returns ≥ 2.
    - `grep -c "menu_item_slug_aliases" apps/api/test/e2e/catalog.e2e.spec.ts` returns ≥ 1.
    - At least one of `apps/api/test/e2e/tenant-isolation.spec.ts` OR `packages/db/test/integration/tenant-isolation.spec.ts` references all 5 new entities (`menu_stop_list`, `menu_item_slug_aliases`, `menu_item_sizes`, `menu_modifier_groups`, `menu_item_modifier_groups`).
  </acceptance_criteria>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Regen OpenAPI + api-client + add `pnpm openapi:check` + CI workflow gate</name>
  <files>docs/api/openapi.yaml, packages/api-client/src/generated/api.ts, apps/api/package.json, package.json, .github/workflows/ci.yml, tools/openapi-check.ts</files>
  <read_first>
    apps/api/package.json (current `openapi:emit` script verified at line 10)
    packages/api-client/package.json (find the codegen command that emits `src/generated/api.ts` from `docs/api/openapi.yaml` — RESEARCH.md mentions `openapi-typescript`)
    .github/workflows/ (existing CI workflow files — if any)
    .planning/phases/04a-catalog-schema-api/04a-CONTEXT.md (D-4a-08 — openapi.yaml regen + CI drift-check; D-4a-09 — public DTO inherits new fields)
    docs/api/openapi.yaml (current shape — preserve formatting conventions)
  </read_first>
  <action>
    1. Regen `docs/api/openapi.yaml`:
       - Run `pnpm --filter @resto/api openapi:emit`. The script `tsx src/openapi.ts` boots NestJS, introspects `@nestjs/swagger`, and writes `docs/api/openapi.yaml`.
       - Confirm new endpoints + DTOs appear:
         - Paths for `/internal/v1/catalog/modifier-groups`, `/modifier-options`, `/item-sizes`, `/stop-list`, `/stop-list/{itemId}` (DELETE), `/publish` (POST + DELETE).
         - Components for `UpsertModifierGroupInputDto`, `UpsertModifierOptionInputDto`, `UpsertItemSizeInputDto`, `StopItemInputDto`, `MenuItemPhotoSchema` (or whatever class NestJS Swagger emits).
         - `UpsertItemInputDto` carries `photos`, BJU fields, `source`, `needsReview`, `sourceExternalId` — D-4a-09 confirmation.
         - `UpsertCategoryInputDto` carries `parentId`.
       - Commit the regenerated file.

    2. Regen `packages/api-client/src/generated/api.ts`:
       - Identify the codegen command from `packages/api-client/package.json` (likely `"openapi:gen": "openapi-typescript ../../docs/api/openapi.yaml -o src/generated/api.ts"` or similar).
       - Run it; commit the regenerated file.
       - Verify zero `imageS3Key` occurrences; new types appear.

    3. Add `pnpm openapi:check` script — root-level:
       - Create `tools/openapi-check.ts` (small tsx script) — alternative path. Or add the script directly to root `package.json`.
       - Simplest implementation: in root `package.json` `scripts` block, add `"openapi:check": "pnpm --filter @resto/api openapi:emit && git diff --exit-code -- docs/api/openapi.yaml || (echo 'OpenAPI drift detected. Run pnpm --filter @resto/api openapi:emit and commit docs/api/openapi.yaml.' && exit 1)"`.
       - The script: runs `openapi:emit` which writes to `docs/api/openapi.yaml`; then `git diff --exit-code` exits 0 if no change, non-zero otherwise; the `||` branch surfaces a clear message.

    4. CI workflow:
       - Inspect `.github/workflows/` for existing CI files. If `ci.yml` exists, add a `pnpm openapi:check` step after install + before tests. If no CI workflow exists, create `.github/workflows/ci.yml` with these steps:
         - Checkout
         - Setup Node 22
         - Setup pnpm 9.15.0
         - `pnpm install --frozen-lockfile`
         - `pnpm --filter @resto/db typecheck`
         - `pnpm --filter @resto/api typecheck`
         - `pnpm openapi:check` (the new gate)
         - `pnpm lint`
         - `pnpm --filter @resto/db test`
         - `pnpm --filter @resto/api test`
       - Per project convention: keep CI step names consistent with any existing workflow naming (e.g. `Verify`, `Typecheck`).

    5. Confirm D-4a-09 (public `/v1/menu` DTO inherits new fields):
       - In the regenerated openapi.yaml, locate the `/v1/menu` response schema (the `PublishedMenuDto` or equivalent). Confirm it contains `photos`, `sizes` (renamed from variants), `modifierGroups`, `proteins/fats/carbs/kcal/nutritionEstimated`.
       - Add an e2e assertion in `apps/api/test/e2e/catalog.e2e.spec.ts` (already touched in Task 2) confirming the public DTO carries these fields when accessed via `GET /v1/menu` (not just the internal endpoints).

  </action>
  <verify>
    <automated>pnpm openapi:check &amp;&amp; grep -c "photos\\|nutritionEstimated\\|menuModifierGroups\\|menu_first_published" docs/api/openapi.yaml &amp;&amp; ! grep -q "imageS3Key" packages/api-client/src/generated/api.ts &amp;&amp; (test -f .github/workflows/ci.yml &amp;&amp; grep -q "openapi:check" .github/workflows/ci.yml)</automated>
  </verify>
  <done>
    - `docs/api/openapi.yaml` regenerated with all new endpoints + DTOs.
    - `packages/api-client/src/generated/api.ts` regenerated; no `imageS3Key` references.
    - `pnpm openapi:check` script exists at root and exits 0 when openapi.yaml is in sync.
    - CI workflow has the gate.
    - Public `/v1/menu` DTO shape verified to include new fields.
  </done>
  <acceptance_criteria>
    - `pnpm openapi:check` exits 0 (no drift after regen).
    - `grep -c "imageS3Key" packages/api-client/src/generated/api.ts` returns 0.
    - `grep -c "photos" packages/api-client/src/generated/api.ts` returns ≥ 1.
    - `grep -c "/v1/catalog/modifier-groups\\|/v1/catalog/item-sizes\\|/v1/catalog/stop-list" docs/api/openapi.yaml` returns ≥ 3.
    - `grep -c "nutritionEstimated\\|proteins\\|menuFirstPublishedAt" docs/api/openapi.yaml` returns ≥ 1.
    - `grep -c "\"openapi:check\"" package.json` returns 1 (script registered at root).
    - `test -f .github/workflows/ci.yml &amp;&amp; grep -c "openapi:check\\|openapi-check" .github/workflows/ci.yml` returns ≥ 1.
  </acceptance_criteria>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                                     | Description                                                                                                                |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| HTTP (internal admin) → controller           | InternalTokenGuard enforces operator-only access; per-route Zod pipe validates body                                        |
| operator (Phase 4b future) → DELETE /publish | Operator-initiated undo; no extra auth beyond the same InternalTokenGuard; rate-limited by NestJS rate-limit if configured |
| CI workflow → openapi:check                  | Build-time integrity gate; prevents docs drift                                                                             |
| e2e test fixtures → tenant isolation         | New tables must obey same cross-tenant invariants as existing ones                                                         |

## STRIDE Threat Register

| Threat ID   | Category       | Component                                            | Disposition | Mitigation Plan                                                                                                                                                                                    |
| ----------- | -------------- | ---------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-04a-07-01 | Spoofing       | Operator without context calls DELETE /publish       | mitigate    | Inherits `InternalTokenGuard` + `requireTenantContext` from controller class; `cancelPending(tenantId)` only cancels timer for the resolved tenant — cannot cancel another tenant's publish        |
| T-04a-07-02 | Tampering      | OpenAPI drift between code + docs                    | mitigate    | `pnpm openapi:check` CI gate (D-4a-08); commits with stale openapi.yaml fail CI; clear remediation message in the script                                                                           |
| T-04a-07-03 | InfoDisclosure | Tenant-isolation gap on new entities (regressed RLS) | mitigate    | `apps/api/test/e2e/tenant-isolation.spec.ts` (or `packages/db/test/integration/tenant-isolation.spec.ts`) extends cross-tenant matrix with 5 new entities; SELECT empty + INSERT errors assertions |
| T-04a-07-04 | Tampering      | qr-menu type drift causes runtime parse failure      | mitigate    | `packages/api-client` is regenerated from `docs/api/openapi.yaml`; `apps/qr-menu` consumes the generated types as TS contract; openapi:check guarantees the chain                                  |
| T-04a-07-05 | DoS            | Stop-list endpoint flood                             | mitigate    | Existing rate-limit guard at app level (PROJECT.md mentions @fastify/rate-limit); per-tenant request limits inherited; no per-endpoint override needed in 4a                                       |
| T-04a-07-06 | Tampering      | Slug alias e2e doesn't cover idempotent UPDATE       | mitigate    | Task 2 e2e adds an explicit assertion that PUT with the same slug does NOT insert a duplicate alias row (idempotency check)                                                                        |
| T-04a-07-SC | Tampering      | CI workflow missing → drift goes undetected          | mitigate    | Task 3 creates or updates `.github/workflows/ci.yml`; the gate step is `pnpm openapi:check`                                                                                                        |

</threat_model>

<verification>
- `pnpm --filter @resto/api typecheck` exits 0.
- `pnpm --filter @resto/api lint` exits 0.
- `pnpm openapi:check` exits 0 (no drift after regen + commit).
- `pnpm --filter @resto/api test` runs catalog.e2e + menu-brand-response.e2e and they pass with new shape assertions.
- Tenant-isolation cross-tenant net (the appropriate spec file) runs and passes for all 5 new entities.
- `apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts` has at least 5 new `@Post`/`@Delete` decorators per acceptance_criteria.
- `docs/api/openapi.yaml` contains all new endpoints + DTO shapes.
- `packages/api-client/src/generated/api.ts` has zero `imageS3Key` references.
- `.github/workflows/ci.yml` has the `openapi:check` step.
- Public `/v1/menu` DTO carries the new fields verified via e2e test reading the public endpoint (D-4a-09 closed).
</verification>

<success_criteria>

- CAT-02, CAT-04, CAT-05, CAT-06 reach the HTTP surface.
- D-4a-08 closed: openapi.yaml regenerated; CI drift-check active.
- D-4a-09 closed: public `/v1/menu` DTO carries all new fields automatically (verified by e2e).
- Skeptic HIGH-3 closed: all 6 downstream consumers refactored (qr-menu types, api-client, 3 e2e specs, audit projection map [plan 05]).
- Phase 4a end-to-end verification: all phase requirement IDs (CAT-02, CAT-04, CAT-05, CAT-06, CAT-09, CAT-10) covered across plans 01–07.
  </success_criteria>

<output>
Create `.planning/phases/04a-catalog-schema-api/04A-07-SUMMARY.md` when done summarizing:
- New endpoint URL list with HTTP methods + Zod DTO + service per endpoint.
- The regenerated openapi.yaml line count delta.
- Confirmation that `pnpm openapi:check` exits 0 in the repo after commit (gate works).
- The 5 entities added to tenant-isolation cross-tenant matrix + the new test count.
- A pointer to the Phase 4a CLOSURE checklist (every CAT requirement ID + every D-4a-XX decision matched to a plan).
- Final phase status: 4a complete; Phase 4b (admin UI) can run `/gsd:ui-phase 4b` then `/gsd:discuss-phase 4b` against the stable contracts.
</output>
