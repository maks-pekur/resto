# Deferred Items

Out-of-scope discoveries logged during execution, per the executor's scope-boundary rule
(fix only what the current task's own changes caused).

## From plan 13 (group editor rewrite)

- **`menu.modifierGroups.groupMainDescription`** (ru/en/es) still reads "Параметры группы:
  название и количество выбираемых вариантов (макс. 0 — без ограничений)." / "Group settings:
  name and how many options can be selected (max 0 = unlimited)." This describes the
  `minSelectable`/`maxSelectable` fields plan 08 removed from the contract and plan 13 removed
  from `modifier-group-form.tsx` — the copy is stale, not caused by plan 13's own edits (the
  staleness dates to plan 08's contract regeneration). `menu.modifierGroups.*` and the three
  locale JSON files are outside plan 13's `files_modified` list, and editing them here risked
  colliding with sibling wave-9 agents. Needs a follow-up copy pass to describe the new
  display/behaviour/required fields instead.


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

## Plan 15 — `stop-list-table.tsx`'s resume `Switch` sends the wrong id (pre-existing, item stop-list only)

**Found during:** 10.6-15, Task 1, while extending `resetStopList` for ingredients.

**Issue:** `menu_stop_list` (and `menu_option_stop_list`) rows have their own primary key (`id`,
`pkUuid()`) distinct from the FK to the stopped entity (`itemId`/`optionId`) —
`catalog-drizzle.repository.ts:1593` returns both on the same row (`id: s.id, itemId: s.itemId`).
The DELETE routes (`DELETE stop-list/:itemId`, `DELETE stop-list/options/:optionId`) filter by the
FK column (`removeFromStopList`/`removeOptionFromStopList` both `eq(..., input.itemId/optionId)`),
confirmed by `apps/api/test/e2e/ingredient-stop.e2e.spec.ts:224-228` (`DELETE
/v1/catalog/stop-list/options/${optionId}` — the option's own id, not the row id).

`apps/admin/src/components/menu/stop-list-table.tsx`'s resume `Switch` calls
`toggleMutation.mutate(item.id)`, i.e. it sends the stop-list ROW's own PK as the URL param, not
`item.itemId`. Every DELETE this control fires therefore filters on a column that never contains
that value, so `removeFromStopList` returns `removed: false` and `StopListService.unstop` throws
`StopListItemNotFoundError` — resuming a single item via this Switch fails with an error toast
every time, in production, today. (`resetStopList` had the identical bug — fixed in this plan's own
Task 1, in scope, since that function is on this plan's `files_modified` list.)

**Fix (not applied — `stop-list-table.tsx` is not on this plan's `files_modified` list):** one-line
change, `toggleMutation.mutate(item.id)` → `toggleMutation.mutate(item.itemId)` in
`stop-list-table.tsx`'s `onCheckedChange`.

**Recommendation:** trivial, one-line, high-severity (broken write path on a shipped screen) — good
candidate for an immediate follow-up quick-fix, does not need a full plan.
