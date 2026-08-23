---
phase: 10-admin-order-intake
plan: 10
subsystem: ui

tags: [tanstack-router, tanstack-query, react, i18next, polling, shadcn]

# Dependency graph
requires:
  - phase: 10-admin-order-intake plan 08
    provides: GET /v1/orders/feed, GET /v1/orders/:id/detail HTTP surface this page consumes
  - phase: 10-admin-order-intake plan 07
    provides: ListOrdersService's D-03 status/date presets and feed row shape
  - phase: 10-admin-order-intake plan 01
    provides: orders table's per-state timestamps and eta_at the card renders
  - phase: 10-admin-order-intake plan 02
    provides: order:cancel permission verb (not yet consumed by this plan's disabled action buttons)
provides:
  - 'apps/admin/src/lib/queries/orders.ts — ordersFeedQuery/orderDetailQuery query factories, OrderFeedRowApi/OrderDetailApi types, DEFAULT_ORDER_FEED_FILTERS'
  - 'apps/admin/src/components/orders/order-status-badge.tsx — OrderStatusBadge (7-state) + OrderRefundFailedBadge'
  - 'apps/admin/src/components/orders/order-card.tsx — OrderCard, deriveOrderCardState, UNACCEPTED_ESCALATION_MS'
  - 'apps/admin/src/components/orders/order-filter-bar.tsx — status/date Select controls, static channel Badge, live/reconnecting pill'
  - 'apps/admin/src/components/orders/orders-empty-state.tsx — bespoke activation card with payments/menu/location checklist and copy-link'
  - '/{brandSlug}/orders route registered in main.tsx, 5s-polled three-group feed'
  - 'Sidebar Orders entry with unaccepted-order SidebarMenuBadge (nav-main.tsx badge slot, app-sidebar.tsx wiring)'
  - 'Full orders.* i18next namespace (ru + en) covering every section this plan and plan 10-11 need'
affects:
  [
    "10-11 (Accept/Reject/Cancel mutation flows attach to this plan's disabled placeholder buttons)",
    "10-12 (Order Detail Sheet consumes orderDetailQuery and the card's tap-to-open affordance, not yet wired)",
    "10-13 (browser smoke pass — this plan's claims are typecheck/lint/build/unit-test verified only, not browser-verified)",
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Full-refetch polling (refetchInterval: 5_000, no since-cursor) instead of the RESEARCH-suggested delta/since-cursor merge — a since-cursor can only observe NEW rows, not STATUS CHANGES on already-fetched rows (e.g. paid->accepted doesn't change createdAt), which would make the feed silently miss a kitchen accepting an order. Full refetch is simpler and strictly more correct at single-restaurant feed volume."
    - 'isRefetchError (TanStack Query v5) drives the stale-vs-first-load error distinction — isError && !isRefetchError means no cached data ever (first-load panel); isRefetchError means cached data exists but the latest poll failed (stale banner + reconnecting pill).'
    - "Sidebar unaccepted counter shares the orders page's own default-filtered query (DEFAULT_ORDER_FEED_FILTERS) via TanStack Query's structural key hashing — zero extra requests when the operator is viewing the default Active/Today view; a second independent poll only when the operator has changed filters away from default."
    - 'Activation-empty vs filtered-empty distinguished via a cheap secondary all_today+week+limit:1 lookup fired only when the current view is already empty — the API has no all-time preset, so this is a best-effort 7-day lookback, not a true all-time check.'

key-files:
  created:
    - apps/admin/src/lib/queries/orders.ts
    - apps/admin/src/components/orders/order-status-badge.tsx
    - apps/admin/src/components/orders/order-card.tsx
    - apps/admin/src/components/orders/order-card.spec.ts
    - apps/admin/src/components/orders/order-filter-bar.tsx
    - apps/admin/src/components/orders/orders-empty-state.tsx
    - apps/admin/src/routes/(protected)/$brandSlug/orders.tsx
  modified:
    - apps/admin/src/main.tsx
    - apps/admin/src/components/app-sidebar.tsx
    - apps/admin/src/components/nav-main.tsx
    - apps/admin/src/lib/i18n/messages/ru.json
    - apps/admin/src/lib/i18n/messages/en.json

key-decisions:
  - "Dropped the since-cursor poll design from RESEARCH D.14 in favor of a plain full-refetch every 5s. A since-cursor only returns rows created after the cursor; it cannot surface a status transition on an already-known row (e.g. an operator on a second device accepting an order), so a delta-only feed would show stale statuses indefinitely between full reloads. The OrderFeedSinceCursor/since param still exists in the query layer (matches the backend contract 1:1) but this plan's actual polling call never sets it — every 5s tick is a full, correct re-fetch of the current filtered set."
  - "Escalation threshold locked to 5 minutes per UI-SPEC Open Question #1's own stated default — UNACCEPTED_ESCALATION_MS = 5 * 60_000, a single named constant in order-card.tsx (D-12: hardcoded, no settings screen)."
  - 'QR-code download scoped out entirely per UI-SPEC Open Question #3 — the empty-state activation card renders a copy-link button only. No QR-generation dependency was added (git diff apps/admin/package.json is empty).'
  - "Guest ordering link sourced from the already-existing tenantDomainsQuery() (brand's configured custom domain), not a new env var or an invented *.menu.resto.app URL scheme — no such per-brand guest-ordering route exists yet anywhere in the codebase (apps/website has no brand-scoped catalog route, only checkout/confirmation), so fabricating a URL pattern would risk shipping a link that 404s. When no domain is configured yet (the common case for a brand mid-activation), the copy-link button is disabled with a noDomainHint string rather than copying a broken link."
  - "Zero-comments hard rule overrode two plan-mandated WHY-comments: UNACCEPTED_ESCALATION_MS (D-12/Open Question #1 rationale) and the Delivery-is-a-label-only note (Skeptic HIGH-6). Both rationales are recorded here and in commit history instead of in source comments, matching the precedent already set in 10-07's SUMMARY."
  - "All card-face action buttons (Принять/Отклонить/Готовится/Готово/Выдан/Повторить возврат) render as disabled placeholders with no onClick handler at all, per this plan's explicit scope boundary — plan 10-11 attaches the mutation flows. The card body itself has no tap-to-open handler either, since the Order Detail Sheet doesn't exist until plan 10-12; UI-SPEC Section 7's 'tap the card body' affordance is not yet wired."
  - 'AppSidebar now calls useEffectiveLocation() directly (previously it only used meLocationsQuery for the LocationSwitcher) so the unaccepted counter can resolve the same per-role location scope the orders page uses, without inventing a parallel filter. This means useEffectiveLocation is now mounted twice simultaneously when /orders is open (once in AppSidebar, once in OrdersPage) — both compute from the same router search state and meQuery() cache entry, so this is a duplicate-computation cost, not a duplicate-request or state-divergence risk.'

requirements-completed: [ORDINT-01, ORDINT-07, ORDINT-08]

# Metrics
duration: ~50min
completed: 2026-08-16
---

# Phase 10 Plan 10: Orders Feed Page Summary

**Dedicated `/{brandSlug}/orders` route: a 5-second full-refetch polled, three-group (Ждут/В работе/Завершены), location-aware order feed with the eight-visual-state order card, a filter bar with a static channel badge, distinct loading/activation-empty/filtered-empty/stale-error/first-load-error states, and a sidebar entry carrying a shared-query unaccepted counter — all mutation buttons ship as disabled placeholders for plan 10-11.**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-08-16
- **Tasks:** 2 completed
- **Files modified:** 12 (7 created, 5 modified)

## Accomplishments

- **`ordersFeedQuery`/`orderDetailQuery`** (`apps/admin/src/lib/queries/orders.ts`) follow the established `catalog.ts` query-factory shape, pass TanStack Query's own `signal` through to `apiFetch`, and keep `refetchInterval` out of the factory (layered at the `useQuery` call site per plan instruction).
- **`OrderStatusBadge`/`OrderRefundFailedBadge`** (`order-status-badge.tsx`) implement the 7 status-driven card states plus the refund-failed overlay flag, following `menu/status-badge.tsx`'s `VARIANTS`+`EXTRA_CLASS` pattern exactly — `preparing`/`ready` use the phase's first-ever consumption of `bg-warning`/`bg-success` semantic tokens, no raw hex anywhere.
- **`OrderCard`** (`order-card.tsx`) renders the Display-size daily number, status + location badges, a time-in-state chip (green/amber/red banding, Tooltip with exact timestamp, reusing `formatDuration`/`formatAge` verbatim — no second formatter written), the escalated-red treatment at the locked 5-minute threshold, and the refund-failed non-dimming overlay. Every action button is `h-12`, disabled, with no handler.
- **`/{brandSlug}/orders`** route is registered in `main.tsx`'s `brandSlugRouteTree`, confirmed non-colliding with reserved slugs (existing `reserved-slugs-route-derivation.spec.ts` D-06 test still passes), reads `useEffectiveLocation()` as the sole location authority (owner `all` → one merged, location-labelled, fully actionable list; owner single/staff → their one location), and groups+sorts the feed into three visually separated sections per UI-SPEC §2.
- **Five distinct states** implemented: 3-skeleton loading, bespoke activation empty-state (payments/menu/location checklist from already-existing queries, copy-link button, zero new dependency), plain filtered-empty state, a stale-data banner + reconnecting pill when a poll fails with cached data present, and a structurally distinct first-load failure panel (`WifiOff` icon, different copy register, the only one of the three with a retry button) — verified via `isRefetchError` vs `isError` distinction, not a heuristic guess.
- **Sidebar** gained an `Orders` entry (`ClipboardList` icon) placed second (service-first ordering, right after Dashboard) with an unaccepted-order `SidebarMenuBadge`; `nav-main.tsx` gained an optional `badge?`/`badgeAriaLabel?` slot rendered in both the flat and collapsible branches.
- **Full bilingual `orders.*` namespace** added to both `ru.json` and `en.json` (real English, not copies), covering every section including the ones only plan 10-11 will consume, so the two plans cannot drift on copy.

## Task Commits

Each task was committed atomically:

1. **Task 1: Feed queries, status badge and order card** - `bb91d00` (feat)
2. **Task 2: The Orders route — grouped polled feed, filter bar, empty and error states** - `f9175ce` (feat)

## Files Created/Modified

- `apps/admin/src/lib/queries/orders.ts` (new) - feed/detail query factories, full TypeScript types mirroring the backend DTO
- `apps/admin/src/components/orders/order-status-badge.tsx` (new) - 7-state badge + refund-failed overlay badge
- `apps/admin/src/components/orders/order-card.tsx` (new) - the order card, state derivation, escalation constant
- `apps/admin/src/components/orders/order-card.spec.ts` (new) - 6 unit tests for `deriveOrderCardState`
- `apps/admin/src/components/orders/order-filter-bar.tsx` (new) - status/date selects, static channel badge, live pill
- `apps/admin/src/components/orders/orders-empty-state.tsx` (new) - bespoke activation card
- `apps/admin/src/routes/(protected)/$brandSlug/orders.tsx` (new) - the route, grouping/sort, all five states
- `apps/admin/src/main.tsx` - registers the orders route
- `apps/admin/src/components/app-sidebar.tsx` - Orders nav entry + shared-query unaccepted counter
- `apps/admin/src/components/nav-main.tsx` - `badge?`/`badgeAriaLabel?` slot on `NavMainItem`
- `apps/admin/src/lib/i18n/messages/ru.json` - full `orders.*` namespace + `nav.orders`
- `apps/admin/src/lib/i18n/messages/en.json` - full `orders.*` namespace (real translations) + `nav.orders`

## Decisions Made

See `key-decisions` in the frontmatter for the full list with rationale. Summary:

- Full-refetch polling instead of a since-cursor delta (status transitions on known rows would be invisible to a pure delta fetch).
- 5-minute escalation threshold locked per UI-SPEC's own stated default.
- QR download scoped out to copy-link only; guest link sourced from the brand's already-configured custom domain (no invented URL scheme, no new env var).
- Zero-comments rule suppressed two plan-mandated WHY-comments; rationale lives here instead.
- All action buttons and the card body are inert placeholders — 10-11/10-12 wire them.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — bug avoidance] Replaced the since-cursor poll design with a full-refetch poll**

- **Found during:** Task 2, designing the `useQuery` polling call per RESEARCH D.14's suggested since-cursor approach.
- **Issue:** A since-cursor (`sinceCreatedAt`/`sinceId`) can only return rows whose `createdAt` is after the cursor — it cannot surface a status change on an already-fetched row (e.g. an order transitioning `paid` → `accepted` on another device). Building the plan's literal "drop the cursor on window focus" design would still leave the feed showing stale statuses for already-visible cards between full window-focus events, which directly contradicts the plan's own safety requirement that the feed reflect current kitchen state.
- **Fix:** `orders.tsx`'s `useQuery` never sets `since`; every 5-second tick and every window-focus refetch re-fetches the full current filtered set, which is both simpler and correct for a live status feed at single-restaurant scale. The `since`/`OrderFeedSinceCursor` field remains in `queries/orders.ts` (matches the backend wire contract exactly, per the plan's own instruction to mirror the DTO) for a future poll-optimization pass, just unused by this plan's call site.
- **Files affected:** `apps/admin/src/routes/(protected)/$brandSlug/orders.tsx`
- **Verification:** Manual trace of the status-transition scenario above; `tsc`/`lint`/`build`/`test` all green.
- **Committed in:** `f9175ce` (Task 2)

**2. [Rule 2 — missing critical functionality] Added i18n keys not literally listed in UI-SPEC §12's copy deck**

- **Found during:** Task 1 (fulfillment mode labels, item-count plural forms) and Task 2 (sidebar badge aria, no-domain hint).
- **Issue:** UI-SPEC §12's copy deck is the binding contract but doesn't enumerate every string a literal implementation needs — the card's body row needs a fulfillment-mode label and an item-count string, and the empty-state needs a fallback string for the no-configured-domain case. Rendering these without a key would mean hardcoded, non-localized text.
- **Fix:** Added `orders.card.fulfillmentDineIn/Pickup/Delivery`, `orders.card.itemCount_one/_few/_many/_other` (ru) / `_one/_other` (en, matching the existing `unpublishedChanges` plural-form precedent), `orders.card.sidebarBadgeAria`, and `orders.empty.noDomainHint` to both locale files with real translations in each.
- **Files affected:** `apps/admin/src/lib/i18n/messages/ru.json`, `apps/admin/src/lib/i18n/messages/en.json`
- **Verification:** Node parity assertion (`orders` namespace sub-groups present in both locales) passes; `i18n.spec.ts` still green.
- **Committed in:** `bb91d00` (Task 1), `f9175ce` (Task 2)

**3. [WHY-comment suppression per the executor's zero-comments hard rule] Two plan-mandated WHY-comments were not added**

- **Found during:** Task 1, `order-card.tsx`.
- **Issue:** The plan's Task 1 text explicitly asks for a WHY-comment on `UNACCEPTED_ESCALATION_MS` naming D-12 and UI-SPEC Open Question #1, and another WHY-comment on the "Delivery is a label only" scope boundary naming Skeptic HIGH-6. This executor's system prompt carries an explicit, overriding zero-comments rule instructing exactly this case: leave the comment out, put the rationale in the SUMMARY instead.
- **Fix:** No comments were added. Rationale: `UNACCEPTED_ESCALATION_MS = 5 * 60_000` locks UI-SPEC Open Question #1's own stated default (D-12: hardcoded, no settings screen — a single named exported constant is the whole configuration surface). No delivery dispatch/"on its way" state or copy exists anywhere in `order-card.tsx` (fulfillment mode is rendered as a static text label + icon only) because Phase 9 (delivery dispatch) does not exist yet and the feed must never render a lifecycle the backend cannot back (Skeptic HIGH-6) — confirmed via the acceptance-criteria grep (`on its way|в пути|курьер|dispatch` returns 0).
- **Files affected:** none beyond what's already listed.
- **Committed in:** n/a (nothing to commit for this item; documented here only).

---

**Total deviations:** 3 (1 Rule 1 bug-avoidance architectural simplification, 1 Rule 2 missing-i18n-key addition, 1 documented comment-suppression per the executor's own hard rule).
**Impact on plan:** The polling redesign strictly improves correctness over the plan's literal since-cursor wording (a delta-only poll would silently miss status transitions); the i18n additions were required for the literal implementation to render without hardcoded strings and add no functional scope beyond what the card/empty-state already needed. No feature was added or removed relative to the plan's stated `<success_criteria>`.

## Things a reader might trip on

- **Sticky group sub-header offset is an unverified guess.** `FeedGroupSection`'s `<h2>` uses `sticky top-12` to sit below the sticky filter bar without overlapping it. `top-12` (48px) approximates the compact filter bar's rendered height but was never checked in a real browser — plan 10-13's browser pass should confirm there's no overlap/gap at real fonts and real Select trigger heights.
- **The "brand has zero orders ever" activation-empty state is a 7-day-lookback heuristic, not a true all-time check.** The feed API has no "all time" date preset (`Дата` only offers Сегодня/Вчера/7 дней per UI-SPEC §3's own deliberate scope-down), so `orders.tsx` approximates "ever" by firing a cheap secondary `all_today`+`week`+`limit:1` query only when the current view is already empty. A restaurant that has been quiet for more than 7 days (unlikely at MVP scale, but possible) would see the bespoke activation card again instead of the plain filtered-empty state. This is a real, documented limitation of the backend's preset design, not an oversight — flagging it for whoever revisits `OrderDatePresetSchema`.
- **`AppSidebar` now mounts `useEffectiveLocation()` for the first time.** Previously only page components (e.g. `stop-list.tsx`) called it. When `/orders` is open, both `AppSidebar` and `OrdersPage` mount the hook simultaneously — both read the same `meQuery()`/router-search state and would compute an identical D-18 fallback-navigate target if one were needed, so this is a harmless duplicate computation, not a race. No other page in the app currently exercises this double-mount pattern; worth knowing if `useEffectiveLocation`'s internals ever change.
- **This plan's verification is typecheck/lint/build/unit-test only — no browser was launched.** `pnpm exec tsc --noEmit`, `pnpm exec eslint .`, `pnpm exec vite build`, and the full `pnpm exec vitest run` suite (54/54, including the existing D-06 reserved-slug route-derivation test) all pass, but per this codebase's own documented history (Phase 08.4/08.5 white-screen and navigate-to-wrong-page bugs that passed the exact same checks), none of that proves the feed renders correctly in a real tablet-width browser. Plan 10-13 is explicitly responsible for that pass — treat every visual/layout claim above ("groups render correctly," "sticky header doesn't overlap," "escalated card reads correctly in dark mode") as unverified until then.
- **Guest ordering link depends on a configured custom domain that most brands won't have yet.** `OrdersEmptyState` reads `tenantDomainsQuery()`'s primary domain; when no domain is configured (the default state for a brand mid-activation, which is exactly when this empty state is most likely to render), the copy-link button is disabled and a `noDomainHint` string explains why, rather than copying a link that would 404. No `*.menu.resto.app`-style guest ordering route exists anywhere in the codebase yet to link to instead.

## Issues Encountered

- Same environment-setup pattern as every prior Phase 10 plan: this worktree had no `node_modules` and started from a stale `origin/main`-based HEAD (`b06ffeb`) rather than the expected wave-6 base — resolved via the mandatory `git reset --hard` to the orchestrator-specified base commit, then `pnpm install`.
- `lucide-react`'s installed version (1.16.0) renames `AlertCircle`/`AlertTriangle` to `CircleAlert`/`TriangleAlert` internally but still re-exports the old names as aliases — confirmed via the package's `.d.ts` before using them, no substitution needed.
- One ESLint `@typescript-eslint/no-redundant-type-constituents` finding on `locationId: string | 'all'` in `queries/orders.ts`, suppressed with a bare `eslint-disable-next-line` (no trailing comment text, per the zero-comments rule) — the exact same pattern already established in `use-effective-location.ts`.

## User Setup Required

None — no external service configuration required. No new environment variables, no new npm dependency (`git diff apps/admin/package.json` is empty).

## Next Phase Readiness

- Plan 10-11 can attach Accept/Reject/Cancel mutation flows directly to `OrderCard`'s existing disabled buttons — the button labels, `h-12` sizing, and `orders.accept.*`/`orders.reject.*`/`orders.cancel.*` copy keys are already in place, it only needs to remove `disabled` and wire `onClick`/Popover/AlertDialog.
- Plan 10-12 can wire the Order Detail Sheet using `orderDetailQuery` (already defined, unused by any component yet) and add the tap-to-open handler `OrderCard`'s card body currently lacks.
- Plan 10-13's browser smoke pass should specifically check: the sticky group-header offset (see "Things a reader might trip on"), dark-mode contrast on the new `bg-warning`/`bg-success` chips (first consumer of those tokens anywhere in the codebase), and the five distinct loading/empty/error states side by side.
- No blockers for the next plan.

## Self-Check: PASSED

All 7 created files verified present on disk; both commit hashes (`bb91d00`, `f9175ce`) verified present via `git log --oneline --all`.

---

_Plan: 10-admin-order-intake/10_
_Completed: 2026-08-16_
