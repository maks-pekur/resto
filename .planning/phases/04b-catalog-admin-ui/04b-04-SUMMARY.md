---
phase: 04b-catalog-admin-ui
plan: 04
subsystem: admin-ui
tags:
  [
    admin-ui,
    catalog,
    sticky-publish-bar,
    sonner,
    route-group-layout,
    status-badge,
    auto-save,
    server-actions,
  ]
dependency-graph:
  requires: [04b-01, 04b-02]
  provides:
    - apps/admin/components/menu/sticky-publish-bar.tsx
    - apps/admin/components/menu/status-badge.tsx
    - apps/admin/components/menu/auto-save-indicator.tsx
    - apps/admin/components/menu/publish-countdown-toast.tsx
    - apps/admin/lib/menu/types.ts
    - apps/admin/lib/menu/format-age.ts
    - apps/admin/lib/menu/pluralize-changes.ts
    - apps/admin/lib/menu/schedule-publish-action.ts
    - apps/admin/lib/menu/cancel-publish-action.ts
    - apps/admin/app/dashboard/(workspace)/menu/layout.tsx
  affects:
    - apps/admin/components/app-sidebar.tsx
tech-stack:
  added: []
  patterns:
    - 'Sonner constant-id replace pattern (RESEARCH §Pattern 2): every toast call for the publish flow uses the constant id `publish-countdown` so the countdown is replaced in place by success/info/error outcomes — no toast stacking.'
    - 'Route-group layout fetches `GET /internal/v1/catalog/draft-diff` via `apiFetchInternal` (server-only, INTERNAL_API_TOKEN never reaches the browser); forwards the snapshot to a client island that owns the Sonner / countdown lifecycle.'
    - 'Server actions (`schedulePublishAction`, `cancelPublishAction`) call `revalidatePath("/dashboard/menu", "layout")` after success so the sticky bar diff refreshes per Pitfall #4.'
    - 'Re-click protection via local `isPublishing` state: button is `disabled` + wrapped in Tooltip explaining cancellation while the countdown is active (D-4b-03).'
    - "Countdown uses `Date.now()` baseline + `setInterval(100ms)` (not tick counting) so backgrounded tabs don't desynchronise from wall-clock seconds; `onElapse` is ref-guarded to fire exactly once at the 5s boundary."
    - 'Russian plural rule encoded for `неопубликованных изменений` (singular / few / many) per standard noun declension table (11..19 → genitive plural override).'
key-files:
  created:
    - apps/admin/components/menu/status-badge.tsx
    - apps/admin/components/menu/auto-save-indicator.tsx
    - apps/admin/components/menu/publish-countdown-toast.tsx
    - apps/admin/components/menu/sticky-publish-bar.tsx
    - apps/admin/components/menu/sticky-publish-bar-client.tsx
    - apps/admin/lib/menu/types.ts
    - apps/admin/lib/menu/format-age.ts
    - apps/admin/lib/menu/pluralize-changes.ts
    - apps/admin/lib/menu/schedule-publish-action.ts
    - apps/admin/lib/menu/cancel-publish-action.ts
    - apps/admin/app/dashboard/(workspace)/menu/layout.tsx
    - apps/admin/test/format-age.spec.ts
    - apps/admin/test/status-badge.spec.tsx
    - apps/admin/test/auto-save-indicator.spec.tsx
    - apps/admin/test/app-sidebar-menu-group.spec.tsx
    - apps/admin/test/pluralize-changes.spec.ts
    - apps/admin/test/publish-countdown-toast.spec.tsx
    - apps/admin/test/sticky-publish-bar-client.spec.tsx
    - apps/admin/test/schedule-publish-action.spec.ts
    - apps/admin/test/cancel-publish-action.spec.ts
    - .planning/phases/04b-catalog-admin-ui/04b-04-SUMMARY.md
  modified:
    - apps/admin/components/app-sidebar.tsx
decisions:
  - "04b-04 Sidebar Меню group: 4 sub-routes (Категории, Блюда, Модификаторы, Стоп-лист), `scope: 'brand'`, collapsed-by-default per D-01."
  - '04b-04 StatusBadge variants per UI-SPEC §Status badge color semantics: draft→outline, modified→outline+amber, published→default, paused→secondary (GM MED-1 not destructive), archived→ghost+muted.'
  - "04b-04 Sonner constant id 'publish-countdown' is the contract for every publish-flow toast: replace-in-place across count-up → success / info / error."
  - "04b-04 Russian plural rule for 'неопубликованных изменений' encoded in `pluralize-changes.ts` — standard last-digit + teens-override decimal rule, unit-tested for 0/1/2/5/11/21/22/25/101/111."
  - '04b-04 PublishCountdownToast computes elapsed time from `Date.now()` baseline (not tick counting) so backgrounded tabs do not desynchronise; `onElapse` ref-guarded to fire exactly once.'
  - '04b-04 StickyPublishBar mounted only at the `/dashboard/menu/*` route-group layout (not the global dashboard layout) so the bar appears only inside the Menu section.'
metrics:
  started: '2026-05-31T14:39:42Z'
  completed: '2026-05-31T14:50:44Z'
  duration_minutes: 11
  task_count: 3
  file_count: 21
  test_count: 39
  test_passed: 243
---

# Phase 04b Plan 04: Wave 3 Sidebar Menu Group + Sticky Publish Bar + Status Primitives Summary

Wave 3 frontend foundation for the catalog admin UI: extends the sidebar with the `Меню` collapsible group (4 sub-routes), mounts the `/dashboard/menu` route-group layout that fetches the draft-diff via `apiFetchInternal` and renders the sticky publish bar, ships the publish/cancel server actions, the `PublishCountdownToast` with the constant-id replace pattern, and the two shared display primitives `StatusBadge` + `AutoSaveIndicator` consumed by Plans 05-08. CAT-08 (diff UX — badges + sticky bar) landed here.

## Tasks Completed

| Task | Name                                                                                     | Commit  | Files                                                                                                                                                                                                                                                                             |
| ---- | ---------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Sidebar Menu group + types + StatusBadge + AutoSaveIndicator                             | 92eede3 | apps/admin/components/app-sidebar.tsx, apps/admin/components/menu/status-badge.tsx, apps/admin/components/menu/auto-save-indicator.tsx, apps/admin/lib/menu/types.ts, apps/admin/lib/menu/format-age.ts, 4 spec files                                                             |
| 2    | Publish + cancel server actions                                                          | 763f26d | apps/admin/lib/menu/schedule-publish-action.ts, apps/admin/lib/menu/cancel-publish-action.ts, 2 spec files                                                                                                                                                                        |
| 3    | PublishCountdownToast + StickyPublishBar (RSC + client island) + menu route-group layout | ce4bc9a | apps/admin/components/menu/publish-countdown-toast.tsx, apps/admin/components/menu/sticky-publish-bar.tsx, apps/admin/components/menu/sticky-publish-bar-client.tsx, apps/admin/app/dashboard/(workspace)/menu/layout.tsx, apps/admin/lib/menu/pluralize-changes.ts, 3 spec files |

## Acceptance Gate

- `pnpm --filter @resto/admin exec tsc -p tsconfig.json --noEmit` — exit 0
- `pnpm --filter @resto/admin exec vitest run --no-coverage` — 39 test files, **243/243 passed** (22 new tests for this plan)
- `pnpm --filter @resto/admin exec eslint <touched paths>` — clean on every file touched by this plan
- Sticky bar component renders count from a mocked `/draft-diff` response (sticky-publish-bar-client.spec.tsx)
- Sonner countdown toast id contract verified — every toast call carries `id: 'publish-countdown'` (sticky-publish-bar-client.spec.tsx)
- StatusBadge renders all 5 variants with correct Russian copy (status-badge.spec.tsx)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Test Plumbing] Collapsible defaults to closed; sidebar sub-route assertions need expansion first**

- **Found during:** Task 1
- **Issue:** Plan asserted that the 4 Menu sub-routes are in the DOM on initial render. Radix `Collapsible` with `defaultOpen={false}` does not mount its content until the trigger is clicked. Plan's "collapsed by default" rule (D-01) and "sub-routes are visible" assertion are mutually exclusive on initial render.
- **Fix:** Split the original sub-routes test into two: (a) a collapsed-by-default assertion that the sub-routes are NOT in the DOM initially (codifying D-01), (b) an expand-then-assert test that clicks the `Меню` trigger and verifies the 4 sub-routes appear with correct hrefs. Codifies both contracts (D-01 + the URL map).
- **Files modified:** apps/admin/test/app-sidebar-menu-group.spec.tsx
- **Commit:** 92eede3

**2. [Rule 1 — Flaky test] `userEvent.setup({ advanceTimers: ... })` deadlocked with `vi.useFakeTimers({ shouldAdvanceTime: false })` in `publish-countdown-toast` cancel test**

- **Found during:** Task 3
- **Issue:** `await user.click(...)` from `@testing-library/user-event` returns a Promise that resolves on the next microtask tick. With `vi.useFakeTimers({ shouldAdvanceTime: false })` in place and the advance-timers bridge configured, the microtask never resolved → 5s test timeout.
- **Fix:** Replaced the cancel test with a synchronous `fireEvent.click(...)`. The other countdown tests still use fake timers; only the click handler test sidesteps them. Captures the same behaviour (onCancel fires) without the timer-bridge fragility.
- **Files modified:** apps/admin/test/publish-countdown-toast.spec.tsx
- **Commit:** ce4bc9a

### Out-of-Scope Discoveries

**Pre-existing lint errors in `apps/admin/lib/actions/sign-in-and-bind-org.ts:69-77`** — three `no-unsafe-assignment` / `no-unsafe-member-access` errors on a Better Auth `body.session.id` access path. Already documented in `.planning/phases/04b-catalog-admin-ui/deferred-items.md` since Plan 04b-01; not introduced by this plan. Out of scope.

## Key Components Delivered

1. **Sidebar Меню group** (`components/app-sidebar.tsx`) — `UtensilsCrossed` icon, `scope: 'brand'`, collapsed by default, 4 sub-routes (Категории, Блюда, Модификаторы, Стоп-лист) wired to `/dashboard/menu/{categories,items,modifier-groups,stop-list}` per D-01 / UI-SPEC §Sidebar extension.

2. **StatusBadge** (`components/menu/status-badge.tsx`) — 5 variants per UI-SPEC §Status badge color semantics: `draft`→outline (Черновик), `modified`→outline+amber (Изменено), `published`→default (Опубликовано), `paused`→secondary (Стоп — NOT destructive per GM MED-1), `archived`→ghost+muted (Архив). Carries `aria-label="Статус: {label}"` per UI-SPEC §Accessibility Contracts.

3. **AutoSaveIndicator** (`components/menu/auto-save-indicator.tsx`) — discriminated-union prop `state: SaveState`. Renders nothing on `idle`; `Сохранение…` on `saving`; `Сохранено Xс назад` on `saved` via `formatAge`; `Не сохранено — повторить` on `failed`. `aria-live="polite"` so screen readers announce transitions.

4. **format-age** (`lib/menu/format-age.ts`) — 3-bucket Russian relative-time formatter: `<60s` → `Xс назад`, `<60m` → `Xм назад`, else `Xч назад`. Injectable `now` for deterministic tests.

5. **schedulePublishAction / cancelPublishAction** (`lib/menu/{schedule,cancel}-publish-action.ts`) — `'use server'` actions calling `POST` / `DELETE /internal/v1/catalog/publish` via `apiFetchInternal`. Both `revalidatePath('/dashboard/menu', 'layout')` on success (Pitfall #4) and return discriminated-union results with Russian error copy per UI-SPEC §Error states.

6. **PublishCountdownToast** (`components/menu/publish-countdown-toast.tsx`) — Sonner-custom toast content. `setInterval(100ms)` updating `elapsed` against `Date.now()` baseline (not tick counting), `onElapse` ref-guarded to fire exactly once at 5000ms, width `w-[360px]` per UI-SPEC, `aria-live="polite"` on countdown text. Linear `<Progress>` underneath.

7. **StickyPublishBar (RSC + client island)** (`components/menu/sticky-publish-bar.tsx` + `sticky-publish-bar-client.tsx`) — `fixed bottom-0 left-[--sidebar-width] right-0 z-40 h-14`. Hidden when `unpublishedCount === 0`. Inline diff-list toggle via `Показать ▾`. `Опубликовать меню` button disabled+Tooltip during active countdown (re-click protection per D-4b-03). Sonner constant id `'publish-countdown'` threaded through every toast call (success / info / error). `role="region" aria-label="Управление публикацией"` per UI-SPEC §Accessibility Contracts.

8. **Menu route-group layout** (`app/dashboard/(workspace)/menu/layout.tsx`) — async RSC that fetches `GET /internal/v1/catalog/draft-diff` via `apiFetchInternal` and forwards the snapshot to the sticky bar. Mounts only on `/dashboard/menu/*` routes.

9. **pluralize-changes** (`lib/menu/pluralize-changes.ts`) — Russian noun declension for `неопубликованных изменений` covering singular/few/many forms with the standard teens-override rule. Unit-tested at 0/1/2/5/11/21/22/25/101/111.

## REQ-IDs Closed

- **CAT-08** — diff UX — badges + sticky bar

## Self-Check: PASSED

**Files created (verified on disk):**

- apps/admin/components/menu/status-badge.tsx — FOUND
- apps/admin/components/menu/auto-save-indicator.tsx — FOUND
- apps/admin/components/menu/publish-countdown-toast.tsx — FOUND
- apps/admin/components/menu/sticky-publish-bar.tsx — FOUND
- apps/admin/components/menu/sticky-publish-bar-client.tsx — FOUND
- apps/admin/lib/menu/types.ts — FOUND
- apps/admin/lib/menu/format-age.ts — FOUND
- apps/admin/lib/menu/pluralize-changes.ts — FOUND
- apps/admin/lib/menu/schedule-publish-action.ts — FOUND
- apps/admin/lib/menu/cancel-publish-action.ts — FOUND
- apps/admin/app/dashboard/(workspace)/menu/layout.tsx — FOUND

**Commits (verified in git log):**

- 92eede3 feat(04b-04): sidebar Menu group + StatusBadge + AutoSaveIndicator + format-age — FOUND
- 763f26d feat(04b-04): schedule/cancel publish server actions — FOUND
- ce4bc9a feat(04b-04): StickyPublishBar + publish countdown toast + menu route layout — FOUND
