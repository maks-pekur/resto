---
phase: 04b-catalog-admin-ui
plan: 08
type: execute
status: completed
requirements: [CAT-04]
---

# Plan 04b-08 — Modifier groups + item assignment

## Outcome

Two-surface modifier model (D-4b-05) shipped: a top-level CRUD page (`/dashboard/menu/modifier-groups`) with group editor (`/[id]` — RHF auto-save on Основное Card + per-row blur save on Варианты Card), and a Модификаторы tab in the item editor that uses chips + a right-side Sheet for searchable add + a quick-create Dialog that redirects to the new group editor.

CAT-04 ships here. The Plan 07 placeholder for the Модификаторы tab is now backed by the real implementation, with `availableModifierGroups` plumbed through `[id]/page.tsx` → `ItemEditorShellClient` → `ItemModifiersTabClient`.

## Tasks shipped

| #   | Commit    | What                                                                                                                                                                                                        |
| --- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `1200e33` | `ModifierGroupFormSchema` + `ModifierOptionFormSchema`; `upsertModifierGroupAction`, `upsertModifierOptionAction`, `upsertItemModifierGroupsAction` (GET item → merge `modifierGroupIds` → POST full item)  |
| 2   | `6656f76` | Modifier groups list RSC + `ModifierGroupsTableClient`. Empty state + +Создать группу button; row click → editor; archive omitted (backend deferred)                                                        |
| 3   | `e2fc4d8` | Group editor RSC + `GroupEditorShellClient` (two-card layout) + `ModifierGroupFormClient` (RHF + autosave + URL flip) + `ModifierOptionsListClient` (inline rows, per-row blur save, По ум./Бесп. tooltips) |
| 4   | `ad9f981` | `ItemModifiersTabClient` — chips + right-side Sheet + quick-create Dialog; RSC + shell threaded with `availableModifierGroups`                                                                              |

## Tests

7 new spec files in `apps/admin/test/`, 34 new specs passing (+ 4 updated in `items-id-page.spec.tsx` for the third parallel fetch):

- `upsert-modifier-group-action.spec.ts` (6) — payload shape, `groupId` routing, refine on min > max, validation gate, revalidate, error path
- `upsert-modifier-option-action.spec.ts` (5) — payload shape, optionId routing, `toFixed(2)` priceDelta, revalidate, error path
- `upsert-item-modifier-groups-action.spec.ts` (4) — GET-then-POST flow, full body merge with replaced `modifierGroupIds`, revalidate, both failure modes
- `modifier-groups-page.spec.tsx` (3) — empty state, populated table, login redirect
- `modifier-groups-table-client.spec.tsx` (4) — link wiring, min/max formatting, unlimited ∞ glyph, option/usage counts
- `modifier-group-page.spec.tsx` (4) — `new` short-circuit, prefilled load, 404 EmptyState, login redirect
- `modifier-group-form-client.spec.tsx` (3) — prefill, debounced auto-save, URL flip on first save
- `modifier-options-list-client.spec.tsx` (5) — empty state, save-group-first hint, add row, blur persist, hydrate from props
- `item-modifiers-tab-client.spec.tsx` (7) — new-item hint, chip render, remove → persist trim, Sheet open, Sheet add → persist, quick-create Dialog open, navigate after quick-create

`pnpm --filter @resto/admin exec tsc -p tsconfig.json --noEmit` clean; `eslint --max-warnings=0` clean across all touched files.

## Deviations from PLAN.md

- **Spec paths flattened to `apps/admin/test/*.spec.ts(x)`** — same convention as Plans 04b-07 / 04b-09.
- **Modifier-options × remove omitted.** Backend `internal-catalog.controller.ts` exposes only POST for `/modifier-options`; no DELETE. The plan called this out as an "if absent" branch — confirmed absent and the × column dropped from the options row layout. Documented; coarse remove is via group archive (also deferred — see below).
- **Modifier-group archive omitted.** No `@Patch('modifier-groups/:id/archive')` in 4a-07. The list page's DropdownMenu has Открыть only.
- **`isRequired` not surfaced.** The backend list response includes `isRequired: boolean`, but UI-SPEC §Modifier groups list page doesn't call for a column. Out of scope; the field stays in the GET response and can be wired in a follow-up.
- **`StopList`-style optimistic-hide not applied to chip removal.** Chip removal does a full upsert; if it fails, the chip flickers back. Acceptable because the optimistic remove + rollback is already implemented.
- **Quick-create Dialog navigates to the new editor immediately,** even if `availableModifierGroups` wasn't refetched. The Sheet's local `knownGroups` is also updated so a subsequent reopen of the Sheet (after the redirect bounces back) doesn't lose the just-created group. Pre-existing items list will pick up the new group on the next layout revalidation (`revalidatePath` fires from `upsertModifierGroupAction`).
- **RSC page now does three parallel fetches** (item + categories + modifier-groups). Acceptable — modifier-groups is a small list.

## Follow-ups

- **Modifier-group archive endpoint.** When the backend exposes `PATCH /internal/v1/catalog/modifier-groups/:id/archive`, wire the DropdownMenu Archive action + the row optimistic-hide pattern from items table.
- **Modifier-option DELETE endpoint.** Once backend exposes it, drop a × column into `ModifierOptionsListClient` (already mirrors sizes tab pattern).
- **`isRequired` toggle in group form.** Backend already carries it; add a Switch in the Основное Card after we have a UI-SPEC update.
- **DialogDescription added to the quick-create dialog** to silence radix a11y warning; copy is functional but not finalized.
- **Sheet groups list is loaded once at RSC render** and not auto-refreshed when a quick-create succeeds. The newly-created group is appended client-side; if the operator then performs other operations and reopens the Sheet, the list is in sync. Acceptable for MVP-1.
