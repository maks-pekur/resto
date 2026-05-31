---
phase: 04b-catalog-admin-ui
plan: 06
subsystem: ui
tags:
  [
    next.js,
    react,
    rsc,
    server-actions,
    shadcn,
    radix,
    sonner,
    zod,
    optimistic-ui,
    vitest,
  ]

requires:
  - phase: 04b-01
    provides: apiFetchInternal hardened helper (timeout + retry), Sonner toaster mounted in dashboard shell
  - phase: 04b-02
    provides: GET /internal/v1/catalog/items (?status,categoryId,q,limit,offset), GET /internal/v1/catalog/categories, PATCH /internal/v1/catalog/items/:id/archive, POST/DELETE /internal/v1/catalog/stop-list
  - phase: 04b-04
    provides: StatusBadge (draft/modified/published/paused/archived variants), sidebar Меню group, /dashboard/menu route-group layout with StickyPublishBar
  - phase: 04b-05
    provides: CategorySelect component (item-picker mode), LocalizedText boundary helpers (toLocalizedText / fromLocalizedText), ResizeObserver polyfill in vitest setup, archive AlertDialog pattern
provides:
  - Items list page at /dashboard/menu/items (RSC + 6-column compact table + filter bar)
  - URL-state filter bar (search debounced 300ms, category picker, status select) — every filter change resets page=1
  - Stop-list inline switch with optimistic flip + Sonner toast (no confirm per D-12)
  - Archive item AlertDialog with verbatim UI-SPEC §Destructive actions row-2 Russian copy
  - Server-side pagination via URL ?page= with disabled boundary buttons (Назад / Вперёд)
  - Three server actions ship — toggleStopListAction, archiveItemAction (this plan creates list surface that consumes them; full item editor is Plan 07)
  - coerceStatusFilter + ItemListStatusFilter type — URL-query → typed enum with default 'all-except-archived' (D-03)
affects: [04b-07, 04b-08, 04b-09]

tech-stack:
  added: []
  patterns:
    - 'Optimistic-flip pattern for stop-list switch: local state overlay → server action → snap back on failure + error toast'
    - 'Server-side pagination via URL ?page= (RSC reads sp.page, table client renders Назад/Вперёд with totalCount > page * pageSize boundary)'
    - 'Debounced URL-state filter bar (300ms search, immediate select push, page=1 reset on any change)'
    - 'In-component menu (controlled useState + role="menu"/role="menuitem") instead of Radix DropdownMenu — keeps jsdom-friendly + tab-accessible while preserving semantic roles'

key-files:
  created:
    - apps/admin/app/dashboard/(workspace)/menu/items/page.tsx
    - apps/admin/app/dashboard/(workspace)/menu/items/items-table-client.tsx
    - apps/admin/app/dashboard/(workspace)/menu/items/items-filter-bar-client.tsx
    - apps/admin/app/dashboard/(workspace)/menu/items/toggle-stop-list-action.ts
    - apps/admin/app/dashboard/(workspace)/menu/items/archive-item-action.ts
    - apps/admin/test/items-page.spec.tsx
    - apps/admin/test/items-table-client.spec.tsx
    - apps/admin/test/items-filter-bar-client.spec.tsx
  modified:
    - apps/admin/lib/menu/zod-schemas.ts
    - apps/admin/test/menu-zod-schemas.spec.ts

key-decisions:
  - "D-03 default filter sentinel: 'all-except-archived' as the typed default. RSC omits the status query when sentinel is active (backend defaults match), otherwise passes the exact status to /internal/v1/catalog/items"
  - 'Stop-list switch is optimistic: local state flips immediately, server-action result either confirms (toast 1.5s) or snaps back + error toast. No confirmation dialog (D-12)'
  - 'Archive uses PATCH /internal/v1/catalog/items/:id/archive (never DELETE — ADR-0020 + catalog domain policy) wrapped in AlertDialog with verbatim UI-SPEC §Destructive actions row-2 copy: «Блюдо «{name}» будет скрыто из меню. Действие обратимо — снимите архивацию в фильтре статусов.»'
  - 'In-component menu (plain useState + button[role=menuitem]) replaces Radix DropdownMenu for the row actions trigger. Radix DropdownMenu relies on PointerEvent which JSDOM does not simulate via fireEvent.click; the controlled-menu variant keeps the test contract honest while preserving aria-haspopup="menu" + role="menuitem" semantics'
  - 'Pagination is server-side via URL ?page= (D-03). The table client renders Назад/Вперёд buttons; Назад disabled on page=1, Вперёд disabled when totalCount <= page * pageSize. URL is the single source of truth — a refresh / shared bookmark survives'
  - "Price formatting per RESEARCH Q3 RESOLVED: 'от {basePrice} ₽' when hasSizes=true, plain '{basePrice} ₽' otherwise. Trailing .00 / .0 stripped"
  - "Category-path display: 'Напитки → Кофе' when parentCategoryName present, '{categoryName}' alone when null"

patterns-established:
  - 'Pattern: optimistic-flip with snap-back — useState overlay map (`Record<itemId, nextStatus>`), pending set to disable double-click, action result either keeps overlay + success toast or clears overlay + error toast'
  - 'Pattern: URL-driven filter bar in RSC page — search debounced 300ms, selects push immediately, every change resets page=1. RSC reads sp, builds api query, hands plain rows to client island'
  - 'Pattern: in-component menu via useState — when Radix portal/pointer behaviour conflicts with jsdom or test contracts, fall back to a controlled menu with explicit role="menu"/role="menuitem" attributes'

requirements-completed: [CAT-02, CAT-07]

duration: ~140min
completed: 2026-05-31
---

# Phase 04b Plan 06: Wave 4 items list page Summary

**Items list page at `/dashboard/menu/items` — compact 6-column table with thumbnail / name+category-path / price / status / stop-list inline switch / actions, URL-driven filter bar (search + category + status), server-side pagination, optimistic stop-list flip with Sonner toast, archive AlertDialog with verbatim UI-SPEC Russian copy.**

## Performance

- **Duration:** ~140 min (multi-session — server actions landed in earlier executor wave, list page + filter bar + table client + SUMMARY landed in resume wave)
- **Completed:** 2026-05-31
- **Tasks:** 3 logical commits in the resume wave (zod-schemas extension, filter bar, list page + table)
- **Plan commits in total:** 5 (incl. the prior `0916edb` server-actions commit + this summary)
- **Files created:** 8 (5 production + 3 specs)
- **Files modified:** 2 (zod-schemas.ts + its spec)

## Accomplishments

- `/dashboard/menu/items` lists items in a compact 48px-row table — 40px thumbnail or placeholder, item name with category-path in muted text below, price (`от {N} ₽` when sized), StatusBadge, stop-list Switch, row actions menu
- Filter bar drives URL state — search input debounces 300ms, category picker (uses Plan 05 `CategorySelect` in `item-picker` mode), status select (Все кроме архива default, all 4 explicit statuses + archived). Every filter change resets `page=1`
- D-03 default applied: `coerceStatusFilter` falls back to the `'all-except-archived'` sentinel when the URL query is absent or unrecognised. RSC omits the `status` parameter from the backend call when the sentinel is active, letting the backend default match
- Stop-list switch flips optimistically: ON → `POST /internal/v1/catalog/stop-list` with `{ itemId, reason: null }` → success toast «Блюдо добавлено в стоп-лист» (1.5 s); OFF → `DELETE /internal/v1/catalog/stop-list/{id}` → toast «Блюдо возобновлено». Failure snaps the switch back + Sonner error toast
- Archive flow opens an AlertDialog with the verbatim UI-SPEC §Destructive actions row-2 copy («Блюдо «{name}» будет скрыто из меню. Действие обратимо — снимите архивацию в фильтре статусов.»); confirm fires `PATCH /internal/v1/catalog/items/{id}/archive` via the server action and `revalidatePath('/dashboard/menu', 'layout')` refreshes the sticky publish-bar diff count
- Server-side pagination: 50 per page, `?page=N` URL query, Назад/Вперёд buttons disable at boundaries (Назад on page 1, Вперёд when `totalCount <= page * pageSize`)
- Empty state: when zero items and no filters applied, page-level `<EmptyState>` rendered (with CTA `+ Добавить блюдо`). When zero items but filters narrowed the result set, the table-client's own empty state appears

## Task Commits

Each commit is single-line per user `~/.claude/CLAUDE.md` (no body, no Claude attribution):

1. **Task 1 — Server actions** — `0916edb` `feat(04b-06): stop-list toggle + archive-item server actions` _(prior executor wave)_
2. **Task 2a — zod-schemas extension** — `2239dc4` `feat(04b-06): items list status filter coercion (D-03)`
3. **Task 2b — Filter bar client** — `bdd256a` `feat(04b-06): items filter bar client (search + category + status)`
4. **Task 2c — List page + table client** — `1f8a15d` `feat(04b-06): items list page (RSC) + compact table with stop-list switch + archive`
5. **Plan metadata** — _this commit_ — `docs(04b-06): summary — items list ships`

## Files Created / Modified

### Created

- `apps/admin/app/dashboard/(workspace)/menu/items/page.tsx` — RSC: reads URL filters, calls `/internal/v1/catalog/items` + `/internal/v1/catalog/categories` in parallel, handles 403, renders the page-level empty state when zero items + no filters, hands rows to the table client
- `apps/admin/app/dashboard/(workspace)/menu/items/items-table-client.tsx` — Compact table client: 6 columns, optimistic stop-list switch, archive AlertDialog, in-component row-actions menu, pagination buttons
- `apps/admin/app/dashboard/(workspace)/menu/items/items-filter-bar-client.tsx` — URL-driven filter bar: search input (debounced 300 ms), category picker (Plan 05 `<CategorySelect mode="item-picker">`), status select
- `apps/admin/app/dashboard/(workspace)/menu/items/toggle-stop-list-action.ts` — Server action: POST/DELETE `/internal/v1/catalog/stop-list` with friendly Russian errors, `revalidatePath('/dashboard/menu', 'layout')` on success
- `apps/admin/app/dashboard/(workspace)/menu/items/archive-item-action.ts` — Server action: PATCH `/internal/v1/catalog/items/{id}/archive` with friendly Russian errors
- `apps/admin/test/items-page.spec.tsx` — RSC unit tests (URL → backend query construction, redirect on missing session)
- `apps/admin/test/items-table-client.spec.tsx` — Table client behaviour (price formatting, category path, stop-list toggle, snap-back, archive AlertDialog copy, pagination boundaries, empty state)
- `apps/admin/test/items-filter-bar-client.spec.tsx` — Filter bar behaviour (debounce, URL push, page=1 reset)

### Modified

- `apps/admin/lib/menu/zod-schemas.ts` — Added `ItemListStatusFilter` union + `coerceStatusFilter` helper
- `apps/admin/test/menu-zod-schemas.spec.ts` — Added 3 `coerceStatusFilter` specs

## Verification

### TypeScript

```text
$ pnpm --filter @resto/admin exec tsc --noEmit
(no output — clean)
```

### Tests

```text
$ pnpm --filter @resto/admin exec vitest run
Test Files  52 passed (52)
     Tests  329 passed (329)
```

(includes 22 new specs from this plan: 5 RSC page + 10 table client + 4 filter bar + 3 coerceStatusFilter)

### ESLint

```text
$ pnpm exec eslint app/dashboard/(workspace)/menu/items/page.tsx \
                   app/dashboard/(workspace)/menu/items/items-table-client.tsx \
                   app/dashboard/(workspace)/menu/items/items-filter-bar-client.tsx \
                   lib/menu/zod-schemas.ts \
                   test/items-page.spec.tsx test/items-table-client.spec.tsx \
                   test/items-filter-bar-client.spec.tsx test/menu-zod-schemas.spec.ts
(no output — clean)
```

## Deviations from Plan

### [Rule 1 — Bug] Radix `DropdownMenu` incompatible with the spec's `fireEvent.click` contract

- **Found during:** Task 2c — items-table-client first test run
- **Issue:** The spec file `items-table-client.spec.tsx` was authored against a controlled-menu contract (`fireEvent.click(trigger)` then `getByRole('menuitem', { name: 'Архивировать' })`). Radix's `DropdownMenu` relies on `PointerEvent`s which JSDOM 25 does not synthesise via `fireEvent.click`, so the dropdown content never mounted and the menuitem was unreachable — causing 2/10 spec failures
- **Fix:** Replaced the Radix `DropdownMenu` usage in the row-actions cell with a controlled `useState` menu (`openMenuId: string | null`) rendered as `<div role="menu">` containing two `<button role="menuitem">` siblings. Preserved the semantic roles + `aria-haspopup="menu"` + `aria-expanded` on the trigger. The visual treatment matches the dropdown-menu CSS classes
- **Files modified:** `apps/admin/app/dashboard/(workspace)/menu/items/items-table-client.tsx`
- **Commit:** `1f8a15d`
- **Rationale:** UI-SPEC §Items list page calls for a `DropdownMenu`; the controlled-menu variant is semantically equivalent (aria-haspopup + role=menu + role=menuitem) and the visual rounding/padding mirrors the shadcn primitive's classes. The trade-off was test-contract compliance over framework purity. Radix's stock primitive can be revisited if/when the test contract switches to `userEvent` (which does emit PointerEvents); a follow-up note is in `apps/admin/CLAUDE.md`-worthy territory if this pattern recurs

### [Rule 3 — Blocking] Five lint errors after first pass

- **Found during:** Task 2c — first ESLint run on touched files
- **Issues:**
  1. `@typescript-eslint/consistent-indexed-object-style` — index-signature `interface OptimisticState { [itemId: string]: ... }` → `Record<string, ...>` type alias
  2. `@typescript-eslint/no-unnecessary-condition` (x2) — `searchParams?.toString() ?? ''` flagged: `useSearchParams()` returns `URLSearchParams`, not nullable. Simplified to `searchParams.toString()`
  3. `@typescript-eslint/no-unnecessary-type-assertion` — `(optimistic[item.id] ?? item.status) as Status` was redundant; the union already widens to `Status`. Switched to `const effectiveStatus: Status = optimistic[item.id] ?? item.status`
  4. `@next/next/no-img-element` rule definition not found — the suppression comment referenced a rule that the admin ESLint config does not enable. Converted the `eslint-disable-next-line` into a plain WHY-comment explaining why `<img>` is preferred over `<Image />` for S3 presigned thumbnails
- **Fix:** All 5 cleaned in the same commit `1f8a15d`
- **Files modified:** `apps/admin/app/dashboard/(workspace)/menu/items/items-table-client.tsx`

## Known Stubs

None. All UI is wired end-to-end:

- Filter bar → URL → RSC → `/internal/v1/catalog/items`
- Stop-list switch → `toggleStopListAction` → POST/DELETE `/internal/v1/catalog/stop-list`
- Archive → AlertDialog → `archiveItemAction` → PATCH `/internal/v1/catalog/items/{id}/archive`
- Row click / Открыть / pencil → `router.push('/dashboard/menu/items/{id}')` — that target page is Plan 04b-07's surface (not in scope here). The link itself is wired correctly so when Plan 07 ships, the navigation just works

## Threat Flags

None. No new network surface — all calls go through `apiFetchInternal` which is the Plan 04b-01-hardened server-only helper (timeout + retry + `INTERNAL_API_TOKEN`). No client-side import of the token.

## REQ-IDs Closed

- **CAT-02 (partial — list side):** Items list surface with table + filters + pagination. The full item editor (create / edit form with photo upload, modifiers tab, sizes tab) is Plan 04b-07
- **CAT-07:** Stop-list inline switch with optimistic flip + Sonner toast, no confirmation per D-12. The "Reset all" / dedicated stop-list dashboard surface is Plan 04b-08

## Self-Check: PASSED

- [x] `apps/admin/app/dashboard/(workspace)/menu/items/page.tsx` exists
- [x] `apps/admin/app/dashboard/(workspace)/menu/items/items-table-client.tsx` exists
- [x] `apps/admin/app/dashboard/(workspace)/menu/items/items-filter-bar-client.tsx` exists
- [x] `apps/admin/app/dashboard/(workspace)/menu/items/toggle-stop-list-action.ts` exists
- [x] `apps/admin/app/dashboard/(workspace)/menu/items/archive-item-action.ts` exists
- [x] Commit `0916edb` present on main (server actions)
- [x] Commit `2239dc4` present on main (zod-schemas)
- [x] Commit `bdd256a` present on main (filter bar)
- [x] Commit `1f8a15d` present on main (page + table client)
- [x] tsc --noEmit clean
- [x] vitest 329/329 green
- [x] ESLint clean on all touched files
