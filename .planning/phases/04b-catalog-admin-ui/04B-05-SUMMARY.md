---
phase: 04b-catalog-admin-ui
plan: 05
subsystem: ui
tags:
  [
    next.js,
    react,
    shadcn,
    radix,
    zod,
    react-hook-form,
    server-actions,
    useActionState,
    vitest,
  ]

requires:
  - phase: 04b-01
    provides: apiFetchInternal hardened (timeout + retry), shadcn form primitive
  - phase: 04b-02
    provides: GET /internal/v1/catalog/categories, PATCH /categories/:id/archive, menu_categories.status column
  - phase: 04b-04
    provides: StatusBadge component, sidebar Меню group, /dashboard/menu route-group layout with StickyPublishBar
provides:
  - Categories CRUD page at /dashboard/menu/categories (RSC + table client + Sheet form + AlertDialog)
  - CategorySelect component (depth-2 indented dropdown, parent-picker + item-picker modes)
  - Frontend Zod CategoryFormSchema + refineCategoryDepth (depth ≤ 2 enforcement, mirrors backend cap)
  - LocalizedText boundary helpers (toLocalizedText / fromLocalizedText) with pinned DEFAULT_LOCALE='ru'
  - Three server actions (upsertCategoryAction, archiveCategoryAction, reorderCategoryAction) — all revalidate /dashboard/menu layout
  - ResizeObserver polyfill in vitest setup (unblocks Radix popper tests across the suite)
affects: [04b-06, 04b-07, 04b-08]

tech-stack:
  added: []
  patterns:
    - 'Indented Select component with depth ≤ 2 disable-state (RESEARCH Pattern 5)'
    - 'Plain-string ⇄ LocalizedText boundary at the server-action layer (RESEARCH Pitfall #9)'
    - "Sort-order swap via two upsert POSTs (no batch endpoint; Plan 02 didn't add one)"
    - 'Sheet-based create/edit form (categories are simple — no auto-save, per D-4b-02 which is item-only)'
    - 'AlertDialog destructive flow with UI-SPEC §Destructive actions row-1 copy verbatim'

key-files:
  created:
    - apps/admin/lib/menu/zod-schemas.ts
    - apps/admin/lib/menu/localized.ts
    - apps/admin/components/menu/category-select.tsx
    - apps/admin/app/dashboard/(workspace)/menu/categories/page.tsx
    - apps/admin/app/dashboard/(workspace)/menu/categories/categories-table-client.tsx
    - apps/admin/app/dashboard/(workspace)/menu/categories/category-form-client.tsx
    - apps/admin/app/dashboard/(workspace)/menu/categories/upsert-category-action.ts
    - apps/admin/app/dashboard/(workspace)/menu/categories/archive-category-action.ts
    - apps/admin/app/dashboard/(workspace)/menu/categories/reorder-category-action.ts
  modified:
    - apps/admin/test/setup.ts

key-decisions:
  - "DEFAULT_LOCALE='ru' pinned in apps/admin/lib/menu/localized.ts (Open Question #1 RESOLVED)"
  - 'Depth ≤ 2 enforced two-ways: CategorySelect disable-state (UI) + refineCategoryDepth Zod refine (defence-in-depth)'
  - 'Reorder uses two sequential upsert POSTs (no batch endpoint exists in Plan 02; T-04b-05-04 accepted per <100 categories per tenant in MVP-1)'
  - "Categories list returned by GET is filtered client-side (default = exclude archived); 'Показать архив' toggle reveals them"
  - 'Plain-string `name` field in the form is lifted to LocalizedText in upsertCategoryAction (server-action boundary)'
  - 'AlertDialog body text exactly matches UI-SPEC §Destructive actions row 1: «Категория «{name}» будет скрыта. Все блюда в ней останутся в черновике. Действие можно отменить, опубликовав категорию снова.»'

patterns-established:
  - 'Pattern: client-side LocalizedText fallback chain (ru → en → first non-empty) for single-locale display'
  - 'Pattern: indented flat-list rendering (`parents.forEach(parent => children.forEach(child => row))`) for 2-level hierarchies'
  - 'Pattern: sort-order swap action — read full list, find current + neighbour in same parent scope, POST two upserts'

requirements-completed: [CAT-01]

duration: 78min
completed: 2026-05-31
---

# Phase 04b Plan 05: Categories CRUD + CategorySelect + Zod depth ≤ 2 Summary

**Categories CRUD page with indented flat-list, Sheet-based create/edit form, AlertDialog archive confirmation, up/down reorder, and a reusable indented-dropdown CategorySelect — depth ≤ 2 enforced by Zod refine + UI disable-state.**

## Performance

- **Duration:** 78 min
- **Started:** 2026-05-31T14:56:08Z
- **Completed:** 2026-05-31T16:14:23Z
- **Tasks:** 3
- **Files created:** 9 production + 8 tests + 1 modified setup file

## Accomplishments

- `/dashboard/menu/categories` page renders the parent → child indented flat-list with status badge, reorder buttons (hidden at boundaries), edit, and archive actions
- `<CategorySelect>` ships as a reusable depth-2 dropdown — parent-picker mode disables children with `(уже является подкатегорией)` muted label, item-picker mode shows all options with `↳` prefix on children
- `CategoryFormSchema` + `refineCategoryDepth` block depth-3 submissions on the server-action side; `<CategorySelect mode="parent-picker">` blocks them on the UI side
- `toLocalizedText` / `fromLocalizedText` boundary helpers cleanly bridge the plain-string UI ↔ `LocalizedText` api shape (DEFAULT_LOCALE pinned to `ru` per RESEARCH Open Question #1)
- Three server actions wire to `apiFetchInternal` and revalidate the menu layout segment so the sticky publish bar refreshes; archive AlertDialog uses verbatim UI-SPEC §Destructive actions row-1 Russian copy
- 56 new vitest specs (8 spec files) cover the Zod schemas, helpers, CategorySelect, all three server actions, the table client, and the form client

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared Zod schemas + localized boundary helpers + CategorySelect** — `fcc36e5` (feat)
2. **Task 2: Server actions — upsert / archive / reorder category** — `57c407c` (feat)
3. **Auto-fix: ResizeObserver polyfill in vitest setup** — `2546566` (test)
4. **Task 3: Categories page (RSC) + table client + form client (Sheet)** — `dd91c95` (feat)

**Plan metadata commit:** (final SUMMARY commit appended below)

## Files Created/Modified

- `apps/admin/lib/menu/zod-schemas.ts` — `CategoryFormSchema` + `refineCategoryDepth` (depth ≤ 2 client-side enforcement)
- `apps/admin/lib/menu/localized.ts` — `DEFAULT_LOCALE='ru'` + `toLocalizedText` / `fromLocalizedText` boundary helpers
- `apps/admin/components/menu/category-select.tsx` — Indented depth-2 dropdown with parent-picker / item-picker modes
- `apps/admin/app/dashboard/(workspace)/menu/categories/page.tsx` — RSC page (auth-gated, apiFetchInternal-driven list)
- `apps/admin/app/dashboard/(workspace)/menu/categories/categories-table-client.tsx` — Client island: indented table + reorder + edit + archive + Show-archived toggle
- `apps/admin/app/dashboard/(workspace)/menu/categories/category-form-client.tsx` — Sheet-based create/edit form using `useActionState`
- `apps/admin/app/dashboard/(workspace)/menu/categories/upsert-category-action.ts` — POSTs to `/internal/v1/catalog/categories` with LocalizedText lift; friendly Russian error mapping
- `apps/admin/app/dashboard/(workspace)/menu/categories/archive-category-action.ts` — PATCH `/categories/:id/archive`; revalidates menu layout
- `apps/admin/app/dashboard/(workspace)/menu/categories/reorder-category-action.ts` — Sort-order swap via two upsert POSTs (best-effort, no rollback)
- `apps/admin/test/setup.ts` — Added `ResizeObserver` polyfill so Radix popper-using tests don't pollute the suite

Plus 8 spec files in `apps/admin/test/`: `menu-zod-schemas.spec.ts`, `menu-localized.spec.ts`, `category-select.spec.tsx`, `upsert-category-action.spec.ts`, `archive-category-action.spec.ts`, `reorder-category-action.spec.ts`, `categories-table-client.spec.tsx`, `category-form-client.spec.tsx`.

## Decisions Made

- **DEFAULT_LOCALE pinned to `'ru'`** — Open Question #1 in RESEARCH was resolved in plan; constant lives in `apps/admin/lib/menu/localized.ts`. v2 multilingual editor will replace with tenant-default-locale lookup at the api boundary.
- **Depth ≤ 2 belt-and-suspenders** — UI disable-state on `CategorySelect mode="parent-picker"` is the first line of defence; `refineCategoryDepth` Zod refine catches tampered form submissions. Both required per the plan's must_haves.
- **Reorder via two sequential POSTs** — Plan 02 didn't add a batch-reorder endpoint. We swap `sortOrder` via two upserts that preserve `name` + `parentId`. Best-effort: if the second POST fails, the first is not rolled back (the row appears in the new position but its neighbour is unmoved). Acceptable per T-04b-05-04 (<100 categories per tenant in MVP-1).
- **Show-archived toggle is client-side** — Backend GET returns all statuses, default UI filter excludes `archived`. Operator clicks "Показать архив" to reveal them. Consistent with items page (Plan 06 will follow the same default).
- **Reorder buttons hidden at boundaries** — Top-row ↑ and bottom-row ↓ buttons render as null instead of disabled. UI-SPEC said hidden, not disabled.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Polyfilled `ResizeObserver` in vitest test/setup.ts**

- **Found during:** Task 3 (Categories page + table + form client tests)
- **Issue:** My table-client test mounts the Radix `<Sheet>` (`<Dialog>`) and `<AlertDialog>` primitives via `setCreateOpen(true)` / `setArchiveTarget(...)`. Their `<PopperContent>` uses `useSize` → `ResizeObserver`. JSDOM 25 does not implement `ResizeObserver` — when this test ran inside the full `vitest run` suite, an unhandled `ReferenceError: ResizeObserver is not defined` leaked into the global error state and crashed the pre-existing `app-sidebar-menu-group.spec.tsx` tests (2 specs broke, suite reported 297/299).
- **Fix:** Added a minimal no-op `ResizeObserver` stub to `apps/admin/test/setup.ts` so all tests get it for free. Mirrors the existing `matchMedia` shim already in the same file.
- **Files modified:** `apps/admin/test/setup.ts`
- **Verification:** Full `pnpm --filter @resto/admin exec vitest run` now reports 299/299 passing (47/47 spec files). Previously 297/299.
- **Committed in:** `2546566` — `test(admin): polyfill ResizeObserver in vitest setup for Radix popper`

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** Necessary to keep the suite green once new Radix-popper-using tests landed. No scope creep — purely a test-infra patch.

## Issues Encountered

- ESLint `no-confusing-void-expression` flagged 9 onClick shorthand returns (`onClick={() => setX(true)}`). Resolved via `pnpm exec eslint --fix` which auto-wrapped each in `{ ... }` blocks.
- ESLint `no-empty-function` flagged the three no-op stub methods on `ResizeObserverStub`. Replaced with shared `noop` arrow function carrying a single explanatory comment.
- Initial test failure on `screen.getByText('Напитки')` — multiple matches because parent names appear both in their own row and in each child row's "Родитель" cell. Switched the assertion to `getAllByText(...).length > 0` for the parent name, kept exact-match `getByText` for the prefixed child cells which are unique.

## User Setup Required

None — no external service configuration introduced.

## Next Phase Readiness

- `<CategorySelect mode="item-picker">` is ready for Plan 04b-07 (item editor) to drop into the Category select on the Detail tab.
- `toLocalizedText` / `fromLocalizedText` + `DEFAULT_LOCALE` ship as the common boundary for all upcoming catalog forms (items, modifier groups, sizes).
- `friendlyCatalogError` mapping is reused across the three category actions — items and modifier-group actions can extend it with their own `code` cases.
- Sticky publish bar will pick up category mutations automatically because every server action calls `revalidatePath('/dashboard/menu', 'layout')` (Pattern S8).

## Self-Check: PASSED

Verified via repo inspection at completion:

- ✓ `apps/admin/lib/menu/zod-schemas.ts` exists
- ✓ `apps/admin/lib/menu/localized.ts` exists
- ✓ `apps/admin/components/menu/category-select.tsx` exists
- ✓ `apps/admin/app/dashboard/(workspace)/menu/categories/page.tsx` exists
- ✓ `apps/admin/app/dashboard/(workspace)/menu/categories/categories-table-client.tsx` exists
- ✓ `apps/admin/app/dashboard/(workspace)/menu/categories/category-form-client.tsx` exists
- ✓ `apps/admin/app/dashboard/(workspace)/menu/categories/upsert-category-action.ts` exists
- ✓ `apps/admin/app/dashboard/(workspace)/menu/categories/archive-category-action.ts` exists
- ✓ `apps/admin/app/dashboard/(workspace)/menu/categories/reorder-category-action.ts` exists
- ✓ Commit `fcc36e5` exists (Task 1)
- ✓ Commit `57c407c` exists (Task 2)
- ✓ Commit `2546566` exists (test infra polyfill)
- ✓ Commit `dd91c95` exists (Task 3)
- ✓ `pnpm --filter @resto/admin exec vitest run` reports 299/299 passing
- ✓ `pnpm --filter @resto/admin exec tsc --noEmit` exits 0
- ✓ `pnpm --filter @resto/admin exec eslint <plan files>` exits 0

---

_Phase: 04b-catalog-admin-ui_
_Completed: 2026-05-31_
