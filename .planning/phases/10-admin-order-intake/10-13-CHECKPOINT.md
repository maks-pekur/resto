---
status: parked
phase: 10-admin-order-intake
plan: 13
parked: 2026-08-18
blocked_on: human-verify — two-screen walkthrough with a real Stripe test payment
blocker_cause: seed-demo does not make a brand payment-ready; guest checkout returns payments.not_enabled
---

# Phase 10 — parked at the plan 13 checkpoint

12 of 13 plans are complete and merged. Plan 13's automatable work is done; its
SUMMARY is deliberately unwritten because the plan's `<done>` requires founder
sign-off on the manual walkthrough first.

## Why it is parked rather than complete

The walkthrough needs a guest to place a real Stripe-test-mode order. The demo
fixture never configures payments, so `POST /v1/checkout/payment-intent` returns
`payments.not_enabled` (409): `Brand.canAcceptPayments()` requires both
`stripe_account_id` and `stripe_charges_enabled`, and `seed-demo` sets neither.
`brands.default_currency` is also null — it is populated during Stripe
onboarding, by design, not at brand creation.

Wiring the existing `StubProviderAdapter` does not solve this: it returns a
synthetic `clientSecret`, which Stripe Elements in the browser rejects. Only real
test-mode Connect onboarding makes the guest half of the walkthrough possible.

## Proven mechanically

- `adm-02-orders-workflow-smoke.spec.ts` — 9/9, real browser, operator workflow
- `adm-03-guest-status-loop.spec.ts` — the two-screen guest loop, 3 isolated runs
- `pnpm typecheck` 11/11 projects; `pnpm lint` 10/10; `pnpm nx run-many -t test` 10/10
- Migrations 0073–0077 applied and verified against the live catalog
- Requirement, decision and persona matrices in `10-13-VERIFICATION-EVIDENCE.md`

## Not proven — needs a human

Audible chime and the autoplay-block path; tab-title counter; dark-mode contrast
on the new warning/success tokens; popover placement at tablet widths; sticky feed
header offset; touch-target sizing. And the money leg: a real payment, and a
refund appearing in the Stripe test dashboard.

## Landed after the code review, all with regression tests

| Fix                                                                               | Commit     |
| --------------------------------------------------------------------------------- | ---------- |
| Order feed scoped to one location (was brand-wide for scoped staff)               | `83e28a13` |
| Credential routes keyed by IP so a rotating cookie cannot mint rate-limit buckets | `c65af02a` |
| `payment_refunds` erased on tenant deletion (FK RESTRICT broke GDPR erasure)      | `31bc97e9` |
| Cancel/refund controls gated by order status per UI-SPEC                          | `6a4fc9cd` |
| Leading-dot refund amounts no longer parse to NaN                                 | `a646461d` |

Two review findings were re-rated after tracing them across the layer boundary:
the "double-refund" pair is a UI defect, not a money defect (the aggregate,
`RefundExceedsCapturedError` and the `payment_refunds_request_id_uq` index all
block it server-side); the rate-limiter bypass weakened only the outer IP fence —
the per-tenant and per-email fences are cookie-independent.

## Behaviour changed by a founder decision

The feed is strictly single-location. The owner's brand-wide aggregate view is
gone: in `?location=all` the Orders page shows a pick-a-location state. Three
e2e specs that asserted the merged view were rewritten to the new contract.

## Also fixed while standing the stack up

Three stale pointers at the retired port 3000, all predating this phase: the
website dev default (`ae524092`, plus the test that pinned the wrong port), the
seed CLI default (`92b7c421`), and the untracked local `apps/website/.env.local`,
which overrode both.

## To resume

1. Make a brand payment-ready — real Connect onboarding in test mode via
   `onboarding/brand` / `brands/$slug/payouts`, or teach `seed-demo` to do it.
2. Run the walkthrough in `10-13-PLAN.md` `<how-to-verify>` steps 3–10, noting
   that step 9 no longer applies — the all-locations mode was removed by choice.
3. Reply `approved`, or describe what diverged. Then plan 13's SUMMARY is written
   and the phase closes.
