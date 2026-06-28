---
status: fixing
trigger: 'BUG #6 — payment.status never flips to refunded'
created: 2026-06-28
updated: 2026-06-28
---

## Current Focus

hypothesis: Two separate code paths both fail to flip payments.status: (a) RefundOrderService line ~100 passes `status: payment.status` (unchanged 'succeeded') to upsertByPaymentIntentId; (b) handleRefund webhook bails at charge.refunds?.data?.[0] before any status-flip logic because real charge.refunded events don't embed refunds.data inline.
test: Write a failing test asserting payments.status='refunded' after RefundOrderService.execute — it will fail with 'succeeded' instead. Then fix and rerun green.
expecting: RED shows status='succeeded', GREEN shows status='refunded'/'partially_refunded'
next_action: Apply fix (a) to RefundOrderService, fix (b) to handleRefund, write faithful test, confirm red then green.

## Symptoms

expected: After RefundOrderService records a full refund, payments.status should flip to 'refunded'. After partial refund, 'partially_refunded'.
actual: payments.status stays 'succeeded' — the upsertByPaymentIntentId call uses `status: payment.status` (the existing DB status).
errors: No error — silent wrong-status bug.
reproduction: Execute RefundOrderService.execute with full-refund amount. Check payment row status remains 'succeeded'.
started: Since Phase 8 refund implementation — never worked.

## Evidence

- timestamp: 2026-06-28
  checked: refund-order.service.ts line ~96-110
  found: upsertByPaymentIntentId call has `status: payment.status` — passes the existing payment status unchanged, so 'succeeded' stays 'succeeded' after any refund
  implication: PRIMARY fix point — change to `status: newRefundedMinor >= capturedMinor ? 'refunded' : 'partially_refunded'`

- timestamp: 2026-06-28
  checked: handle-stripe-event.service.ts lines 320-323
  found: `const refundData = charge.refunds?.data?.[0]; if (!refundData) { warn; return; }` — real charge.refunded events do NOT embed refunds.data (it's a sub-resource), so this guard always triggers and returns early. All logic below (lines ~380 onwards computing fullyRefunded from amount_refunded/amount_captured) never runs.
  implication: HARDEN path — remove the refundData bail; replace entire refund-data dependent logic with amount_refunded / amount_captured based status flip only (no refund-row insertion from webhook — charge.refunded has no stable refund id)

- timestamp: 2026-06-28
  checked: packages/db/src/schema/ordering.ts payments table CHECK constraint
  found: `payments_status_chk: status IN ('pending','requires_action','succeeded','failed','refunded','partially_refunded')` — both 'refunded' and 'partially_refunded' already allowed; NO migration needed
  implication: Can use both statuses safely

- timestamp: 2026-06-28
  checked: order.aggregate.ts refund() method
  found: Sets order status to 'refunded' (full) or 'paid' (partial). Order does NOT have a 'partially_refunded' status — partial refund keeps order as 'paid'. Only payment row gets 'partially_refunded'.
  implication: payment status is independent from order status for partial refunds

- timestamp: 2026-06-28
  checked: payment-lifecycle.e2e.spec.ts step 4
  found: Feeds charge.refunded event WITH `refunds.data: [{ id: refundId, amount: 1500, status: 'succeeded' }]` inline. This exercises the dead branch (bail at refundData check) that happens to succeed because data IS present. Does NOT test the real Stripe shape (no inline refunds.data). This is the false-green.
  implication: Step 4 of the lifecycle e2e must be updated to use the real Stripe charge.refunded shape

## Resolution

root_cause: (a) RefundOrderService.executeWithOrder passes `status: payment.status` to upsertByPaymentIntentId, never computing the new refund status. (b) handleRefund webhook bails when charge.refunds?.data?.[0] is falsy — which is always for real charge.refunded events since refunds is a sub-resource, not inlined.
fix: (a) Compute `newPaymentStatus = newRefundedMinor >= capturedMinor ? 'refunded' : 'partially_refunded'` and pass to upsertByPaymentIntentId. (b) Remove the dead refundData bail; rebuild handleRefund to cast charge as having amount_refunded+amount_captured, compute fullyRefunded from those, flip payment status only (no refund-row insertion — charge.refunded has no stable refund id), log dashboard-refund-row gap.
verification: pending
files_changed: []
