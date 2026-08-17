---
phase: 10-admin-order-intake
plan: 12
subsystem: ui

tags:
  [
    react,
    tanstack-query,
    radix-select,
    radix-alert-dialog,
    i18next,
    rbac,
    nestjs,
    refunds,
  ]

# Dependency graph
requires:
  - phase: 10-admin-order-intake plan 11
    provides: order-card.tsx's card face, ORDER_CANCEL_REASON_CODES + OrderCancelReasonCode (reject-popover.tsx), formatMoney (lib/utils.ts), orderDetailQuery/cancelOrderMutation (lib/queries/orders.ts)
  - phase: 10-admin-order-intake plan 05
    provides: the payment-derived refundability model (CTO HIGH-7 fix), the pending-row-before-Stripe-call restructure, RetryRefundService reusing the original refundRequestId
  - phase: 10-admin-order-intake plan 08
    provides: POST /v1/orders/:orderId/cancel and /refund/retry HTTP routes, GetOrderDetailService, the operator-orders.dto.ts response shapes this plan extends
provides:
  - 'GET /v1/me permissions field (Record<string,string[]>) computed via the existing computeEffectivePermissions -- closes UI-SPEC Open Question #4'
  - 'apps/admin/src/lib/hooks/use-permissions.ts -- usePermissions().can(resource, action) derived from the existing me query, zero extra fetches'
  - 'apps/admin/src/components/orders/order-detail-sheet.tsx -- the full 9-section order detail Sheet (UI-SPEC section 7), triggered by tapping the card body'
  - 'apps/admin/src/components/orders/cancel-dialog.tsx -- the buried, modal cancel confirmation naming the refund amount twice (UI-SPEC section 6)'
  - 'apps/admin/src/components/orders/refund-failed-banner.tsx -- the feed-level sticky banner with i18next plural forms'
  - 'GetOrderDetailService/OrderDetailResponseSchema extended with failedRefundAmount/failedRefundReason -- Rule 2 addition the plans own threat model (T-10-12-06) assumed existed'
  - 'apps/admin/src/lib/queries/orders.ts gains refundOrderMutation and retryRefundMutation'
  - 'apps/admin/test/setup.ts gains a jsdom pointer-capture polyfill (Rule 3 -- Radix Select is unusable in tests without it)'
affects:
  [
    '10-13 (browser smoke pass -- every claim below is typecheck/lint/build/unit-test verified only, not browser-verified)',
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Mutation variables are passed as the mutate() argument, never captured via component-state closure inside mutationFn -- a closure-capture attempt in cancel-dialog.tsx sent an empty reasonCode despite the confirm button correctly showing enabled, traced to TanStack Querys mutate() reading a stale mutationFn snapshot; reject-popover.tsx/accept-popover.tsx already followed this pattern, this plan makes it explicit'
    - 'The order-detail Sheets open/selected-order state lives at the orders.tsx route level (a single OrderDetailSheet + openOrder: OrderFeedRowApi | null), not one Sheet instance per card -- avoids N mounted Sheets and N detail queries'
    - 'The card body (header + item-summary rows) is wrapped in its own <button>, sibling to the action-button row, so tap-to-open-detail and the accept/reject/advance/retry buttons never fight over one onClick + stopPropagation'

key-files:
  created:
    - apps/api/src/contexts/identity/interfaces/http/me.controller.spec.ts
    - apps/admin/src/lib/hooks/use-permissions.ts
    - apps/admin/src/components/orders/order-detail-sheet.tsx
    - apps/admin/src/components/orders/order-detail-sheet.spec.tsx
    - apps/admin/src/components/orders/cancel-dialog.tsx
    - apps/admin/src/components/orders/cancel-dialog.spec.tsx
    - apps/admin/src/components/orders/refund-failed-banner.tsx
    - apps/admin/src/components/orders/refund-failed-banner.spec.tsx
    - apps/admin/src/components/orders/order-card-refund.spec.tsx
  modified:
    - apps/api/src/contexts/identity/interfaces/http/me.controller.ts
    - apps/api/src/contexts/ordering/application/get-order-detail.service.ts
    - apps/api/src/contexts/ordering/interfaces/http/operator-orders.dto.ts
    - apps/admin/src/lib/queries/identity.ts
    - apps/admin/src/lib/queries/orders.ts
    - apps/admin/src/lib/utils.ts
    - apps/admin/src/lib/i18n/messages/ru.json
    - apps/admin/src/lib/i18n/messages/en.json
    - apps/admin/src/components/orders/order-card.tsx
    - apps/admin/src/components/orders/reject-popover.tsx
    - apps/admin/src/components/orders/reject-popover.spec.tsx
    - apps/admin/src/routes/(protected)/$brandSlug/orders.tsx
    - apps/admin/test/setup.ts
  deleted:
    - apps/api/test/unit/identity/me.controller.spec.ts

key-decisions:
  - 'me.controller.spec.ts consolidated to the co-located src/ convention (matching stripe-webhook.controller.spec.ts and orders.controller.spec.ts), replacing the pre-existing apps/api/test/unit/identity/me.controller.spec.ts which tested the old synchronous, no-permissions signature and would otherwise have broken'
  - 'Retry never sends a client body. Plan 10-12s own action text and acceptance criteria assumed the client passes refundRequestId in the retry POST body; reading the actual 10-08-built order-cancel.controller.ts shows the route takes NO body at all -- the server resolves refundRequestId itself via PAYMENT_REPOSITORY.findFailedRefundsForOrders. The client sending nothing is strictly safer (it cannot even attempt to forge/mismatch the idempotency key), so retryRefundMutation was built to match the real contract, not the plans stale assumption.'
  - 'GetOrderDetailService/OrderDetailResponseSchema extended with two new nullable fields (failedRefundAmount, failedRefundReason) sourced from the same findFailedRefundsForOrders call GetOrderDetailService already makes for hasFailedRefund. This is additive, read-only, and no new authorization surface -- done because the plans own threat model (T-10-12-06) explicitly assumes failureReason renders inside the admin Sheet, and the acceptance criteria requires it; without this the Sheets detail-level banner would have nothing to show.'
  - 'The discretionary refund sections remaining-to-refund default and hint use detail.total (the order total), not an actual remaining-balance figure -- GetOrderDetailService/OrderDetailResponse has no already-refunded-amount field. This is the same fallback reasoning 10-11 used for the cancel toast (order total is the guaranteed-correct value when nothing else is available); a future plan extending the detail endpoint with a true remaining-balance figure would let this be exact for orders with prior partial refunds.'
  - 'apps/admin/test/setup.ts gained hasPointerCapture/setPointerCapture/releasePointerCapture/scrollIntoView jsdom stubs (Rule 3, mirroring the existing ResizeObserver stub) -- Radix Select throws on click in jsdom without them; discovered while writing cancel-dialogs required-reason test.'
  - 'cancel-dialog.tsx passes the selected reason code as the mutate() argument (mutationFn: (code) => ...) rather than closing over component state inside mutationFn -- the closure-capture version silently sent reasonCode: "" despite the confirm button showing correctly enabled, because TanStack Querys mutate() call used the mutationFn snapshot from a stale render. Fixed and generalized as the pattern note above.'

requirements-completed: [ORDINT-05, ORDINT-06, ORDINT-07]

# Metrics
duration: ~180min
completed: 2026-08-17
---

# Phase 10 Plan 12: Order Detail Sheet, Cancel Confirmation, Owner Refund, Refund-Failure Surface Summary

**The order detail Sheet (9 UI-SPEC sections, card-body-triggered), a buried modal cancel confirmation that repeats the refund amount in both its description and confirm button, an owner-only discretionary refund form, and a three-surface refund-failure indicator (feed banner, undimmed card, Sheet banner) all wired against `GET /v1/me`'s new server-computed `permissions` field so the client gates on the exact strings the server enforces.**

## Performance

- **Duration:** ~180 min (commit span a1ac910→3a2f95c; includes environment-clock date rollover mid-session, not continuous idle time)
- **Completed:** 2026-08-17
- **Tasks:** 3 completed
- **Files modified:** 23 (9 created, 13 modified, 1 deleted)

## Accomplishments

- **UI-SPEC Open Question #4 closed.** `GET /v1/me` now returns `permissions: Record<string, string[]>`, computed via the pre-existing `computeEffectivePermissions(memberRoleCsv, customRoleLookup)` (the same helper `AssignRoleService`/`LocationPermissionChecker` already use) — no second permission-computation path was written. `apps/admin/src/lib/hooks/use-permissions.ts` exposes `usePermissions().can(resource, action)`, reading the already-fetched `me` query (zero additional network calls, confirmed by `grep -c "meQuery|useQuery"`).
- **`order-detail-sheet.tsx`** — a `Sheet` (`side="right"`, `sm:max-w-lg`) triggered by tapping the card body (a dedicated `<button>` wrapping the header + item-summary rows, sibling to — not wrapping — the action-button row, so no `stopPropagation` gymnastics were needed). Renders, top to bottom: conditional refund-failed banner, header (daily number + status chip + time-in-state chip + muted `font-mono` internal order number, the ONLY place that number appears in the admin UI), the contextual status-advance button, fulfillment info, guest contact (`tel:` link for phone), items + modifiers + totals breakdown, a timeline stepper built from every per-state timestamp plan 10-01 added, an owner-only discretionary refund form, and a footer holding the cancel trigger behind a `Separator`.
- **`cancel-dialog.tsx`** — outline `text-destructive` trigger (never solid), an `AlertDialog` with a required `Select` (not chips) sourced from plan 10-11's exported `ORDER_CANCEL_REASON_CODES`/`REASON_LABEL_KEYS` (newly exported, not redefined — `grep -n "kitchen_out_of_stock"` on this file returns 0 matches), and a confirm button carrying an explicit `h-12` plus the same formatted amount as the description (`"Отменить и вернуть {{amount}}"`), proven equal by a component test. No amount/partial-refund control exists anywhere in this flow (`grep -c "amountMinor|partial"` → 0).
- **Discretionary refund** — rendered only when `can('billing', 'update')` is true; when absent, the section is omitted from the render tree entirely (not disabled), proven by a component test asserting `queryByText`/`queryByLabelText` return null, not merely a `disabled` attribute check.
- **Refund-failure surface, three levels, all sourced from the same `hasFailedRefund`/`payment_refunds` fact:**
  1. **Feed banner** (`refund-failed-banner.tsx`) — sticky, uses all three Russian i18next plural forms (`refundBanner_one/_few/_many`), proven by a component test asserting each exact rendered string for count 1/2/5. Its "Показать" action sets the feed's status filter to `refund_failed`.
  2. **Card-level** — already-existing `bg-destructive/10` non-dimming + `OrderRefundFailedBadge` (built in 10-10) now paired with a real retry button (was a disabled placeholder), gated on `can('order', 'cancel')`.
  3. **Detail-level** — a `bg-destructive/10 border-destructive` banner pinned above even the Sheet header, reusing `common.retry` rather than a third retry-label variant, with the raw `failureReason` in small muted text below (never guest-facing — confirmed no such contract exists in the frozen public status shape).
- **Retry wiring, and a real deviation from the plan's own text.** `retryRefundMutation` posts to `/v1/orders/:orderId/refund/retry` with **no body at all** — reading the actual 10-08-built `order-cancel.controller.ts` shows the server resolves `refundRequestId` itself via `PAYMENT_REPOSITORY.findFailedRefundsForOrders`, never accepting one from the client. The plan's action text and one acceptance criterion assumed the client would pass `refundRequestId` in the body; that assumption does not match the shipped 10-08 contract. Built against the real contract, which is the strictly safer design.
- **`GetOrderDetailService`/`OrderDetailResponseSchema` extended** (Rule 2) with `failedRefundAmount`/`failedRefundReason`, sourced from the same `findFailedRefundsForOrders` call the service already makes for `hasFailedRefund` — additive, read-only, no new authorization surface. Without this the Sheet's detail-level banner would have had no amount or reason to show, and the plan's own threat model (T-10-12-06) explicitly assumes this data is renderable inside the admin Sheet.
- **Zero new npm dependencies.** `git diff apps/admin/package.json` is empty. `admin:build` succeeds (859 KB main chunk, pre-existing size-warning territory, unrelated to this plan).

## Task Commits

Each task was committed atomically:

1. **Task 1: Surface effective permissions on /v1/me and gate the client on them** - `a1ac910` (feat)
2. **Task 2: Order detail Sheet with the cancel dialog and the owner-only refund control** - `b27e0e9` (feat)
3. **Task 3: Three-level refund-failure surface with one-click retry** - `3a2f95c` (feat)

## Files Created/Modified

- `apps/api/src/contexts/identity/interfaces/http/me.controller.ts` - async `me()`, `permissions` field via `computeEffectivePermissions` + raw `member.role` CSV lookup + `listActiveCustomRoles`
- `apps/api/src/contexts/identity/interfaces/http/me.controller.spec.ts` (new) - 9 tests: owner billing set, cashier-foh custom-role merge, bare staff no-order-key, customer/anonymous/no-tenant empty-permissions short-circuits (no DB call), activeBrandId/baseRole projection
- `apps/api/test/unit/identity/me.controller.spec.ts` (deleted) - superseded by the co-located spec above; tested the old sync/no-permissions signature
- `apps/admin/src/lib/queries/identity.ts` - `permissions?: Record<string, readonly string[]>` added to `MeResponse`
- `apps/admin/src/lib/hooks/use-permissions.ts` (new) - `usePermissions().can(resource, action)`
- `apps/admin/src/components/orders/order-detail-sheet.tsx` (new) - the 9-section Sheet, refund-failed banner, status-advance button, discretionary refund form, cancel footer
- `apps/admin/src/components/orders/order-detail-sheet.spec.tsx` (new) - 5 tests: refund-section absence/presence by permission, cancel-trigger absence, orderNumber-appears-once + no delivery-in-transit language, section DOM order
- `apps/admin/src/components/orders/cancel-dialog.tsx` (new) - the buried modal cancel confirmation
- `apps/admin/src/components/orders/cancel-dialog.spec.tsx` (new) - 4 tests: amount parity between description and confirm button, disabled-until-reason-chosen, mutation payload on confirm, no amount input anywhere
- `apps/admin/src/components/orders/refund-failed-banner.tsx` (new) - feed-level sticky banner
- `apps/admin/src/components/orders/refund-failed-banner.spec.tsx` (new) - 5 tests: zero-count renders nothing, all three RU plural forms, "Показать" callback
- `apps/admin/src/components/orders/order-card-refund.spec.tsx` (new) - 4 tests: undimmed terminal card + retry button present, retry button absent without permission, failed retry leaves badge+button on screen, retry call carries no body
- `apps/admin/src/components/orders/order-card.tsx` - card-body tap-to-open-detail button, exported `OrderCardStateSource`/`AGE_BAND_CLASS`, wired real retry mutation (was a disabled placeholder), `onOpenDetail` prop
- `apps/admin/src/components/orders/reject-popover.tsx` - exported `REASON_LABEL_KEYS` for `cancel-dialog.tsx` reuse
- `apps/admin/src/components/orders/reject-popover.spec.tsx` - `onOpenDetail` prop added to its two `OrderCard` render sites (ripple from the new required prop)
- `apps/admin/src/lib/queries/orders.ts` - `refundOrderMutation`, `retryRefundMutation` (no-body), `OrderDetailApi` gains `failedRefundAmount`/`failedRefundReason`
- `apps/admin/src/lib/utils.ts` - `toMinorUnits()` (mirrors the server's `money-utils.ts` 2-decimal-exponent logic)
- `apps/admin/src/lib/i18n/messages/ru.json`/`en.json` - `detail.tableIdentifierLabel`/`detail.scheduledForLabel` (Rule 2 — UI-SPEC's copy deck has no key for either)
- `apps/admin/src/routes/(protected)/$brandSlug/orders.tsx` - `openOrder` state + single page-level `OrderDetailSheet`, `refundFailedCountQuery` (`statusFilter: 'refund_failed'`, independent of the active status filter), `RefundFailedBanner` mount
- `apps/admin/test/setup.ts` - pointer-capture + `scrollIntoView` jsdom stubs (Rule 3)
- `apps/api/src/contexts/ordering/application/get-order-detail.service.ts` - `OrderDetailResult` gains `failedRefundAmount`/`failedRefundReason`
- `apps/api/src/contexts/ordering/interfaces/http/operator-orders.dto.ts` - `OrderDetailResponseSchema`/`toOrderDetailResponse` extended to match

## Decisions Made

See `key-decisions` in the frontmatter for the full list with rationale. Summary:

- `me.controller.spec.ts` consolidated to the co-located convention, replacing (not duplicating) the stale pre-existing test.
- Retry sends no body — matches the real 10-08 contract, not the plan's stale assumption.
- `GetOrderDetailService`/detail DTO extended with two new nullable fields (Rule 2), unblocking both an acceptance criterion and the plan's own threat-model assumption.
- Discretionary refund's default/hint amount uses `detail.total` (no remaining-balance field exists yet).
- jsdom pointer-capture polyfill added (Rule 3, mirrors the existing ResizeObserver precedent).
- Mutation variables passed as `mutate()` arguments, not captured via closure — fixes a real bug found while testing, generalized as this plan's pattern note.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — bug] `cancel-dialog.tsx`'s confirm mutation sent an empty `reasonCode` despite the button showing enabled**

- **Found during:** Task 2, first test run of `cancel-dialog.spec.tsx`'s "confirming fires cancelOrderMutation..." case.
- **Issue:** `useMutation({ mutationFn: () => cancelOrderMutation(..., { reasonCode: reasonCode as OrderCancelReasonCode }) })` closed over component state instead of taking it as the `mutate()` argument. The confirm button correctly reflected `reasonCode !== ''` (not-disabled assertion passed), but the actual POST body carried `reasonCode: ""` — the `mutate()` call used a stale `mutationFn` snapshot.
- **Fix:** Changed to `mutationFn: (selectedReasonCode: OrderCancelReasonCode) => cancelOrderMutation(..., { reasonCode: selectedReasonCode })` and `mutation.mutate(reasonCode)` at the call site, matching the pattern `reject-popover.tsx`/`accept-popover.tsx` already used.
- **Files affected:** `apps/admin/src/components/orders/cancel-dialog.tsx`
- **Verification:** `cancel-dialog.spec.tsx` 4/4 green after the fix.
- **Committed in:** `b27e0e9` (Task 2)

**2. [Rule 3 — blocking] jsdom lacks the pointer-capture APIs Radix `Select` needs**

- **Found during:** Task 2, `cancel-dialog.spec.tsx`'s reason-selection tests threw `target.hasPointerCapture is not a function`.
- **Issue:** jsdom 25 (this repo's test DOM) has no `hasPointerCapture`/`setPointerCapture`/`releasePointerCapture`/`scrollIntoView`; Radix `Select`'s pointer-event handlers call them unconditionally.
- **Fix:** Added no-op stubs to `Element.prototype` in `test/setup.ts`, mirroring the existing `ResizeObserver` stub precedent (08.4-05's deviation for the same class of jsdom gap).
- **Files affected:** `apps/admin/test/setup.ts`
- **Verification:** `cancel-dialog.spec.tsx` reason-Select interactions pass; full `admin:test` suite (83/83) green.
- **Committed in:** `b27e0e9` (Task 2)

**3. [Rule 3 — blocking, ripple] `order-card.tsx`'s new required `onOpenDetail` prop broke two existing `<OrderCard>` render sites in `reject-popover.spec.tsx`**

- **Found during:** Task 2, `tsc --noEmit` after adding the card-body tap handler.
- **Issue:** `reject-popover.spec.tsx` (not in this plan's `files_modified` list) renders `<OrderCard>` directly in two tests; the new required `onOpenDetail` prop broke both call sites.
- **Fix:** Added `onOpenDetail={vi.fn()}` to both.
- **Files affected:** `apps/admin/src/components/orders/reject-popover.spec.tsx`
- **Verification:** `tsc --noEmit` clean; `reject-popover.spec.tsx` 4/4 green.
- **Committed in:** `b27e0e9` (Task 2)

**4. [Rule 2 — missing critical functionality] `GetOrderDetailService`/`OrderDetailResponseSchema` had no field for a failed refund's amount or reason**

- **Found during:** Task 3, wiring the Sheet's detail-level refund-failure banner (`orders.refund.failedBanner: "Возврат {{amount}} не прошёл."` + muted `failureReason` text).
- **Issue:** `OrderDetailResult`/`OrderDetailResponseSchema` exposed only `hasFailedRefund: boolean` — no amount, no reason. The plan's interfaces section and threat model (T-10-12-06) both assume this data is available to the admin Sheet; it was not, in the actual 10-07/10-08-built code.
- **Fix:** `GetOrderDetailService.execute()` now also reads `failedRefunds[0]?.amount`/`failedRefunds[0]?.failureReason` from the `findFailedRefundsForOrders` call it already makes (no new query), and surfaces them as `failedRefundAmount`/`failedRefundReason` (both `string | null`) through `OrderDetailResult` → `OrderDetailResponseSchema` → the admin's `OrderDetailApi`. Purely additive, read-only, no new authorization surface — the same tenant/brand/location scoping `GetOrderDetailService` already enforces covers these two new fields.
- **Files affected:** `apps/api/src/contexts/ordering/application/get-order-detail.service.ts`, `apps/api/src/contexts/ordering/interfaces/http/operator-orders.dto.ts`, `apps/admin/src/lib/queries/orders.ts` (`OrderDetailApi`)
- **Verification:** `api:typecheck`/`api:lint` clean; `order-routes-authz.e2e.spec.ts` (9/9) and `order-feed-query.e2e.spec.ts` (9/9) re-run in isolation, both green; no existing test asserted the detail response's exact shape.
- **Committed in:** `3a2f95c` (Task 3)

---

**Total deviations:** 4 (1 Rule 1 bug fix, 2 Rule 3 blocking fixes, 1 Rule 2 missing-functionality addition).
**Impact on plan:** All four are either mechanically necessary (Rules 1/3) or strictly close a gap the plan's own threat model and acceptance criteria depended on (Rule 4). No feature was added beyond what `<success_criteria>` requires.

## Acceptance criteria not literally satisfied (per the executor's acceptance-criteria-caveat)

- **`grep -n "refundRequestId" apps/admin/src/lib/queries/orders.ts`** — does not match. The plan's action text and this criterion both assume the client passes `refundRequestId` in the retry POST body. Reading the actual 10-08-built `order-cancel.controller.ts` shows the retry route (`POST /:orderId/refund/retry`) has no `@Body()` parameter at all — the server resolves `refundRequestId` itself via `PAYMENT_REPOSITORY.findFailedRefundsForOrders`. `retryRefundMutation` therefore sends no body, which is a strictly safer design (the client cannot even attempt to supply a forged or mismatched idempotency key). Contorting the client to send a `refundRequestId` the server ignores would add a fake field with no function. See `order-card-refund.spec.tsx`'s "no client-supplied refundRequestId" test, which asserts the actual POST call carries no body.

## Issues Encountered

- Same environment-setup pattern as every prior Phase 10 plan: this worktree had no `node_modules` (gitignored, not shared across worktrees) — resolved via `pnpm install`.
- The full `apps/api:e2e` suite (`vitest run test/e2e`, all 64 files in one process) produced 20 file failures when run via `nx run api:e2e -- order-routes-authz` — this is the documented pre-existing 429/timeout contention gotcha (per project memory), NOT caused by this plan. Confirmed by re-running the specific specs directly (`pnpm exec vitest run test/e2e/order-routes-authz.e2e.spec.ts test/e2e/order-cancel-refund.e2e.spec.ts test/e2e/order-feed-query.e2e.spec.ts`) in isolation: 27/27 green, none of the full-suite failures (set-active-brand, signup-enumeration, stripe-webhook-inbox-dedup, tenancy-erasure, tenants-controller) touch orders/payments detail code at all.
- The `nx run api:e2e -- <pattern>` invocation does not filter to a single spec — nx's fixed `vitest run test/e2e` command plus an appended positional arg is treated by vitest as an additional OR-pattern, not a narrowing filter, so it still collects the whole `test/e2e` directory. Running `pnpm exec vitest run test/e2e/<file>.e2e.spec.ts` directly inside `apps/api` is the reliable way to isolate one e2e file.

## User Setup Required

None — no external service configuration required. No new environment variables, no new npm dependency (`git diff apps/admin/package.json` is empty).

## Next Phase Readiness

- Plan 10-13 (browser smoke pass) should specifically verify: the Sheet opens on card-body tap without any action button on the card also triggering it; the cancel `AlertDialog`'s required-`Select` interaction feels right on a real touch device (jsdom's pointer-capture stubs only prove it's _possible_, not that it feels correct); the discretionary refund section's omit-vs-disable behavior for a real cashier session; and the three refund-failure surfaces rendering simultaneously and clearing together after a successful retry.
- `GetOrderDetailService`'s new `failedRefundAmount`/`failedRefundReason` fields are available for any future plan that wants a more precise "remaining refundable amount" default in the discretionary refund form (currently falls back to `detail.total`).
- No blockers for 10-13.

## Self-Check: PASSED

All 9 created files verified present via `git ls-files`; the superseded `apps/api/test/unit/identity/me.controller.spec.ts` verified removed from tracked files; all 3 commit hashes (`a1ac910`, `b27e0e9`, `3a2f95c`) verified present via `git log --oneline --all`.

---

_Plan: 10-admin-order-intake/12_
_Completed: 2026-08-17_
