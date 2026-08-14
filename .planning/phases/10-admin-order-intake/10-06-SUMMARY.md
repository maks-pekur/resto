---
phase: 10-admin-order-intake
plan: 06
subsystem: api
tags: [ordering, notifications, guest-loop, openapi, env-config]

# Dependency graph
requires:
  - phase: 10-admin-order-intake plan 01
    provides: orders.eta_at / orders.short_number columns and locations.timezone
  - phase: 10-admin-order-intake plan 03
    provides: OrderSnapshot.etaAt / shortNumber / cancelReason / canceledFromStatus / fulfillmentMode fields
provides:
  - Frozen public GET /v1/orders/:id/status contract (9 fields, no guest PII) reading eta_at instead of scheduledFor
  - Guest notification emails carrying a real ETA clock-time and a link back to the live tracker
  - White-label-safe brand-name fallback (loud error + skip-send instead of leaking 'RestOS')
  - WEBSITE_PUBLIC_URL env var (same declaration shape as ADMIN_WEB_URL)
affects:
  [
    'apps/website guest tracker rewrite (future plan) -- consumes the new frozen status contract and UI-SPEC S11',
    '10-07 and later plans that call Order.accept() and make order_accepted/order_ready emails live for the first time',
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Public capability-URL endpoint: freeze the response shape with a WHY-comment + set-equality contract test rather than authenticating an already-unguessable UUID'
    - 'Env var required-outside-dev via envSchema superRefine key-list, mirroring ADMIN_WEB_URL exactly'

key-files:
  created: []
  modified:
    - apps/api/src/contexts/ordering/interfaces/http/orders.controller.ts
    - apps/api/src/contexts/ordering/interfaces/http/orders.controller.spec.ts
    - apps/api/src/contexts/notifications/infrastructure/notification-order-drizzle.repository.ts
    - apps/api/src/contexts/notifications/application/send-guest-notification.service.ts
    - apps/api/src/contexts/notifications/application/send-guest-notification.service.spec.ts
    - apps/api/src/contexts/notifications/infrastructure/guest-email-templates.ts
    - apps/api/src/contexts/notifications/infrastructure/guest-email-templates.spec.ts
    - apps/api/src/config/env.schema.ts
    - apps/api/src/contexts/identity/domain/ports.ts
    - apps/api/test/unit/env.spec.ts
    - docs/api/openapi.yaml
    - packages/api-client/src/generated/api.ts
    - .env.example
    - .planning/phases/10-admin-order-intake/deferred-items.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - 'GET /v1/orders/:id/status stays @Public() -- the order UUID is treated as the capability token; the mitigation for growth risk is a frozen, minimal, set-equality-tested contract, not a second signed token (RESEARCH E.17)'
  - 'GuestEmailVars.statusUrl added in identity/domain/ports.ts, not notifications/domain/ports.ts -- the latter is a pure re-export shim and holds no type of its own; the plan file list named the wrong file for where GuestEmailVars actually lives'
  - "NotificationOrderRow gained locationTimezone via a leftJoin to schema.locations -- needed to format the guest email's ETA in the restaurant's local clock time (D-15), not just UTC"
  - 'WEBSITE_PUBLIC_URL is a single global origin (ADMIN_WEB_URL shape), not per-tenant -- apps/website resolves tenant via Host header per-request, so per-tenant custom-domain email links are a known, documented future gap, not solved here'

requirements-completed: [ORDINT-10]

# Metrics
duration: ~55min
completed: 2026-08-14
---

# Phase 10 Plan 06: Guest ETA Plumbing & Status Contract Freeze Summary

**The public order-status endpoint now returns the operator-set `eta_at` (never the guest's `scheduledFor`) through a frozen nine-field contract pinned by a set-equality test, and guest emails gained a real ETA clock-time plus a tracker link while the white-label `'RestOS'` fallback was replaced with a loud error.**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-08-14
- **Tasks:** 2 completed
- **Files modified:** 15 (10 plan-listed + 5 deviation-driven)

## Accomplishments

- `orders.controller.ts#getStatus()` maps `etaAt: snap.etaAt ? ... : null` instead of the old `eta: snap.scheduledFor ? ... : null` bug -- the two fields mean different things (`scheduledFor` is the guest's requested time, always null for ASAP orders) and are no longer conflated.
- `OrderStatusResponseSchema` is frozen at exactly nine fields (`status`, `shortNumber`, `orderNumber`, `total`, `currency`, `etaAt`, `fulfillmentMode`, `cancelReason`, `canceledFromStatus`) with a WHY-comment recording the deliberate capability-URL security posture (RESEARCH E.17) and no guest PII / internal operator identities.
- `orders.controller.spec.ts` gained a set-equality contract test (`Object.keys(result).sort()` against the frozen key list) plus cases proving `scheduledFor` set + `etaAt` null still returns `etaAt: null`, a canceled order returns its `cancelReason`/`canceledFromStatus`, and no PII field leaks even when present on the snapshot.
- `NotificationOrderRepository.findOrder()` now selects `eta_at`, `short_number`, and (via a new `leftJoin` to `locations`) the order's location timezone; `SendGuestNotificationService` formats `etaAt` as a localized 24h clock time (`Intl.DateTimeFormat`, falling back to UTC on a missing/invalid zone) and passes it into `vars.eta`, filling a template slot that has interpolated `${v.eta ? ... : ''}` since before this phase but was never actually populated.
- The `'RestOS'` white-label leak (`brand?.displayName ?? 'RestOS'`) is gone: a missing `brand.displayName` now logs at `error` level with `{ tenantId, brandId, orderId }` and skips the send entirely, rather than emailing a guest with the platform's own name.
- Every guest email now carries `vars.statusUrl` (built from the new `WEBSITE_PUBLIC_URL` env var, declared with the exact same required-outside-dev treatment as `ADMIN_WEB_URL`) and renders it as a labelled link ("Следить за заказом" / "Track your order") in both the HTML and plain-text bodies of all four notification kinds.
- `locale = 'ru'` is left exactly as-is with a WHY-comment pointing at Growth HIGH-11 / RESEARCH E.19 -- explicitly out of this phase's scope.

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix and freeze the public order-status contract** - `b240170` (feat)
2. **Task 2: Fill the guest email's ETA slot, fix the white-label fallback, and link back to the tracker** - `2db5959` (feat)

## Files Created/Modified

- `apps/api/src/contexts/ordering/interfaces/http/orders.controller.ts` - frozen `OrderStatusResponseSchema` (9 fields), `getStatus()` reads `etaAt` not `scheduledFor`
- `apps/api/src/contexts/ordering/interfaces/http/orders.controller.spec.ts` - set-equality contract test + 3 new regression cases
- `apps/api/src/contexts/notifications/infrastructure/notification-order-drizzle.repository.ts` - `NotificationOrderRow` gained `etaAt`/`shortNumber`/`locationTimezone`; `findOrder()` selects the new columns via a `leftJoin` to `schema.locations`
- `apps/api/src/contexts/notifications/application/send-guest-notification.service.ts` - `formatEtaClockTime()` helper, loud-error brandName guard, `statusUrl` construction, `ENV_TOKEN` injection
- `apps/api/src/contexts/notifications/application/send-guest-notification.service.spec.ts` - 5 new tests (ETA in vars, ETA absent, missing-displayName no-send + error log, statusUrl with/without `WEBSITE_PUBLIC_URL`)
- `apps/api/src/contexts/notifications/infrastructure/guest-email-templates.ts` - `STATUS_LINK_LABEL` map, `buildHtml`/`renderGuestEmail` render the status link in every template (HTML anchor + plain-text line)
- `apps/api/src/contexts/notifications/infrastructure/guest-email-templates.spec.ts` - 16 new tests covering ETA-line presence (4 eta-aware kind/locale combos) and status-link presence (all 8 kind/locale combos)
- `apps/api/src/config/env.schema.ts` - `WEBSITE_PUBLIC_URL` declared and added to the required-outside-dev list
- `apps/api/src/contexts/identity/domain/ports.ts` - `GuestEmailVars.statusUrl: string` added (deviation -- see below)
- `apps/api/test/unit/env.spec.ts` - 5 production-env fixtures updated with `WEBSITE_PUBLIC_URL` to keep passing after the new required var (deviation)
- `docs/api/openapi.yaml` / `packages/api-client/src/generated/api.ts` - scoped, hand-verified regeneration of only the `OrderStatusResponseDto` schema/type (deviation -- see below)
- `.env.example` - `WEBSITE_PUBLIC_URL` documented next to `ADMIN_WEB_URL`
- `.planning/phases/10-admin-order-intake/deferred-items.md` - logged the pre-existing wholesale `docs/api/openapi.yaml` drift discovered (not fixed) during Task 1
- `.planning/REQUIREMENTS.md` - `ORDINT-10` marked complete

## Decisions Made

- **Capability-URL posture locked**: `GET /v1/orders/:id/status` stays `@Public()`. The order UUID is treated as the bearer capability; the growth-risk mitigation (Skeptic MED-7) is the frozen, set-equality-tested nine-field contract, not a second signed token (RESEARCH E.17, recorded verbatim in the controller's WHY-comment).
- **`orderNumber: order.total` bug claimed by the plan was not found.** The plan's Task 2 action text said "the existing code passes `orderNumber: order.total`" and directed changing it to `order.shortNumber` if that bug were confirmed. Reading the actual file showed `vars.orderNumber` was already correctly `order.orderNumber` -- no bug present, so no change was made (the plan's own conditional language explicitly scoped this to "if that is a live bug").
- **`locationTimezone` added to `NotificationOrderRow`** via a `leftJoin` on `schema.locations`, not part of the plan's literal instruction but necessary to actually deliver "format in the order's location timezone when available, falling back to UTC" -- plan 10-04 (parallel sibling, not yet merged) was cited as the reference implementation but doesn't exist in this worktree, so a small self-contained implementation was written instead.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 -- blocking] `GuestEmailVars.statusUrl` belongs in `identity/domain/ports.ts`, not `notifications/domain/ports.ts`**

- **Found during:** Task 2, before writing any code
- **Issue:** The plan's file list and read_first section named `apps/api/src/contexts/notifications/domain/ports.ts` as "the file being modified — the `NotificationOrderRepository` row shape" and (implicitly, via the `vars` widening instruction) as the home of `GuestEmailVars`. Reading the actual file showed it is a two-line re-export shim (`export { EMAIL_ADAPTER_PORT } from '../../identity/domain/ports'; export type { EmailAdapterPort, SendGuestNotificationInput } from '../../identity/domain/ports';`) with no types of its own. `GuestEmailVars` (and `NotificationOrderRepository`/`NotificationOrderRow`) actually live in `identity/domain/ports.ts` and `notification-order-drizzle.repository.ts` respectively.
- **Fix:** Added `statusUrl: string` to `GuestEmailVars` in `identity/domain/ports.ts` (not in the plan's file list) and left `notifications/domain/ports.ts` untouched (correctly requiring no change).
- **Files affected:** `apps/api/src/contexts/identity/domain/ports.ts`
- **Verification:** `pnpm --filter api exec tsc --noEmit` clean; grep confirms zero blast radius beyond `guest-email-templates.ts`/`.spec.ts`.
- **Committed in:** `2db5959`

**2. [Rule 3 -- blocking] `env.spec.ts` fixtures needed `WEBSITE_PUBLIC_URL` after it joined the required-outside-dev list**

- **Found during:** Task 2, after adding `WEBSITE_PUBLIC_URL` to `env.schema.ts`'s `superRefine` required-key list per the plan's explicit instruction ("same guard treatment" as `ADMIN_WEB_URL`)
- **Issue:** 5 of `env.spec.ts`'s production-environment test fixtures (not in the plan's file list) construct a "complete" production env and assert `loadEnv()` succeeds, or assert a throw for a _different_, unrelated missing field. Adding a new required var broke the 5 fixtures that expected success (or a specific downstream check reached only after `envSchema.safeParse` succeeds).
- **Fix:** Added `WEBSITE_PUBLIC_URL: 'https://order.resto.app'` to exactly the 5 fixtures where its absence would change the test's outcome; left fixtures whose assertion is a substring match on an already-missing, unrelated field's message untouched (adding one more missing-var issue to those doesn't change whether the regex still matches).
- **Files affected:** `apps/api/test/unit/env.spec.ts`
- **Verification:** `npx vitest run test/unit/env.spec.ts` -- 21/21 green.
- **Committed in:** `2db5959`

**3. [Rule 1/3 -- scope-boundary-respecting fix] `docs/api/openapi.yaml` / `packages/api-client/src/generated/api.ts` regeneration**

- **Found during:** Task 1, running the standard `openapi:emit` + `api-client:gen` regeneration flow after changing `OrderStatusResponseSchema`
- **Issue:** A full regeneration produced a ~430-line diff to `docs/api/openapi.yaml` covering Phase 08.4/08.5 endpoints (`/v1/tenancy/locations`, `/v1/me/set-active-brand`, etc.) that were never regenerated+committed by their own landing plans -- pre-existing drift, unrelated to this plan.
- **Fix:** Ran the full regeneration in a throwaway pass to capture the exact `OrderStatusResponseDto` output, reverted the full file, then hand-applied only that scoped schema block (verified byte-identical to what the generator produces). Same approach for the api-client type. `git diff --stat` confirms each file's diff is now scoped to exactly the touched schema/type.
- **Files affected:** `docs/api/openapi.yaml`, `packages/api-client/src/generated/api.ts`
- **Verification:** `git diff docs/api/openapi.yaml` shows only the `OrderStatusResponseDto` block changed; `packages/api-client` `tsc --noEmit` clean.
- **Committed in:** `b240170`
- **Logged (not fixed):** the pre-existing wholesale drift is documented in `.planning/phases/10-admin-order-intake/deferred-items.md` per the Scope Boundary rule -- `pnpm openapi:check` remains red after this plan for the same pre-existing reasons it was red before.

---

**Total deviations:** 3 (all Rule 1/3 auto-fixes; none expand functional scope)
**Impact on plan:** All three were necessary to keep the repository compiling, its existing test suite green, and the OpenAPI artifact honest for this plan's own endpoint, without absorbing unrelated pre-existing debt into this plan's commits.

## Issues Encountered

- Worktree spawned from a stale base (confirmed and corrected per `<worktree_branch_check>` before any commits existed — see the executor's tool trace, not a plan-execution issue).
- Worktree had no `node_modules`/`.env` (both gitignored, not shared across git worktrees) — resolved via `pnpm install` + copying the root `.env`, mirroring 10-01/10-03's documented setup step.
- Initial test-spy attempt (`svc['logger']`) tripped `@typescript-eslint/dot-notation` in the pre-commit lint-staged hook; fixed by spying on `Logger.prototype.error` (from `@nestjs/common`) instead of reaching past the private field.

## User Setup Required

None — no external service configuration required. `WEBSITE_PUBLIC_URL` is optional in dev (same as `ADMIN_WEB_URL`) and only enforced outside `development`/`test`.

## Next Phase Readiness

- The public status contract is stable and frozen — the future `apps/website` guest-tracker rewrite (UI-SPEC §11, not part of this plan) can now consume `etaAt`/`shortNumber`/`fulfillmentMode`/`cancelReason`/`canceledFromStatus` directly instead of the old broken `eta` field. Note: `apps/website/lib/checkout-api.ts`'s hand-rolled `OrderStatusResponse` type (reads `.eta`) is now stale against the wire contract — this is the expected, anticipated handoff to that future plan, not a regression introduced silently; it is not fixed here because it is out of this plan's `files_modified` scope and its real fix is the full UI-SPEC §11 tracker rewrite, not a one-line rename.
- Guest emails are ready to carry a real ETA and tracker link the moment `Order.accept()` goes live on a real HTTP path (plan 10-07, per the plan's own `<interfaces>` note that `nats-guest-notification.subscriber.ts` already triggers `order_accepted`/`order_ready` off `OrderStatusChangedV1` and needed no changes here).
- No blockers for 10-07.

## Known Stubs

None. Both tasks wire real data end-to-end (DB columns → repository → service → email template / HTTP response); no hardcoded empty values or placeholder text were introduced.

## Threat Flags

None beyond what the plan's own `<threat_model>` already covers — no new network endpoints, auth paths, or schema changes were introduced (the `leftJoin` to `schema.locations` reads within the same tenant-scoped query the repository already ran, no new trust boundary).

## Self-Check: PASSED

- `apps/api/src/contexts/ordering/interfaces/http/orders.controller.ts` — FOUND
- `apps/api/src/contexts/ordering/interfaces/http/orders.controller.spec.ts` — FOUND
- `apps/api/src/contexts/notifications/infrastructure/notification-order-drizzle.repository.ts` — FOUND
- `apps/api/src/contexts/notifications/application/send-guest-notification.service.ts` — FOUND
- `apps/api/src/contexts/notifications/application/send-guest-notification.service.spec.ts` — FOUND
- `apps/api/src/contexts/notifications/infrastructure/guest-email-templates.ts` — FOUND
- `apps/api/src/contexts/notifications/infrastructure/guest-email-templates.spec.ts` — FOUND
- `apps/api/src/config/env.schema.ts` — FOUND
- `apps/api/src/contexts/identity/domain/ports.ts` — FOUND
- Commit `b240170` — FOUND in `git log --oneline --all`
- Commit `2db5959` — FOUND in `git log --oneline --all`

---

_Plan: 10-admin-order-intake/06_
_Completed: 2026-08-14_
