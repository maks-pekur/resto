---
title: The status / payment_status split broke nine e2e specs and nobody updated them
date: 2026-09-06
priority: high
status: pending
---

# Nine e2e specs still speak the pre-split order vocabulary

Migration `0010_order_payment_status.sql` split `orders.status` into a fulfilment stage
(`placed | accepted | preparing | ready | completed | canceled`, enforced by `orders_status_chk`)
and an independent `payment_status` (`pending | requires_action | paid | failed | refunded`, with
`orders_paid_at_chk` requiring `(payment_status = 'paid') = (paid_at IS NOT NULL)`).

The split landed on the long-lived stacked branch during phases 10.3–10.5. **The e2e suite was
never updated.** It went unnoticed because `main` has not moved since 2026-08-29 and CI only runs
against PRs targeting `main` — so nothing compared the branch to anything until PR #281.

## Measured, not assumed

`main`'s last CI run (33273430093) and PR #281's run (34040297126), diffed by failing spec:

- **red on both — inherited, unrelated:** `identity-bootstrap`, `identity-invitation`,
  `organization-switch`, `signup`, `signup-enumeration`, `tenant-onboarding`
- **red on main, green on the branch:** `catalog` (fixed by 10.6 plan 08's `IMAGE_URL_PORT` stub)
- **new on the branch — this todo:** `analytics-dashboard`, `location-delete`,
  `order-cancel-refund`, `order-feed-query`, `order-routes-authz`, `payment-lifecycle`,
  `payments-isolation`, `payments-upsert-partial-index`, `table-zones`

27 of the assertion failures in that run are `violates check constraint "orders_status_chk"`.

## Two distinct problems, not one

**1. Fixtures insert a status the constraint rejects.** `'paid'`, `'created'` and `'refunded'` are
seeded into `orders.status`. Mechanical to fix. Note the trap that cost time here: some helpers take
the status as a **positional argument** (`seedOrder('created')`), so a grep for `status: '...'`
misses them, and some `status:` literals in the same files belong to `payments` /
`payment_refunds` inserts where `'succeeded'`/`'failed'` are correct — do not sweep blindly.

**2. `payment-lifecycle.e2e.spec.ts` asserts payment values against the fulfilment column.** Its
`readOrderStatus` helper selects `orders.status`, and steps 2 and 3 expect `'requires_action'` and
`'paid'` from it. Those are `payment_status` values now. This is not a fixture rename — the helper
reads the wrong column, and each assertion needs deciding on its own.

## Done so far

`order-feed-query.e2e.spec.ts` is fixed and green locally (17/17): the helper's `status` is now the
legal union rather than `string`, `paid` is an explicit flag that sets `paymentStatus`/`paidAt`
together to satisfy `orders_paid_at_chk`, and the seeded `'refunded'` order became `'canceled'` —
which is what a refunded order is under the split, and what the counts assertion already expected.

## A finding that needs a decision, not a test edit

While translating `payment-lifecycle`'s "row no longer stuck at paid" test, I asserted that
`orders.payment_status` reads `'refunded'` after an operator cancels a paid order. **It reads
`'paid'`.** The refund event is emitted (`ordering.order_refunded.v1` is in the outbox) and
`Order.refund()` does set `paymentStatus: 'refunded'` when fully refunded
(`order.aggregate.ts:447`) — but the row does not end up that way through the cancel path.

This may be a real defect on the money path: an order that was auto-refunded on cancel still reads
as paid. It may equally be that the cancel path deliberately leaves the payment row to the
provider webhook. **The old test never checked this**, so nothing regressed — but nothing
guarantees it either. I reverted my speculative assertion rather than ship a test asserting a
guarantee that has never existed. Worth answering before the money path goes live.

## Scope note

This is test-suite repair after a schema change, not phase-7.5 or phase-10.6 work. It is sized like
its own small plan: roughly five specs, one of which (`payment-lifecycle`) needs per-assertion
judgement on payment semantics. Related: [[dev-only-data-to-undo-before-production]].
