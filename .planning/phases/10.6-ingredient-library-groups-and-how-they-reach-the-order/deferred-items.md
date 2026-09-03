# Deferred Items

Out-of-scope discoveries logged during execution, per the executor's SCOPE BOUNDARY rule
(pre-existing gaps not caused by the current task's changes are not auto-fixed).

## Plan 14 — `ItemDetailResponseDto` does not expose a dish's directly-attached ingredient ids

**Found during:** 10.6-14, Task 1 (singles chip row).

**Issue:** `apps/api/src/contexts/catalog/application/dto.ts`'s `ItemDetailResponseSchema` carries
`modifierGroupIds` (the dish's attached modifier groups) but has no equivalent field for the dish's
directly-attached single ingredients (the `menu_item_modifier_options` link table, written via
`PUT /v1/catalog/items/:id/modifier-options` / `setItemIngredients`). `GetItemService` /
`CatalogDrizzleRepository.getItemById` never join that table into the admin item-detail read model,
and there is no `GET` route for it either — only the write-side `PUT`.

**Effect on this plan's admin UI:** the singles chip row added to `item-modifier-groups-card.tsx`
writes correctly via `setItemIngredients` (verified: whole ordered array, D-04 duplicate refusal
enforced against ids reachable through the dish's assigned groups). Session-local additions/removals
render immediately. What it CANNOT do without this field: show a dish's previously-attached singles
after a page reload — the chip row starts empty every time the editor mounts, even though the
attachment is persisted correctly server-side and reaches the guest-facing order/pricing path via
`findPublishedItem`'s `extraOptionIds` (the published read model DOES do this join, confirmed at
`catalog-drizzle.repository.ts:247-291` — only the *admin draft* read model is missing it).

**Fix (not applied — out of this plan's `apps/admin`-only scope):**
1. Add `modifierOptionIds: z.array(z.string().uuid())` to `ItemDetailResponseSchema` (dto.ts).
2. Populate it in `GetItemService.execute` from the repository row.
3. Add a `menuItemModifierOptions` fetch to `CatalogDrizzleRepository.getItemById`, mirroring the
   existing `menuItemModifierGroups` fetch two lines above it.
4. Regenerate `docs/api/openapi.yaml` + `packages/api-client/src/generated/api.ts`
   (`pnpm exec nx run api:openapi:emit && pnpm exec nx run api-client:gen`).
5. In `item-modifier-groups-card.tsx`, seed `singleIds` from a new `initialIngredientIds` prop
   (mirrors the existing `initialModifierGroupIds` prop), wired from `item-editor-shell.tsx`'s
   `valuesFromItem`/prop-passing the same way `initialModifierGroupIds` already is.

**Recommendation:** small, contained, single-plan fix — a good candidate for the first plan in a
follow-up wave, or folded into plan 15's wave-10 cleanup if the reviewer prefers not to open a new
phase plan for a five-file change.
