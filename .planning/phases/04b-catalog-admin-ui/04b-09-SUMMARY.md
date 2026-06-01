---
phase: 04b-catalog-admin-ui
plan: 09
type: execute
status: completed
requirements: [CAT-07]
---

# Plan 04b-09 — Stop-list

## Outcome

Stop-list surface at `/dashboard/menu/stop-list` (Card-style "Стоп-лист сегодня" widget + table of paused items) and the same widget mounted on the global `/dashboard` page (D-12). The reset-all action loops DELETE `/internal/v1/catalog/stop-list/:itemId` over the current list and reports partial success. The row switch reuses Plan 06's `toggleStopListAction({ next: 'published' })`, so toggling it off re-publishes the item via the existing 4a backend path.

CAT-07 ships here. D-13 (manual-only reset) honored — no scheduled job, no confirm modal. D-11 (stop-list ≠ archive) preserved by the action contract.

## Tasks shipped

| #   | Commit    | What                                                                                                                                                                                                                            |
| --- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `2abd456` | `reset-stop-list-action.ts` — GET stop-list, loop DELETE per item (best-effort), return `{ ok, resetCount, failedIds, error }`; revalidate `/dashboard/menu` (layout) + `/dashboard`                                            |
| 2   | `fc0de7b` | Stop-list RSC page + `StopListTableClient`, `TodaysWidget` Card (RSC) + `TodaysWidgetResetButton` ('use client' island), dashboard page mounts the widget, `formatDuration` added to `format-age.ts` for the >24h amber warning |

## Tests

4 new spec files in `apps/admin/test/`, 16 specs passing:

- `reset-stop-list-action.spec.ts` (4) — fetch failure short-circuits; successful loop calls DELETE for every id and revalidates dashboard + menu; partial failure reports `failedIds` without aborting; empty list returns ok with zero work
- `todays-86-widget.spec.tsx` (4) — count badge + reset button when count > 0; empty hint + no button when count == 0; success toast on full success; partial-success error toast with "X возобновлены, Y не удалось"
- `stop-list-table-client.spec.tsx` (5) — category path join; amber >24h warning rendered for stale rows; fresh rows render no warning; switch toggle-off calls `toggleStopListAction({ next: 'published' })` and toasts success; error path surfaces via showError
- `stop-list-page.spec.tsx` (3) — empty state path; widget + table mount with computed count; `/login` redirect when not operator

`pnpm --filter @resto/admin exec tsc -p tsconfig.json --noEmit` clean; `eslint --max-warnings=0` clean across all touched files.

## Deviations from PLAN.md

- **Spec paths flattened to `apps/admin/test/*.spec.ts(x)`** — same as Plan 04b-07. Plan called out colocated specs.
- **`StopListTableClient` does optimistic-hide** (`removedIds`) instead of relying solely on `revalidatePath`. Reason: the table is a client component; without the optimistic hide the user sees the row stay until the next layout revalidation round-trips. Adds zero extra api calls.
- **Reset-all flow surfaces `failedIds.length` as part of an error toast** (rather than a dedicated warning toast) because there's no neutral-tone toast variant in the existing helpers; the partial-success error fires only when at least one DELETE failed, and the wording stays calm ("X возобновлены, Y не удалось") per D-08 voice.
- **Tenant breadcrumb omitted from the stop-list page header** for consistency with Plan 04b-07 (header dropped per operator request mid-phase).
- **`TodaysWidget` is a single component file with a co-located client island** (`todays-86-reset-button-client.tsx`) rather than the inline-island variant the plan allowed. Cleaner separation of RSC + client boundaries.

## Follow-ups

- **Toast helper "warn" variant.** Today partial-success is surfaced through `showError`; a `showWarning` tone would let us distinguish "X возобновлены, Y не удалось" from outright failure. Worth lifting before MVP-1 ship.
- **Auto-resurfacing of removed rows.** The optimistic-hide is final until the user reloads. If the same item is re-paused via another tab while this tab is open, the row won't reappear without a refresh. Acceptable for MVP-1 (operator-typed concurrency is rare).
- **Reset-all rate-limiting.** Sequential loop is fine while stop-list stays small (<20 items). If we ever grow into hundreds, surface a batch DELETE endpoint upstream (4a follow-up).
