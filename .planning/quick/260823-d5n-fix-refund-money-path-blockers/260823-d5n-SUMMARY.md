---
quick_id: 260823-d5n
slug: fix-refund-money-path-blockers
completed: 2026-08-23
status: complete
branch: admin-vite-spa
---

# Refund money-path blockers

Two of the three planned fixes landed. The third was withdrawn: it was not a defect, and finding
that out surfaced a worse instance of the first.

## What changed

**F-51 — the refund reason.** `stripe-provider.adapter.ts` cast arbitrary operator text into
Stripe's closed `RefundCreateParams.Reason` enum. Replaced with `toStripeRefundReason`, which passes
Stripe's own three values through, maps `duplicate_order` → `duplicate`, and **omits** the field for
anything else rather than coercing it — `fraudulent` and `duplicate` feed Stripe's risk signals and
`requested_by_customer` is simply false when the kitchen ran out. The operator's real reason now
rides in `metadata.resto_reason`. The `as` cast is gone; it was the thing that silenced the only
check that would have caught this.

**F-51, second half — the `cancel:` prefix.** Found while checking whether F-50 was real:
`CancelOrderService` sends `reason: "cancel:<reasonCode>"`, not the bare code. The first version of
the mapper would still have omitted the reason (correct), but `cancel:duplicate_order` would have
lost its one legitimate mapping. More importantly this revealed the true blast radius — see below.

**F-49 — a Refund is not a Charge.** `handle-stripe-event.service.ts` routed `charge.refunded` and
`refund.updated` into one handler reading `amount_refunded` / `amount_captured`. A `refund.updated`
event carries a Refund, which has neither, so both read `0` and the later event overwrote a
completed full refund with `partially_refunded` / `refunded_amount = 0.00`. Split into
`handleChargeRefunded` (unchanged behaviour, still the sole authority on payment totals) and
`handleRefundUpdated`, which syncs only the ledger row's status through the already-existing
`updateRefundStatusByStripeId`. Stripe's five refund statuses are mapped onto the three the
`payment_refunds_status_chk` constraint permits.

**F-50 — withdrawn.** `Order.refund()` not setting status is deliberate and the aggregate's spec
says so in four separate test names. A goodwill refund on an order that was cooked and eaten must
not rewrite it to `refunded`. The lifecycle transition belongs to `POST /v1/orders/:id/cancel`,
which sets `canceled` and _then_ refunds. The original finding was mine and it was wrong; the
walkthrough had called the bare refund endpoint and judged the result. Change reverted, nothing
shipped.

## The consequence that was worse than filed

Because the cancel path sends `cancel:<reasonCode>`, **rejecting a paid order used to cancel it and
keep the guest's money.** The order flips to `canceled` (saved before the refund is attempted) and
the refund died in the provider branch as `outcome: 'failed'`, visible only as a retry affordance.
That is the walkthrough's step 8, and it was broken end to end.

## Verification

Static: `nx run api:typecheck` clean after every commit; eslint clean on the touched trees; payments
88/88, ordering 84/84.

Both regression tests were confirmed to **fail against the original code** before being kept — 8/14
for F-51, 6/19 for F-49. The F-51 double rejects out-of-enum reasons with a 400 the way the real API
does; a permissive fake passes against the broken adapter, which is how this shipped green.

Behavioural, against live Stripe test money on `acct_1U7VOwRvgubyWPMy`:

| step                                               | result                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------ |
| guest order #13, paid with `pm_card_visa`          | `paid` in ~2 s                                                           |
| reject with `kitchen_out_of_stock`                 | HTTP 200, `refund: { outcome: 'succeeded', amountMinor: 5995 }`          |
| after both webhooks                                | order `canceled`, payment `refunded`, `refunded_amount` 59.95            |
| guest status endpoint                              | `canceled`, reason `kitchen_out_of_stock`, from `paid`                   |
| Stripe                                             | `re_3U7W4S…` succeeded 5995 uah, `reason: null`, metadata preserved      |
| second refund of 10.00 on the fully-refunded order | **HTTP 409 `payments.refund_exceeds_captured`** — 1 refund on the charge |

The last row is the one that matters. Before, that request reached Stripe and was refused by
_Stripe_ (`Charge … has already been refunded`); the application guard had been defeated by the
clobbered ledger. Now it never leaves the process.

## Found while verifying, not fixed

**F-54: all 21 `packages/db` integration suites are red** — `role "resto_auth" does not exist` at
`migrate()`. `0000_baseline.sql` grants policies to `resto_auth` but never creates it; the harness
uses a fresh Testcontainers Postgres and calls only `provisionAppRole`, after migrating.
`provisionAuthRole` exists and is never called. Red since the phase 10.2 squash, unnoticed because
the dev database already carries the role. Recorded in `10-MONEY-PATH-FINDINGS.md`; untouched here
because it is a different problem from the three this task was scoped to.

Proof it is not from this work: these four commits touch exactly two source files and two specs, all
under `apps/api/src/contexts/payments/`, plus three planning files. Zero `packages/` files, zero
migrations.

## Commits

- `3b6e2881` docs: record money-path findings from the first live Stripe payment
- `720c7f81` chore: route plan-checker and verifier through opus
- `201d5d93` fix: map refund reason onto Stripe's enum instead of casting operator text
- `c533ccdb` fix: stop parsing refund.updated as a charge and clobbering the refund ledger
- `d0838075` fix: strip the cancel: prefix so rejecting a paid order actually refunds it
