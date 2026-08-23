---
phase: 10-admin-order-intake
created: 2026-08-23
source: first live Stripe test-mode walkthrough (plan 13 checkpoint)
status: open
---

# Money-path findings from the first real payment

Every finding below was produced by moving real test-mode money through a real Stripe connected
account (`acct_1U7VOwRvgubyWPMy`), with `stripe listen` forwarding live webhooks. None of them is
reachable through the stub provider or a mocked spec, which is why the suite is green and the
behaviour is broken. This is the exact failure mode `10-13-PLAN.md`'s threat T-10-13-01 named.

Evidence artefacts: orders `#10` (lifecycle), `#11` (reason rejection), `#12` (refund clobber);
charge `ch_3U7ViaRvgubyWPMy1GKHr9wj`; refund `re_3U7ViaRvgubyWPMy11sSMtve`.

## What works, proven end to end

- `POST /v1/checkout/payment-intent` creates a real PaymentIntent on the connected account with
  `orderId` and `tenantId` in metadata.
- Card confirmation → `charge.succeeded` webhook → order reaches `paid` in ~2 s.
- Operator lifecycle `paid → accepted → preparing → ready → completed`, all HTTP 200, each
  transition read back from the API.
- `POST /v1/orders/:id/refund` issues a genuine Stripe refund; `payment_refunds` gets a correct
  `succeeded` row.

## F-49 — `refund.updated` is parsed as a Charge and destroys the refund ledger

**Severity: blocker.** `handle-stripe-event.service.ts:70-72` routes `charge.refunded` **and**
`refund.updated` into the same `handleRefund`. That handler reads `rawCharge.amount_refunded` and
`rawCharge.amount_captured`. A `refund.updated` event carries a **Refund** object, which has
neither field — both fall back to `0`.

Stripe delivers `charge.refunded` first (correct: `amount_refunded = 5995` → writes `refunded`),
then `refund.updated` (`amount_refunded = undefined → 0` → writes `partially_refunded`). The second
overwrites the first.

Observed after one successful **full** refund of 59.95 UAH:

| column                     | value                | correct value |
| -------------------------- | -------------------- | ------------- |
| `payments.status`          | `partially_refunded` | `refunded`    |
| `payments.refunded_amount` | `0.00`               | `59.95`       |

**Consequence, verified not assumed.** `RefundOrderService` computes
`remaining = captured - alreadyRefunded`, so it believes the whole 59.95 is still refundable. A
second refund request for a _different_ amount builds a fresh `refundRequestId`
(`refund:<order>:0:1000`), so the uniqueness short-circuit does not fire and the call reaches
Stripe. It was refused by **Stripe** — `Charge ch_3U7Via… has already been refunded` — not by us.
The application-side guard is defeated; the provider is the only thing protecting the money.

Note `handleRefund` already logs `refund-row gap logged — PAY-BUG6`, so the handler was known to be
imperfect; the type confusion underneath it was not.

## F-50 — a refunded order never leaves `paid`

**Severity: blocker.** `order.aggregate.ts:422-442` — `refund()` sets `updatedAt` and pushes an
`OrderRefunded` event but **never assigns `status`**. Compare `markFailed()` twenty lines below,
which does set it. `'refunded'` is a declared member of `OrderStatusSchema` and is unreachable
through this path.

Observed: order `#12` fully refunded in Stripe, still `paid` in `orders` and on the guest status
endpoint 20 s later. The guest is told they have a paid order; the operator sees a paid order.

## F-51 — every refund from the admin UI fails with 502

**Severity: blocker.** `stripe-provider.adapter.ts:274` does
`reason: input.reason as Stripe.RefundCreateParams.Reason`. `RefundInputSchema` accepts
`z.string().min(1)` — arbitrary operator text. Stripe accepts only `duplicate`, `fraudulent`,
`requested_by_customer`.

The cancel-reason vocabulary this product actually uses — `guest_no_show`, `kitchen_out_of_stock`,
`kitchen_too_busy`, `guest_requested`, `payment_issue`, `duplicate_order`, `other` — contains **no**
valid Stripe reason. Every refund an operator can trigger through the UI 502s.

Reproduced: `reason: 'kitchen_out_of_stock'` → HTTP 502 `payments.refund_provider_failed`,
`Invalid reason: must be one of duplicate, fraudulent, or requested_by_customer`. The same request
with `requested_by_customer` → HTTP 200.

The `as` cast is what let this ship: it silences the one check that would have caught it. The domain
reason belongs in refund `metadata`; the Stripe `reason` needs a mapping with a safe default.

**Not a bug, but the same shape:** `stripe-provider.adapter.ts:257-258` casts into
`CancellationReason` identically. Its only call site
(`create-checkout-payment.service.ts:91`) passes a hardcoded `'abandoned'`, which is valid — the
hazard there is latent, not live.

## F-52 — Stripe's minimum-amount refusal surfaces as a 500

**Severity: medium.** A 14.99 UAH order (≈ £0.25) produced
`https://resto.app/problems/internal-server-error`, detail redacted. The real message was
`Amount must convert to at least 30 pence`. Every payment processor enforces a floor, so a guest
buying one bottle of water hits an "Internal Server Error" page. This needs a mapped domain error
and a guest-readable message, and probably an order-level minimum check before checkout.

## F-53 — the "a human must click through Stripe" claim is false

**Severity: doc.** `10-13-CHECKPOINT.md` step 1, `tools/scripts/seed/README.md`, and the
`MissingStripeTestAccountError` message all state that Connect onboarding cannot be scripted because
Express accounts must accept terms through Stripe's hosted form.

A **Custom** account can be driven end to end through the API. What worked, in three calls:

1. `POST /v1/accounts` — `type=custom`, `country=GB`, `business_type=individual`,
   `capabilities[card_payments|transfers][requested]=true`, `tos_acceptance[date|ip]`.
2. `POST /v1/accounts/:id` — business profile, individual name/email/phone/address, then the
   test-mode identity triggers `individual[dob] = 1901-01-01` and `individual[id_number] =
000000000`. Arbitrary but realistic values fail with `verification_failed_keyed_identity`; the
   documented magic values pass.
3. `POST /v1/accounts/:id/external_accounts` — GB test bank (`routing_number=108800`,
   `account_number=00012345`). `tok_gb` does **not** work here; it is a card token.

Verification settles in ~30 s, after which `charges_enabled` and `payouts_enabled` are both true.
Two encoding traps: `+` in a `-d` value is decoded as a space, so phone numbers need
`--data-urlencode`; and the seed stamps `account_type = 'express'` for row coherence while the real
account is `custom` — cosmetic today because nothing branches on it.

**Caveat that is not a defect.** Ukraine is not an available Connect country, so the demo account is
GB while the `pizza` fixture prices in UAH. That mismatch is what makes F-52 easy to hit: the GBP
floor applies to converted UAH amounts.

## Suggested order of work

F-51 first — it is a one-line mapping and it is the only one a user hits on the very first attempt.
Then F-49 (split the two event types; a Refund is not a Charge), then F-50 (one assignment in the
aggregate). F-52 needs a small design decision about where the minimum lives. F-53 is documentation
plus, optionally, teaching the seed to create the account itself so the step disappears for good.

Each fix needs a regression test that would fail against the real provider — a stub-only test is what
allowed all four.
