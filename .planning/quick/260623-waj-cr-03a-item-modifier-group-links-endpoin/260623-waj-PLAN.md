---
phase: quick-260623-waj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/db/migrations/0053_grant_delete_menu_item_modifier_groups.sql
  - packages/db/migrations/meta/_journal.json
  - packages/db/sql/roles.sql
  - apps/api/src/contexts/catalog/application/dto.ts
  - apps/api/src/contexts/catalog/domain/ports.ts
  - apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts
  - apps/api/src/contexts/catalog/application/set-item-modifier-groups.service.ts
  - apps/api/src/contexts/catalog/catalog.module.ts
  - apps/api/src/contexts/catalog/interfaces/http/catalog.controller.ts
  - apps/admin/src/lib/queries/catalog.ts
  - docs/api/openapi.yaml
  - packages/api-client/src/generated/api.ts
  - apps/api/test/e2e/catalog.e2e.spec.ts
autonomous: true
requirements:
  - CR-03a

must_haves:
  truths:
    - 'An operator with menu:update can replace the full set of modifier-group links on an existing item via a single PUT request.'
    - 'GET /v1/catalog/items/:id returns modifierGroupIds equal to the set last PUT for that item.'
    - 'PUTting a subset removes the dropped link rows; PUTting an empty array clears all links.'
    - 'A modifierGroupId belonging to a different brand is rejected (no cross-brand link row is ever created).'
    - 'The admin item-modifier-groups card add/remove flow succeeds end-to-end (no more 404).'
  artifacts:
    - path: 'packages/db/migrations/0053_grant_delete_menu_item_modifier_groups.sql'
      provides: 'GRANT DELETE on menu_item_modifier_groups to resto_app (replace-links delete path)'
      contains: 'GRANT DELETE ON menu_item_modifier_groups TO resto_app'
    - path: 'apps/api/src/contexts/catalog/application/set-item-modifier-groups.service.ts'
      provides: "Application service that replaces an item's modifier-group links"
      min_lines: 15
    - path: 'apps/api/src/contexts/catalog/interfaces/http/catalog.controller.ts'
      provides: 'PUT v1/catalog/items/:id/modifier-groups route'
      contains: 'items/:id/modifier-groups'
  key_links:
    - from: 'apps/admin/src/lib/queries/catalog.ts'
      to: 'PUT /v1/catalog/items/:id/modifier-groups'
      via: 'apiFetch with method PUT'
      pattern: "items/\\$\\{itemId\\}/modifier-groups"
    - from: 'apps/api/src/contexts/catalog/interfaces/http/catalog.controller.ts'
      to: 'SetItemModifierGroupsService.execute'
      via: 'wrap(() => this.setItemModifierGroups.execute(...))'
      pattern: "setItemModifierGroups\\.execute"
    - from: 'apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts'
      to: 'menu_item_modifier_groups DELETE+INSERT'
      via: 'tx.delete(...).where(tenantId+brandId+menuItemId) then scoped.insertInto'
      pattern: 'replaceItemModifierGroups'
---

<objective>
Ship the missing operator endpoint that sets the set of modifier groups linked to an
existing menu item. Today the admin item editor's modifier-groups card calls
`upsertItemModifierGroups(brandSlug, itemId, nextIds)` which POSTs to
`/v1/catalog/items/modifier-groups` — a route that does not exist on `CatalogController`,
so every attach/detach silently 404s (phase 07.6 code-review finding CR-03a).

The fix is a dedicated **replace-links** endpoint with replace semantics: the client sends
the COMPLETE desired id-set for the item, the server deletes existing link rows for that
item and inserts the new set. Replacing requires DELETE on the `menu_item_modifier_groups`
join table; `resto_app` is NOBYPASSRLS with no DELETE privilege except the two sanctioned
grants (inbox_processed migration 0028, menu_stop_list migration 0040). This plan adds a
third sanctioned grant following the 0040 precedent exactly — `menu_item_modifier_groups`
is a pure link table whose PK `(menu_item_id, modifier_group_id)` bounds rows per item, so
DELETE here is the canonical inverse of INSERT, not a soft-delete escape.

Links are draft data (like `upsertItem`); they go live on the next publish. No menu/stop
version bump.

Purpose: close CR-03a so operators can actually compose item modifier groups in the admin.
Output: one DB grant migration + roles.sql parallel grant, a brand-scoped backend endpoint
with cross-brand validation, the repointed admin client call, regenerated OpenAPI artifacts,
and e2e coverage proving replace semantics + cross-brand rejection.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@./apps/CLAUDE.md
@./packages/CLAUDE.md
@./packages/db/CLAUDE.md

<!-- Ground truth already traced by the planner. Use these directly; no codebase exploration needed. -->

DB grant precedent (mirror EXACTLY) — packages/db/migrations/0040_catalog_phase4a_grant_delete_stop_list.sql:
`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_app') THEN IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'menu_stop_list') THEN EXECUTE 'GRANT DELETE ON menu_stop_list TO resto_app'; END IF; END IF; END $$;`

roles.sql precedent (add a parallel DO-block right after the menu_stop_list one, ~lines 67-76) — packages/db/sql/roles.sql:
`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'menu_stop_list') THEN EXECUTE 'GRANT DELETE ON menu_stop_list TO resto_app'; END IF; END $$;`

Journal — packages/db/migrations/meta/\_journal.json: last entry is idx 52, tag 0052_payments_provider_payment_id_unique, when 1782028800000. New entry: idx 53, version "7", breakpoints true, tag "0053_grant_delete_menu_item_modifier_groups", when an integer > 1782028800000 (e.g. 1782115200000).

Join table — packages/db/src/schema/menu.ts (menuItemModifierGroups): columns tenantId, brandId, menuItemId, modifierGroupId, sortOrder; PK (menuItemId, modifierGroupId); composite FKs ON DELETE cascade to items + tenants + groups, restrict to brands. Composite-FK rule already satisfied — no schema change in this plan.

DELETE precedent (the ONLY sanctioned hard DELETE pattern) — catalog-drizzle.repository.ts removeFromStopList (~720-751):

```
return this.db.withTenant(async (tx, scoped) => {
  const ctx = requireTenantContext();
  const result = await tx.delete(schema.menuStopList).where(and(
    eq(schema.menuStopList.tenantId, ctx.tenantId),
    eq(schema.menuStopList.brandId, input.brandId),
    eq(schema.menuStopList.itemId, input.itemId),
  )).returning({ id: schema.menuStopList.id });
  ...
});
```

INSERT pattern (scoped auto-injects tenant_id) — same file, e.g. upsertItemSize / upsertModifierOption use `scoped.insertInto(table, { brandId, ... })`.

Item-in-brand validation pattern — same file upsertItem (~350-358): `selectFrom(menuItems, and(eq(id, ...), eq(brandId, ...))).limit(1)`, throw MenuItemNotFoundError if absent.

Detail read — getItemById (~1032-1077) returns `modifierGroupIds: links.map((m) => m.modifierGroupId)`. ItemDetailResponse DTO already exposes `modifierGroupIds: z.array(z.string().uuid())` (dto.ts line 215).

Domain errors (reuse, do NOT add new) — domain/errors.ts: `MenuItemNotFoundError(itemId)` → 404, `MenuModifierGroupNotFoundError(groupId)` → 404. Both already in mapCatalogError's exhaustive switch (interfaces/http/error-mapping.ts) — no error-mapping change needed.

Service shape — application/upsert-item-size.service.ts: `@Injectable()`, constructor `@Inject(CATALOG_REPOSITORY) repo`, single `async execute(input)`, `const ctx = requireTenantContext(); const brandId = requireBrandContext();` then call repo. `requireBrandContext` / `requireTenantContext` import from `@resto/db`.

Controller route patterns — interfaces/http/catalog.controller.ts: `const wrap = wrapWith(mapCatalogError)`; `IdResponseDto` is a local createZodDto wrapper around `{ id }`. Mutation routes use `@Permissions({ menu: ['update'] })` + `@RequireBrand()`; id params use `@Param('id', ParseUUIDPipe)`; bodies use `@Body(new RestoZodValidationPipe(SomeDto))`. Class is `@RequiresTenantContext()`. `Put` must be added to the `@nestjs/common` import (currently imports Delete/Get/Patch/Post but not Put).

Admin client — apps/admin/src/lib/queries/catalog.ts (~252-261): `upsertItemModifierGroups(brandSlug, itemId, modifierGroupIds)` currently POSTs to `/v1/catalog/items/modifier-groups` with body `{ itemId, modifierGroupIds }`. Consumer apps/admin/src/components/menu/item-modifier-groups-card.tsx sends the full desired id-set on each add/remove (replace semantics) and only for existing items (`isNewItem` guard, itemId !== 'new'). apiFetch (apps/admin/src/lib/api-client.ts) supports `method: 'PUT'`, returns `{ status, ok, data }`, sends `x-brand-slug` from `brandSlug`.

OpenAPI drift gate IS enforced — root `pnpm openapi:check` (tools/openapi-check.ts) + CI `.github/workflows/ci.yml` job `openapi-drift`. It runs `api:openapi:emit` (writes docs/api/openapi.yaml) + `api-client:gen` (writes packages/api-client/src/generated/api.ts) and fails if the working tree differs from committed artifacts. The new route MUST be regenerated and committed (Task 4). Do NOT hand-edit the generated files.

e2e harness — apps/api/test/e2e/with-real-stack.setup.ts: `startPostgres` runs `migrate(...)` over packages/db/migrations THEN `provisionAppRole` (executes sql/roles.sql). So the new migration AND the roles.sql grant both apply to the test DB automatically — NO manual `pnpm db:migrate` needed for e2e. catalog.e2e.spec.ts has `setupAuthedTenant` → `{ id, slug, brandSlug, authed: { cookie, 'x-tenant-id', 'x-brand-slug' } }`, with two tenants `cafeA` / `cafeB` for cross-tenant/brand tests; modifier groups created via `POST /v1/catalog/modifier-groups`, items via `POST /v1/catalog/items` (needs a category first via `POST /v1/catalog/categories`), authed item read via `GET /v1/catalog/items/:id`.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Grant DELETE on menu_item_modifier_groups (migration + journal + roles.sql)</name>
  <files>packages/db/migrations/0053_grant_delete_menu_item_modifier_groups.sql, packages/db/migrations/meta/_journal.json, packages/db/sql/roles.sql</files>
  <action>
    Create migration `0053_grant_delete_menu_item_modifier_groups.sql` mirroring 0040 EXACTLY: a single `DO $$ ... $$;` block guarding `IF EXISTS (resto_app role)` then `IF EXISTS (table menu_item_modifier_groups)` then `EXECUTE 'GRANT DELETE ON menu_item_modifier_groups TO resto_app'`. Keep a short WHY-comment (≤ the apps/db comment bar): this is a pure link table whose PK (menu_item_id, modifier_group_id) bounds rows per item, so DELETE is the canonical inverse of the link INSERT — same justification 0040 documents for stop-list. NO drizzle snapshot file is needed (GRANT-only migrations like 0040 ship none).

    Append a journal entry to the `entries` array in `packages/db/migrations/meta/_journal.json`: `{ "idx": 53, "version": "7", "when": 1782115200000, "tag": "0053_grant_delete_menu_item_modifier_groups", "breakpoints": true }` (when must be an integer strictly greater than 1782028800000). Keep valid JSON.

    In `packages/db/sql/roles.sql`, add a parallel DO-block immediately after the existing menu_stop_list grant block (~line 76): `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'menu_item_modifier_groups') THEN EXECUTE 'GRANT DELETE ON menu_item_modifier_groups TO resto_app'; END IF; END $$;` with a one-line WHY-comment noting migration 0053 issues the same grant and roles.sql restates it so reset+migrate converges regardless of order.

  </action>
  <verify>
    <automated>node -e "const j=require('/Users/mp_dev/projects/RestOS/packages/db/migrations/meta/_journal.json'); const e=j.entries.find(x=>x.idx===53); if(!e||e.tag!=='0053_grant_delete_menu_item_modifier_groups'||e.when<=1782028800000) {console.error('journal bad');process.exit(1);} console.log('journal ok')" && grep -q "GRANT DELETE ON menu_item_modifier_groups TO resto_app" /Users/mp_dev/projects/RestOS/packages/db/migrations/0053_grant_delete_menu_item_modifier_groups.sql && grep -v '^--' /Users/mp_dev/projects/RestOS/packages/db/sql/roles.sql | grep -c "GRANT DELETE ON menu_item_modifier_groups TO resto_app" | grep -qxv 0</automated>
  </verify>
  <done>Migration 0053 exists with the guarded GRANT, journal has idx 53 with a strictly-larger `when`, and roles.sql restates the grant in a parallel DO-block.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Backend — DTO, repo replaceItemModifierGroups, service, route, module wiring</name>
  <files>apps/api/src/contexts/catalog/application/dto.ts, apps/api/src/contexts/catalog/domain/ports.ts, apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts, apps/api/src/contexts/catalog/application/set-item-modifier-groups.service.ts, apps/api/src/contexts/catalog/catalog.module.ts, apps/api/src/contexts/catalog/interfaces/http/catalog.controller.ts</files>
  <behavior>
    - PUT /v1/catalog/items/:id/modifier-groups with `{ modifierGroupIds: [g1, g2] }` for an item in the bound brand returns 200 `{ id }`; a later GET /v1/catalog/items/:id returns modifierGroupIds == [g1, g2] (order = array index, via sortOrder).
    - PUT with a subset [g1] removes g2's link row; a later GET returns [g1].
    - PUT with [] clears all links; GET returns [].
    - PUT referencing an item id not in the bound brand → 404 (MenuItemNotFoundError).
    - PUT including a modifierGroupId from a different brand (or non-existent) → 404 (MenuModifierGroupNotFoundError); NO link rows are written for any id in the request (whole request rejected before any insert).
    - Delete predicate carries tenant_id + brand_id + menu_item_id (RLS + ScopedTx contract); inserts carry brandId explicitly and ScopedTx auto-injects tenant_id.
  </behavior>
  <action>
    dto.ts: add `SetItemModifierGroupsInputSchema = z.object({ modifierGroupIds: z.array(z.string().uuid()).max(50) })`, plus its `export type` and `export class SetItemModifierGroupsInputDto extends createZodDto(...)` mirroring UpsertItemSizeInputDto style. The item id comes from the URL param, NOT the body — do not add itemId to the schema.

    domain/ports.ts: add to the `CatalogRepository` interface: `replaceItemModifierGroups(input: { itemId: string; brandId: string; modifierGroupIds: readonly string[] }): Promise<{ id: string }>;` (return the itemId so the controller can echo IdResponse).

    catalog-drizzle.repository.ts: implement `replaceItemModifierGroups` inside `this.db.withTenant(async (tx, scoped) => { ... })`:
      1. Validate item-in-brand: `scoped.selectFrom(schema.menuItems, and(eq(schema.menuItems.id, input.itemId), eq(schema.menuItems.brandId, input.brandId))).limit(1)`; if absent throw `new MenuItemNotFoundError(input.itemId)`.
      2. Dedupe requested ids. If non-empty, validate ALL groups-in-brand: `scoped.selectFrom(schema.menuModifierGroups, and(inArray(schema.menuModifierGroups.id, dedupedIds), eq(schema.menuModifierGroups.brandId, input.brandId)))`; build a Set of found ids; if any requested id is not found, throw `new MenuModifierGroupNotFoundError(<first missing id>)`. Reject the WHOLE request before any write (cross-brand or missing group must not produce a partial link set).
      3. DELETE existing links for the item, mirroring removeFromStopList: `const ctx = requireTenantContext(); await tx.delete(schema.menuItemModifierGroups).where(and(eq(schema.menuItemModifierGroups.tenantId, ctx.tenantId), eq(schema.menuItemModifierGroups.brandId, input.brandId), eq(schema.menuItemModifierGroups.menuItemId, input.itemId)))`. Add a one-line WHY-comment noting migration 0053 grants this DELETE and the PK bounds rows per item.
      4. INSERT the new set with `sortOrder = array index`: for each id at index i, `scoped.insertInto(schema.menuItemModifierGroups, { brandId: input.brandId, menuItemId: input.itemId, modifierGroupId: id, sortOrder: i })`. Use a mapped values array in one insert if the scoped helper supports batch values; otherwise a sequential loop. Skip insert when the deduped array is empty.
      5. Return `{ id: input.itemId }`.
    Reuse existing imports (`and`, `eq`, `inArray`, `requireTenantContext`, `schema`); add `MenuModifierGroupNotFoundError` to the existing errors import block if not already present.

    set-item-modifier-groups.service.ts: new `@Injectable() SetItemModifierGroupsService` mirroring UpsertItemSizeService — constructor `@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository`; `async execute(input: { itemId: string; modifierGroupIds: readonly string[] }): Promise<{ id: string }>` does `requireTenantContext()` (active-tenant parity) + `const brandId = requireBrandContext()` then `return this.repo.replaceItemModifierGroups({ itemId: input.itemId, brandId, modifierGroupIds: input.modifierGroupIds })`.

    catalog.module.ts: import and add `SetItemModifierGroupsService` to the `providers` array (next to UpsertItemSizeService).

    catalog.controller.ts: add `Put` to the `@nestjs/common` import; import `SetItemModifierGroupsInputDto` from `../../application/dto` and `SetItemModifierGroupsService` from `../../application/set-item-modifier-groups.service`; inject the service in the constructor; add the route:
      `@Put('items/:id/modifier-groups')` `@HttpCode(HttpStatus.OK)` `@Permissions({ menu: ['update'] })` `@RequireBrand()` `@ApiBody({ type: SetItemModifierGroupsInputDto })` `@ApiOkResponse({ type: IdResponseDto })` `@ApiForbiddenResponse({ type: ProblemDetailsDto })` — handler signature `(@Param('id', ParseUUIDPipe) id: string, @Body(new RestoZodValidationPipe(SetItemModifierGroupsInputDto)) input: SetItemModifierGroupsInputDto): Promise<IdResponseDto>` returning `wrap(() => this.setItemModifierGroups.execute({ itemId: id, modifierGroupIds: input.modifierGroupIds }))`.
    No new domain error and no change to error-mapping.ts.

  </action>
  <verify>
    <automated>cd /Users/mp_dev/projects/RestOS && pnpm exec nx run api:typecheck && pnpm exec nx run api:lint --files apps/api/src/contexts/catalog/interfaces/http/catalog.controller.ts apps/api/src/contexts/catalog/application/set-item-modifier-groups.service.ts apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts apps/api/src/contexts/catalog/application/dto.ts apps/api/src/contexts/catalog/domain/ports.ts apps/api/src/contexts/catalog/catalog.module.ts</automated>
  </verify>
  <done>api typecheck passes; lint clean on changed files; PUT items/:id/modifier-groups route present with menu:update + RequireBrand; repo method validates item-in-brand + all-groups-in-brand then delete+insert with sortOrder = index; service + provider wired.</done>
</task>

<task type="auto">
  <name>Task 3: Repoint admin client to PUT items/:id/modifier-groups</name>
  <files>apps/admin/src/lib/queries/catalog.ts</files>
  <action>
    Change `upsertItemModifierGroups(brandSlug, itemId, modifierGroupIds)` to call `apiFetch(\`/v1/catalog/items/${itemId}/modifier-groups\`, { method: 'PUT', body: { modifierGroupIds }, brandSlug })`. Keep the function name and signature unchanged so the consumer (item-modifier-groups-card.tsx) and its `assignMutation` keep working; keep the apiFetch return shape `{ status, ok, data }` (the card only checks success / catches throws). Drop `itemId` from the body — it now lives in the path.
  </action>
  <verify>
    <automated>cd /Users/mp_dev/projects/RestOS && grep -q 'items/${itemId}/modifier-groups' apps/admin/src/lib/queries/catalog.ts && grep -A6 'export const upsertItemModifierGroups' apps/admin/src/lib/queries/catalog.ts | grep -q "method: 'PUT'" && pnpm exec nx run admin:typecheck</automated>
  </verify>
  <done>upsertItemModifierGroups PUTs to /v1/catalog/items/${itemId}/modifier-groups with body { modifierGroupIds }; admin typecheck passes.</done>
</task>

<task type="auto">
  <name>Task 4: Regenerate + commit OpenAPI drift artifacts</name>
  <files>docs/api/openapi.yaml, packages/api-client/src/generated/api.ts</files>
  <action>
    The new PUT route changes the OpenAPI surface, and CI's `openapi-drift` job will fail unless the generated artifacts are regenerated and committed. From the repo root run `pnpm openapi:check` (tools/openapi-check.ts) — it regenerates `docs/api/openapi.yaml` via `api:openapi:emit` and `packages/api-client/src/generated/api.ts` via `api-client:gen`, then diffs against the working tree. On the first run it will report drift and update the two files; stage them. Run `pnpm openapi:check` again to confirm it now exits 0 (no drift). Do NOT hand-edit either generated file. (If a transient env-var error occurs, the tool already injects EMIT_ENV placeholders — re-run; do not invent env values.)
  </action>
  <verify>
    <automated>cd /Users/mp_dev/projects/RestOS && pnpm openapi:check && grep -q "items/{id}/modifier-groups" docs/api/openapi.yaml</automated>
  </verify>
  <done>`pnpm openapi:check` exits 0 (no drift); docs/api/openapi.yaml and packages/api-client/src/generated/api.ts include the new PUT items/{id}/modifier-groups path.</done>
</task>

<task type="auto">
  <name>Task 5: e2e — replace semantics, empty clear, cross-brand rejection</name>
  <files>apps/api/test/e2e/catalog.e2e.spec.ts</files>
  <action>
    Extend the existing `suite` in apps/api/test/e2e/catalog.e2e.spec.ts (reuse cafeA / cafeB and the existing helpers; do not stand up a new stack). Add one `it(...)` block with timeout 60_000 that, using `cafeA.authed`:
      1. Creates a category (`POST /v1/catalog/categories`) and an item in it (`POST /v1/catalog/items`); capture itemId.
      2. Creates two modifier groups in cafeA (`POST /v1/catalog/modifier-groups`); capture g1, g2.
      3. `PUT /v1/catalog/items/${itemId}/modifier-groups` with `{ modifierGroupIds: [g1, g2] }` → expect 200. `GET /v1/catalog/items/${itemId}` (cafeA.authed) → expect `modifierGroupIds` to equal `[g1, g2]` (order-sensitive).
      4. PUT subset `{ modifierGroupIds: [g1] }` → 200; GET → modifierGroupIds == [g1] (g2 link removed — proves DELETE grant works).
      5. PUT empty `{ modifierGroupIds: [] }` → 200; GET → modifierGroupIds == [].
      6. Cross-brand: create a modifier group in cafeB (`POST /v1/catalog/modifier-groups` with cafeB.authed); capture gB. PUT `{ modifierGroupIds: [gB] }` to the cafeA item with cafeA.authed → expect statusCode 404 (MenuModifierGroupNotFoundError). Then GET the cafeA item → modifierGroupIds still == [] (no cross-brand link was created).
    Use `app.inject` exactly like the surrounding tests; assert via `res.json()`. No comments in the test body (describe/it names document intent per apps/CLAUDE.md). The new migration + roles.sql grant apply to the test DB automatically (harness runs migrate then provisionAppRole) — do NOT add a db:migrate step.
  </action>
  <verify>
    <automated>cd /Users/mp_dev/projects/RestOS && pnpm exec nx run api:e2e --testPathPattern catalog.e2e</automated>
  </verify>
  <done>The catalog e2e suite passes including the new modifier-group replace test: set, subset-remove, empty-clear, and cross-brand 404 with no orphan link.</done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                                     | Description                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| admin client → /v1/catalog (operator)        | Authenticated operator input crosses into a tenant- + brand-scoped mutation. |
| operator request → menu_item_modifier_groups | Link rows must never cross tenant or brand boundaries.                       |

## STRIDE Threat Register

| Threat ID | Category                           | Component                             | Disposition | Mitigation Plan                                                                                                                                                                                                                          |
| --------- | ---------------------------------- | ------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-waj-01  | Tampering / Information Disclosure | replaceItemModifierGroups repo method | mitigate    | Validate item belongs to bound brand (eq(id)+eq(brandId)) and EVERY incoming modifierGroupId belongs to the same brand before any write; reject whole request (404) on any miss — prevents cross-brand link injection (Task 2 behavior). |
| T-waj-02  | Elevation of Privilege             | DELETE on menu_item_modifier_groups   | mitigate    | DELETE predicate carries tenant_id + brand_id + menu_item_id (ScopedTx + RLS double-fence, ADR-0020 I-1); grant is narrow (DELETE on one link table only), guarded DO-block, restated in roles.sql for convergence.                      |
| T-waj-03  | Denial of Service                  | modifierGroupIds array size           | mitigate    | `z.array(...).max(50)` caps the per-request id set at the HTTP boundary (Task 2 DTO).                                                                                                                                                    |
| T-waj-04  | Spoofing / EoP                     | PUT route authorization               | mitigate    | `@Permissions({ menu: ['update'] })` + `@RequireBrand()` + class-level `@RequiresTenantContext()` — same gate as every other catalog mutation.                                                                                           |
| T-waj-SC  | Tampering                          | npm/pip/cargo installs                | accept      | No new dependencies added by this plan; nothing to audit.                                                                                                                                                                                |

</threat_model>

<verification>
- Migration 0053 + roles.sql both grant DELETE on menu_item_modifier_groups; journal idx 53 with a strictly-larger `when`.
- `pnpm exec nx run api:typecheck` and `admin:typecheck` pass; lint clean on changed files.
- `pnpm openapi:check` exits 0 (drift artifacts regenerated + committed); new PUT path present.
- `pnpm exec nx run api:e2e --testPathPattern catalog.e2e` passes including the new replace + cross-brand test.
- ERASE note (verify, not a task): `menu_item_modifier_groups` already has ON DELETE cascade composite FKs to `menu_items` and `tenants`, so tenancy erasure needs no new explicit handling — confirm no change to the erase function is required.
- Do NOT touch CR-04 publish cycle, WR-02 autosave, or WR-04 timingSafeEqualString.
</verification>

<success_criteria>

- Operator can attach/detach modifier groups on an existing item in the admin without a 404 (CR-03a closed).
- Replace semantics hold: GET item reflects exactly the last PUT set; subset removes dropped rows; empty clears all.
- Cross-brand modifierGroupId is rejected with 404 and creates no link row.
- CI `openapi-drift` and `e2e` jobs would pass (verified locally via the same commands).
- Commits follow project conventions: conventional single-line subjects, NO Claude attribution / Co-Authored-By footer (e.g. `feat(db): grant DELETE on menu_item_modifier_groups`, `feat(api): add item modifier-group links endpoint`, `feat(admin): repoint item modifier-group links to PUT`, `test(api): cover item modifier-group link replace + cross-brand`).
  </success_criteria>

<output>
Create `.planning/quick/260623-waj-cr-03a-item-modifier-group-links-endpoin/260623-waj-SUMMARY.md` when done.
</output>
