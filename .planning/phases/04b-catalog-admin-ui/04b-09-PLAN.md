---
phase: 04b-catalog-admin-ui
plan: 09
type: execute
wave: 5
depends_on: ['04b-01', '04b-02', '04b-04', '04b-06']
files_modified:
  - apps/admin/app/dashboard/(workspace)/menu/stop-list/page.tsx
  - apps/admin/app/dashboard/(workspace)/menu/stop-list/stop-list-table-client.tsx
  - apps/admin/app/dashboard/(workspace)/menu/stop-list/reset-stop-list-action.ts
  - apps/admin/components/menu/todays-86-widget.tsx
  - apps/admin/app/dashboard/(workspace)/page.tsx
autonomous: false
requirements: [CAT-07]
must_haves:
  truths:
    - 'Stop-list page lives at /dashboard/menu/stop-list with two sections: Сегодня (count widget + Сбросить всё) + table of paused items (UI-SPEC §Stop-list page)'
    - "'Today's 86' dashboard widget mounted on /dashboard renders count of currently-paused items + Сбросить всё button (D-12)"
    - 'Reset all is manual only — no confirm modal; button variant outline (recovery, not destructive) per UI-SPEC §Destructive actions row 4 + D-13'
    - 'Reset all loops DELETE /internal/v1/catalog/stop-list/:itemId for each paused item (current 4a backend has no batch reset endpoint; loop client-side via server action)'
    - 'Stop-list table reuses stop-list switch from Plan 06 items-table; toggle off re-publishes item'
    - "Stale warning '>24h': below the Стоп badge on each row, inline text-amber 'Остановлено Xч' when stoppedAt > 24h ago (D-13, UI-SPEC §Stop-list page)"
    - 'Empty state: Стоп-лист пуст / Все позиции в меню сейчас доступны для заказа. (UI-SPEC §Empty states)'
    - 'All catalog mutations go through apiFetchInternal (server-only, holds INTERNAL_API_TOKEN); never expose this in a client component'
    - 'Every server action revalidates /dashboard/menu layout to refresh the sticky publish bar diff'
    - 'Russian copy is canonical for all user-facing strings (D-05 single-locale MVP-1)'
    - 'Stop-list reset is manual only — no auto-reset cron (D-13)'
    - "D-11: Stop-list ≠ Archive — stop-list toggle publishes immediately (runtime state, no draft/publish dance), unlike archive which sets status='archived' in draft and requires Publish"
  artifacts:
    - path: 'apps/admin/app/dashboard/(workspace)/menu/stop-list/page.tsx'
      provides: 'Stop-list RSC page'
      contains: '/internal/v1/catalog/stop-list'
    - path: 'apps/admin/app/dashboard/(workspace)/menu/stop-list/reset-stop-list-action.ts'
      provides: 'Reset-all server action'
      contains: 'use server'
    - path: 'apps/admin/components/menu/todays-86-widget.tsx'
      provides: 'Dashboard widget shown on /dashboard'
      contains: 'Стоп-лист сегодня'
  key_links:
    - from: 'stop-list/page.tsx'
      to: 'apiFetchInternal'
      via: 'GET /internal/v1/catalog/stop-list'
      pattern: '/internal/v1/catalog/stop-list'
    - from: 'reset-stop-list-action.ts'
      to: 'apiFetchInternal'
      via: 'DELETE /internal/v1/catalog/stop-list/:itemId (looped)'
      pattern: "method: 'DELETE'"
    - from: 'apps/admin/app/dashboard/(workspace)/page.tsx'
      to: 'todays-86-widget.tsx'
      via: 'Server component import'
      pattern: 'TodaysWidget'
---

<objective>
Wave 5 frontend: dedicated `/dashboard/menu/stop-list` page (CAT-07 surface) + "Today's 86" dashboard widget per D-12. Both consume `GET /internal/v1/catalog/stop-list` from Plan 02. Reset-all is manual-only per D-13.

Output: Stop-list RSC + table client + reset-all server action + dashboard widget + dashboard page integration.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/04b-catalog-admin-ui/04b-CONTEXT.md
@.planning/phases/04b-catalog-admin-ui/04B-RESEARCH.md
@.planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md
@.planning/phases/04b-catalog-admin-ui/04B-UI-SPEC.md
@apps/CLAUDE.md
@CLAUDE.md

<interfaces>
<!-- Backend Plan 02 live: -->

GET /internal/v1/catalog/stop-list → StopListResponseDto:

```typescript
type StopListItem = {
  id: string; // item id
  name: Record<string, string>;
  categoryName: Record<string, string>;
  parentCategoryName: Record<string, string> | null;
  photoUrl: string | null;
  stoppedAt: string; // ISO timestamp
};
type StopListResponse = StopListItem[];
```

DELETE /internal/v1/catalog/stop-list/:itemId — returns 204 (4a-07 endpoint).

Stale warning rule (D-13 + UI-SPEC §Stop-list page): if `Date.now() - new Date(stoppedAt).getTime() > 24 * 3600_000`, render `<p className="text-amber-700 dark:text-amber-400 text-xs mt-1">Остановлено {Xч}</p>` next to the row.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Reset-all stop-list server action</name>
  <files>apps/admin/app/dashboard/(workspace)/menu/stop-list/reset-stop-list-action.ts</files>
  <behavior>
    - `resetStopListAction()` GETs /internal/v1/catalog/stop-list to know which items to unstop, then DELETEs /internal/v1/catalog/stop-list/:itemId for each item in sequence (acceptable for MVP-1 since stop-list is typically <20 items)
    - Returns `{ ok: true, resetCount: N, failedIds: string[] }` — partial-success surfaced; UI can show "5 возобновлены, 1 не удалось"
    - revalidatePath('/dashboard/menu', 'layout') AND revalidatePath('/dashboard') on success
    - Best-effort: if some DELETEs fail, continue and report failedIds; do not abort halfway
  </behavior>
  <read_first>
    - apps/admin/app/dashboard/(workspace)/menu/items/toggle-stop-list-action.ts (Plan 06 — DELETE pattern)
    - .planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md §Wave 3 — Server actions + Pattern S1/S8
    - .planning/phases/04b-catalog-admin-ui/04b-CONTEXT.md §D-13 (manual reset only)
  </read_first>
  <action>
    Create per behavior. Wrap each DELETE in try/catch capturing the itemId for failedIds on rejection. Use `for...of` loop (not Promise.all) so we don't hammer the api; acceptable since stop-list is small.
    Tests: stub apiFetchInternal; assert (a) all DELETEs called once each; (b) partial failure returns failedIds with remaining successes counted; (c) revalidatePath called on both '/dashboard/menu' (layout) and '/dashboard' (default segment).
  </action>
  <verify>
    <automated>pnpm --filter @resto/admin exec vitest run app/dashboard/\\(workspace\\)/menu/stop-list/reset-stop-list-action.spec.ts --no-coverage</automated>
  </verify>
  <done>
    Server action loops DELETEs and reports partial success; specs pass.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Stop-list page (RSC + table client) + Today widget + Dashboard integration</name>
  <files>apps/admin/app/dashboard/(workspace)/menu/stop-list/page.tsx, apps/admin/app/dashboard/(workspace)/menu/stop-list/stop-list-table-client.tsx, apps/admin/components/menu/todays-86-widget.tsx, apps/admin/app/dashboard/(workspace)/page.tsx</files>
  <behavior>
    - `/dashboard/menu/stop-list` RSC: shell chrome with TenantBreadcrumb `Меню › Стоп-лист`; fetches `GET /internal/v1/catalog/stop-list`; renders Today widget (Card variant) at top + table below
    - Today widget on the stop-list page Card: header "Стоп-лист сегодня" + count badge + `Сбросить всё` Button (variant="outline") + helper text "Все остановленные позиции будут возобновлены."
    - Table columns: Photo (48px) | Название | Категория (with parent prefix) | Остановлено (time-since formatter; if >24h add amber inline warning under cell) | Switch (always ON — toggle off re-publishes via Plan 06 toggleStopListAction)
    - Empty state: `<EmptyState variant="empty" title="Стоп-лист пуст" description="Все позиции в меню сейчас доступны для заказа." />`
    - `TodaysWidget` component (separate file `apps/admin/components/menu/todays-86-widget.tsx`): RSC that fetches `GET /internal/v1/catalog/stop-list` independently; renders Card with count + "Сбросить всё" button (client island wrapping the button to invoke server action + show toast); used on the global `/dashboard` page
    - Dashboard page `apps/admin/app/dashboard/(workspace)/page.tsx`: add `<TodaysWidget />` to the dashboard surface (likely next to the existing Setup Checklist card)
    - Reset all button (both on stop-list page and dashboard widget): calls `resetStopListAction()`; on ok toast.success "Стоп-лист сбросен" (or "X возобновлены, Y не удалось" on partial); on full failure toast.error
  </behavior>
  <read_first>
    - apps/admin/app/dashboard/(workspace)/menu/items/items-table-client.tsx (Plan 06 — stop-list switch interaction pattern)
    - apps/admin/app/dashboard/(workspace)/menu/items/toggle-stop-list-action.ts (Plan 06)
    - apps/admin/app/dashboard/(workspace)/page.tsx (existing dashboard — read full file to integrate Today widget without breaking other cards)
    - apps/admin/components/setup-checklist-card.tsx (analog for RSC Card with counters)
    - apps/admin/lib/menu/format-age.ts (Plan 04 — repurpose for "Остановлено Xс/Xм/Xч")
    - apps/admin/components/empty-state.tsx
    - apps/admin/components/menu/status-badge.tsx (Plan 04 — for paused badge if rendered)
    - apps/admin/components/ui/{card,table,switch,button,badge}.tsx
    - .planning/phases/04b-catalog-admin-ui/04B-UI-SPEC.md §Stop-list page + §Empty states + §Destructive actions row 4
    - .planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md §Wave 3 — Todays-86 widget + §Wave 3 — RSC pages
  </read_first>
  <action>
    Create `apps/admin/components/menu/todays-86-widget.tsx`:
    - RSC component (no 'use client') that takes a `count: number` prop (computed by caller — the stop-list page or dashboard page does the fetch and passes count)
    - Render Card with header "Стоп-лист сегодня" + badge with count + helper text "Все остановленные позиции будут возобновлены."
    - Below: client island wrapping a Button calling resetStopListAction. The client island lives in a co-located `todays-86-reset-button-client.tsx` (or inline if simpler) since the RSC parent cannot hold the onClick handler.
    - If `count === 0`: hide the Сбросить всё button (nothing to reset); show muted text "Стоп-лист пуст"
    Create `apps/admin/app/dashboard/(workspace)/menu/stop-list/page.tsx`:
    - RSC; redirect check
    - `const stopList = await apiFetchInternal<StopListResponse>('/internal/v1/catalog/stop-list');`
    - Render shell chrome + `<TodaysWidget count={stopList.data?.length ?? 0} />` + `<StopListTableClient items={stopList.data ?? []} />`
    - Empty state when length === 0
    Create `apps/admin/app/dashboard/(workspace)/menu/stop-list/stop-list-table-client.tsx`:
    - 'use client'
    - Renders table per behavior; reuses the stop-list switch interaction from Plan 06 (call `toggleStopListAction({ itemId, next: 'published' })` when toggled off)
    - Inline stale warning when `stoppedAt > 24h` ago: `<p className="text-amber-700 dark:text-amber-400 text-xs mt-1">Остановлено {durationLabel}</p>` where `durationLabel` uses an extension of format-age (Plan 04) — extend `format-age.ts` with `formatDuration(msSince: number): string` returning `Xс` / `Xм` / `Xч` / `Xд` (no "назад" suffix)
    Modify `apps/admin/app/dashboard/(workspace)/page.tsx`: add a parallel `apiFetchInternal<StopListResponse>('/internal/v1/catalog/stop-list')` fetch alongside existing dashboard fetches; render `<TodaysWidget count={...} />` in the dashboard grid (preserve existing cards — Setup Checklist, AI Preview, etc.)
    Tests:
    - `reset-stop-list-action.spec.ts` (Task 1 — already covered)
    - `stop-list/page.spec.tsx`: assert stop-list fetched; empty state renders when 0; widget receives correct count
    - `stop-list-table-client.spec.tsx`: assert switch toggle-off calls toggleStopListAction with next='published'; assert stoppedAt > 24h shows amber warning
    - `todays-86-widget.spec.tsx`: assert count badge renders; reset button hidden when count=0; reset button click triggers action + toast
    - `dashboard/page.spec.tsx` (extend existing or add): assert TodaysWidget mounted with computed count
  </action>
  <verify>
    <automated>pnpm --filter @resto/admin exec vitest run app/dashboard/\\(workspace\\)/menu/stop-list/page.spec.tsx app/dashboard/\\(workspace\\)/menu/stop-list/stop-list-table-client.spec.tsx components/menu/todays-86-widget.spec.tsx --no-coverage</automated>
  </verify>
  <done>
    Stop-list page renders with widget + table; dashboard page shows widget; reset-all loops DELETEs; stale 24h warning renders amber; specs pass.
  </done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                                                               | Description                                 |
| ---------------------------------------------------------------------- | ------------------------------------------- |
| Admin server action → api /internal/v1/catalog/stop-list (loop DELETE) | apiFetchInternal carries INTERNAL_API_TOKEN |

## STRIDE Threat Register

| Threat ID   | Category               | Component                                                 | Disposition | Mitigation Plan                                                                                                 |
| ----------- | ---------------------- | --------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------- |
| T-04b-09-01 | DoS                    | Reset-all loop overwhelms api                             | accept      | Stop-list is typically <20 items in MVP-1; sequential loop is acceptable; existing api rate-limit covers excess |
| T-04b-09-02 | Tampering              | CSRF on reset-all server action                           | mitigate    | Next.js 15 server actions ship built-in CSRF token                                                              |
| T-04b-09-03 | Information Disclosure | INTERNAL_API_TOKEN in client bundle                       | mitigate    | resetStopListAction is 'use server'; client island only invokes the action                                      |
| T-04b-09-04 | Repudiation            | Reset-all partial failure not surfaced                    | mitigate    | Returns `failedIds`; UI shows "X возобновлены, Y не удалось" toast                                              |
| T-04b-09-05 | Tampering              | Operator bypassing manual reset via auto-cron expectation | accept      | D-13 explicitly defers auto-reset; UI documents "manual only" through the absence of a schedule UI              |

</threat_model>

<verification>
- /dashboard/menu/stop-list renders Today widget + table of paused items
- Toggle off in stop-list table re-publishes item (calls toggleStopListAction)
- Reset all loops DELETEs and toasts partial-success copy when needed
- Dashboard widget on /dashboard shows count + reset button
- Amber ">24h" warning renders next to long-stopped items
- Empty state matches UI-SPEC verbatim
</verification>

<success_criteria>

1. Stop-list page lists paused items with stale warning + toggle-back switch
2. Today widget renders on both stop-list page and dashboard
3. Reset-all server action loops DELETEs + returns partial-failure report
4. Switch toggle-off in the stop-list table re-publishes
5. Dashboard page integrates TodaysWidget without breaking existing cards
6. Russian copy matches UI-SPEC verbatim
7. All specs pass
   </success_criteria>

<output>
Create `.planning/phases/04b-catalog-admin-ui/04b-09-SUMMARY.md` when done.
</output>
