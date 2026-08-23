---
phase: 10-admin-order-intake
plan: 09
subsystem: ui
tags:
  [
    next-intl,
    i18n,
    checkout,
    order-tracking,
    gdpr-consent,
    react-hook-form,
    zod,
  ]

# Dependency graph
requires:
  - phase: 10-admin-order-intake plan 04
    provides: CreateOrderInputSchema.marketingConsent (boolean, default false) + server-set marketingConsentAt
  - phase: 10-admin-order-intake plan 06
    provides: Frozen 9-field GET /v1/orders/:id/status contract (etaAt, shortNumber, fulfillmentMode, cancelReason, canceledFromStatus)
provides:
  - Marketing-consent checkbox in checkout, unchecked by default, boolean-only client payload
  - Guest order tracker that polls past 'paid' and renders accepted/preparing/ready (D-16 fix)
  - Fully localized (ru/uk/en) checkout.status.* and checkout.consent.* namespaces
  - Guest-safe cancel-reason -> phrase mapping (never the operator chip label, never the raw code)
affects:
  [
    'Phase 12 CRM -- marketingConsent/marketingConsentAt is the lawful-basis record any future mailing list must read',
    'any future plan touching apps/website/components/checkout/order-status-poller.tsx or checkout-api.ts OrderStatusResponse',
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'react-hook-form 3-generic useForm<Input, Context, TransformedValues> split for zod schemas using .default() -- z.input vs z.output diverge and the 2-generic form no longer type-checks on react-hook-form 7.55+/zodResolver v5'
    - 'Recursive self-scheduling setTimeout poll loop with a ref-stored immediate-retry closure, so a manual retry button and the automatic per-status cadence share one poll implementation without a second timer'

key-files:
  created:
    - apps/website/components/ui/checkbox.tsx
  modified:
    - apps/website/lib/checkout-schema.ts
    - apps/website/lib/checkout-api.ts
    - apps/website/components/checkout/checkout-form.tsx
    - apps/website/components/checkout/order-status-poller.tsx
    - apps/website/test/order-status-poller.spec.tsx
    - apps/website/messages/ru.json
    - apps/website/messages/uk.json
    - apps/website/messages/en.json

key-decisions:
  - 'useForm<CheckoutFormInput, unknown, CheckoutFormValues> (3-generic split) resolves the zod .default() input/output type mismatch that a plain useForm<CheckoutForm> could not typecheck against'
  - "'failed' status renders its own payment-failed card (retry -> /checkout), never the declined/canceled copy -- markFailed() only fires pre-acceptance from a Stripe-side failure, so blaming the restaurant would misattribute a payment-gateway problem"
  - "'created'/'requires_action' render a dedicated awaiting-payment state, not the 4-step tracker with an empty first step -- showing an unfilled 'Оплачен' circle before payment even exists would be misleading"
  - "'refunded' kept in TERMINAL_STATUSES defensively (own terminal-card branch) even though refund() never writes order.status per order.aggregate.ts's own comment -- exhaustiveness over the OrderStatus union, not a live path"
  - 'Location block (name/address/route link/phone) from UI-SPEC S11 intentionally NOT built -- the frozen 9-field status contract carries no location data; adding it would require reopening the plan-10-06-frozen contract, out of this plan scope'
  - "Added 2 extra keys beyond UI-SPEC's copy deck (status.awaitingPayment, status.paymentFailedTitle/Retry) to cover the pre-payment and payment-failure states the copy deck did not address -- Rule 2, without them the guest sees nothing or a misattributed message"

requirements-completed: [ORDINT-10]

# Metrics
duration: ~40min
completed: 2026-08-15
---

# Phase 10 Plan 09: Guest Checkout Consent & Live Status Tracker Summary

**Checkout now captures an unchecked-by-default marketing-consent boolean that reaches `POST /v1/orders`, and the guest status tracker (previously stopping at `paid`, per the D-16 bug) now polls through accepted/preparing/ready with a localized 4-step tracker, operator-set ETA, and a guest-safe declined/canceled terminal card — fully in Russian/Ukrainian/English.**

## Performance

- **Duration:** ~40 min
- **Completed:** 2026-08-15
- **Tasks:** 2 completed
- **Files modified:** 9 (7 plan-listed + 1 net-new shadcn component + 1 ripple-effect test file)

## Accomplishments

- `apps/website/components/ui/checkbox.tsx` added via `npx shadcn add checkbox`, verified to import from the already-installed `radix-ui` umbrella package (matches `radio-group.tsx`) with an empty `package.json`/`pnpm-lock.yaml` diff — no new npm dependency.
- `createCheckoutSchema` gained `marketingConsent: z.boolean().default(false)`; `checkout-form.tsx` renders it unchecked in the same contact-info step as name/phone/email and threads `marketingConsent: values.marketingConsent` into `createOrder({...})`. No consent timestamp is ever sent by the client (`grep -ci "consentAt|consentTimestamp"` returns 0) — the server sets `marketingConsentAt` per plan 10-04.
- Fixed a genuine TS compile error the plan's literal instruction produced: `z.boolean().default(false)` diverges the schema's input type (optional) from its output type (required), which a plain `useForm<CheckoutFormValues>` cannot typecheck against react-hook-form 7.55+/`@hookform/resolvers` v5's stricter resolver generics. Resolved via the 3-generic `useForm<CheckoutFormInput, unknown, CheckoutFormValues>` split (`z.input` for form state, `z.output` for the parsed submit payload) — the officially recommended pattern for this react-hook-form version, not a workaround.
- `OrderStatusResponse` in `checkout-api.ts` updated to the frozen 9-field contract (`status`, `shortNumber`, `orderNumber`, `total`, `currency`, `etaAt`, `fulfillmentMode`, `cancelReason`, `canceledFromStatus`), replacing the stale `eta?: string | null` shape.
- `order-status-poller.tsx` fully rewritten per UI-SPEC S11: `TERMINAL_STATUSES` is now exactly `{completed, canceled, refunded, failed}` — `'paid'` removed, the single most important line in this plan (D-16) — with a WHY-comment; per-status poll cadence (`created`/`requires_action` 2s, `paid` 5s, `accepted`/`preparing` 15s, `ready` 30s); a 4-step tracker (Оплачен → Принят → Готовится → Готов к выдаче/Готово, the last label swapping on `fulfillmentMode`, delivery reusing the pickup label — no dispatch step, per Skeptic HIGH-6); an ETA row that only ever renders the operator-set `etaAt` clock time, never a fabricated one; a Display-size `№{shortNumber}` replacing the dropped internal `orderNumber`; a guest-safe declined/canceled terminal card (heading keyed off `canceledFromStatus === 'paid'`, reason mapped through the 7-code UI-SPEC S12 table, refund line, back-to-menu CTA); a reconnect affordance (`updating` during in-flight polls, `updateFailed` + `retry` on failure, stale status kept visible); and full `useTranslations()` wiring with zero hardcoded English remaining.
- Every `checkout.status.*` / `checkout.consent.*` key from UI-SPEC S12 added verbatim in Russian to all three locale files, with real (not copied) Ukrainian and English translations, plus 2 additional keys (`awaitingPayment`, `paymentFailedTitle`/`paymentFailedRetry`) covering two states the copy deck was silent on (see Decisions).
- `pnpm --filter website exec tsc --noEmit`, `lint`, `test` (60/60), and `build` all verified green; `git diff apps/website/package.json` empty.

## Task Commits

Each task was committed atomically:

1. **Task 1: Marketing-consent checkbox at checkout with its write path** - `9b89985` (feat)
2. **Task 2: Rewrite the guest status tracker** - `aa6ac74` (feat)

## Files Created/Modified

- `apps/website/components/ui/checkbox.tsx` - net-new shadcn Checkbox primitive (radix-ui umbrella import), prettier-formatted to repo conventions
- `apps/website/lib/checkout-schema.ts` - `marketingConsent` field + `CheckoutFormInput`/`CheckoutForm` (z.input/z.output) type split
- `apps/website/lib/checkout-api.ts` - `CreateOrderInput.marketingConsent?: boolean`; `OrderStatusResponse` rewritten to the frozen 9-field contract
- `apps/website/components/checkout/checkout-form.tsx` - consent `FormField` (Checkbox), `marketingConsent: false` default, 3-generic `useForm`, `useTranslations('checkout')` for the new field's copy
- `apps/website/components/checkout/order-status-poller.tsx` - full rewrite: exhaustive status→step map, per-status cadence, 4-step tracker, ETA row, declined/canceled terminal card, reconnect affordance, i18n
- `apps/website/test/order-status-poller.spec.tsx` - rewritten to the new 9-field fixture shape and new component behavior, incl. an explicit D-16 regression test (`keeps polling past paid`)
- `apps/website/messages/{ru,uk,en}.json` - `checkout.consent.*` + `checkout.status.*` namespaces (17 keys × 3 locales)

## Decisions Made

- `useForm<CheckoutFormInput, unknown, CheckoutFormValues>` (3-generic split) — see key-decisions above; this is a compile-time necessity introduced by the plan's own literal `.default(false)` instruction, not a design choice.
- `'failed'` status gets its own payment-failed card, distinct from the declined/canceled copy — `markFailed()` only fires pre-acceptance on a Stripe-side failure (see `order.aggregate.ts`), so using "Ресторан не смог принять ваш заказ" would misattribute a card decline to the restaurant.
- `'created'`/`'requires_action'` render a dedicated small awaiting-payment message rather than the 4-step tracker with an empty first step, since payment hasn't actually happened yet.
- Guest location block (name/address/route/phone) from UI-SPEC S11 was **not** built: the frozen 9-field status contract (plan 10-06) carries no location data, and adding it would mean reopening that frozen contract — explicitly out of this plan's scope. Documented as a known gap below, not silently dropped.
- 2 extra copy-deck keys added beyond UI-SPEC S12 (Rule 2 — missing critical functionality: without them a pre-payment or payment-failed guest sees nothing or a misattributed message).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - blocking] `useForm<CheckoutFormValues>` did not typecheck after adding `marketingConsent: z.boolean().default(false)`**

- **Found during:** Task 1, `pnpm --filter website exec tsc --noEmit`
- **Issue:** The plan's literal instruction (`z.boolean().default(false)`) makes the schema's input type optional but its output (`z.infer`) type required. react-hook-form 7.55+/`@hookform/resolvers` v5's resolver generics require the form's `TFieldValues` to match the resolver's _input_ type; `useForm<CheckoutFormValues>` (the output type) produced 6 cascading `Control`/`Resolver` type errors across every `FormField` in the file.
- **Fix:** Exported `CheckoutFormInput = z.input<...>` alongside the existing `CheckoutForm = z.infer<...>` (output) type; switched to `useForm<CheckoutFormInput, unknown, CheckoutFormValues>` — the 3-generic signature react-hook-form added precisely for this input/output split. `handleSubmit`'s callback now correctly receives the parsed, non-optional `marketingConsent: boolean`.
- **Files modified:** `apps/website/lib/checkout-schema.ts`, `apps/website/components/checkout/checkout-form.tsx`
- **Verification:** `pnpm --filter website exec tsc --noEmit` clean; `checkout-form.spec.tsx` 7/7 green (schema-level tests unaffected).
- **Committed in:** `9b89985`

**2. [Rule 3 - blocking] Rewriting `order-status-poller.tsx` broke its existing spec file**

- **Found during:** Task 2, `pnpm --filter website exec tsc --noEmit` after the component rewrite
- **Issue:** `test/order-status-poller.spec.tsx` (not in the plan's file list) constructed the old 5-field `OrderStatusResponse` shape and asserted on removed copy ("Confirming payment…", "Payment confirmed"). Both the type and the behavior it tested no longer exist.
- **Fix:** Rewrote the spec against the new 9-field fixture shape and the rewritten component's branches (awaiting-payment, tracker + ETA, payment-failed, declined, canceled-post-accept, reconnect/retry), including an explicit regression test proving polling continues past `paid` (`getOrderStatus` called after a 5s tick from a `paid` fixture) — directly proving the D-16 fix, not just re-testing old behavior.
- **Files modified:** `apps/website/test/order-status-poller.spec.tsx`
- **Verification:** `pnpm --filter website test` — 60/60 green (11/11 in this file).
- **Committed in:** `aa6ac74`

**3. [Rule 1 - bug] Two acceptance-criteria grep false-positives self-corrected before commit**

- **Found during:** Task 2, running the plan's own acceptance-criteria grep checks against the first draft
- **Issue:** A WHY-comment using the phrase "the instant payment confirmed" tripped the `grep -Eci "Confirming|Payment confirmed|Try again"` hardcoded-English check, and another WHY-comment naming "dispatch"/quoting "on its way" (explaining why there is _no_ dispatch step) tripped the `grep -Eci "on its way|...|dispatch|курьер"` check. Both are code comments, not guest-facing copy, but the acceptance criteria are literal substring greps.
- **Fix:** Reworded both comments to preserve the same WHY rationale without the trigger substrings (e.g. "the moment Stripe settled" instead of "payment confirmed"; "fulfillment tracking"/"transit leg" instead of "dispatch"/"on its way"). Also renamed the `confirmingPayment` translation key to `awaitingPayment` since the key name itself (not its value) tripped the same "Confirming" check.
- **Files modified:** `apps/website/components/checkout/order-status-poller.tsx`, `apps/website/messages/{ru,uk,en}.json`
- **Verification:** All 4 grep-based acceptance criteria now return 0/expected matches; no meaning lost from either comment.
- **Committed in:** `aa6ac74`

**4. [Rule 3 - blocking, environment only] Website build required local env setup**

- **Found during:** Task 2, `pnpm --filter website build` verification
- **Issue:** Fresh worktree had neither `node_modules` nor `apps/website/.env.local` (both gitignored, not shared across git worktrees — same pattern documented by 10-04/10-06). `next build` also runs with `NODE_ENV=production`, which triggers `apps/website/lib/env.ts`'s G-05 guardrail rejecting the dev-default localhost origin.
- **Fix:** `pnpm install`; copied root `.env` to the worktree; created `apps/website/.env.local` with non-localhost placeholder values (`https://api.staging.resto.app` / `https://staging.resto.app`) purely to smoke-test the build. Not committed (gitignored).
- **Files modified:** none tracked (env setup only)
- **Verification:** `pnpm --filter website build` succeeds, all 8 routes compile.
- **Committed in:** N/A (not a code change)

---

**Total deviations:** 4 (2 Rule 3 blocking type/test fixes, 1 Rule 1 self-corrected wording, 1 environment setup) — none expand functional scope beyond the plan's stated objective.
**Impact on plan:** All fixes were necessary to keep the app compiling, the test suite green, and the plan's own acceptance criteria literally passing. No scope creep.

## Issues Encountered

- Same gitignored `node_modules`/`.env` worktree-isolation pattern documented by 10-01/10-03/10-04/10-06 — resolved identically (`pnpm install` + copy root `.env`).
- `next build` runs in production mode by default, surfacing the pre-existing (unrelated to this plan) `WEBSITE_URL`/`NEXT_PUBLIC_API_ORIGIN` production guardrail; resolved with a local-only `.env.local` for verification purposes.

## User Setup Required

None — no external service configuration required. `checkout.consent.*` and `checkout.status.*` are new i18n keys only; no new env vars, no new dependencies (`git diff apps/website/package.json` confirmed empty).

## Next Phase Readiness

- The guest half of Phase 10's "two-screen demo" is complete and independently verifiable: an operator advancing an order through Принять → Готовится → Готово in `apps/admin` (plans 10-05/10-07/10-08, parallel sibling work) will now be visible end-to-end on the guest's `/checkout/confirmation/[orderId]` tracker without a page refresh.
- `apps/website/components/checkout/order-status-poller.tsx` is stable against the frozen 9-field contract; any future field addition requires revisiting plan 10-06's frozen-contract posture first, not just adding a field to this component.
- **Known gap, not built (documented, not silently dropped):** UI-SPEC S11's guest-facing location block (name/address/"Построить маршрут"/tap-to-call) has no data source — the frozen status contract carries none. A future plan would need to either widen the frozen contract (revisiting plan 10-06's minimal-PII posture) or fetch location data through a separate public endpoint.
- No blockers for sibling plans in this wave (10-05 through 10-08) — this plan touched only `apps/website/**`, per the parallel-execution boundary.

## Known Stubs

None. Both tasks wire real data end-to-end (form → API → the boolean lands in `POST /v1/orders`; poller → real `GET /v1/orders/:id/status` responses → rendered tracker state). No hardcoded empty values or placeholder text were introduced.

## Threat Flags

None beyond what the plan's own `<threat_model>` already covers. No new network endpoints, auth paths, or schema changes were introduced — this plan only consumes the already-frozen `GET /v1/orders/:id/status` contract and the already-accepted `marketingConsent` field on `POST /v1/orders`.

## Self-Check: PASSED

- `apps/website/components/ui/checkbox.tsx` — FOUND
- `apps/website/lib/checkout-schema.ts` — FOUND
- `apps/website/lib/checkout-api.ts` — FOUND
- `apps/website/components/checkout/checkout-form.tsx` — FOUND
- `apps/website/components/checkout/order-status-poller.tsx` — FOUND
- `apps/website/test/order-status-poller.spec.tsx` — FOUND
- `apps/website/messages/ru.json` — FOUND
- `apps/website/messages/uk.json` — FOUND
- `apps/website/messages/en.json` — FOUND
- Commit `9b89985` — FOUND in `git log --oneline --all`
- Commit `aa6ac74` — FOUND in `git log --oneline --all`

---

_Plan: 10-admin-order-intake/09_
_Completed: 2026-08-15_
