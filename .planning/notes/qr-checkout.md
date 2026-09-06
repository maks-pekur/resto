# Checkout in the QR menu — decision needed on the order model (2026-09-01)

The QR menu ends at the cart: `MenuScreen` renders whatever `cartPrimaryAction` the host supplies,
the website supplies a Checkout button, the QR app supplies nothing. Ordering was built for the
website only. The founder wants both payment paths in the QR menu — pay now by card, or pay at the
table — and one rule that changes the shape of the thing:

> **Payment happens only after a staff member has confirmed the order.**

## Why that rule does not fit today's model

`orders.status` carries both facts at once: `created → paid → accepted → preparing → ready →
completed`. Two consequences:

- The operator feed's "unconfirmed" tab reads `status = 'paid' AND accepted_at IS NULL`, so an
  order nobody has paid for is **invisible to staff** — and under the new rule every order starts
  that way.
- `Order.accept()` refuses anything but `paid`, so staff cannot confirm before the money lands.

## The decision

**Split the two axes.** Fulfilment is the status (`placed → accepted → preparing → ready →
completed / canceled`); payment is its own dimension — `payment_type` on the order (what the guest
chose) plus the `payments` table (what actually happened). The feed's tabs read `accepted_at`, and
the row shows an unpaid order with the chip it already renders for the payment type.

Done properly this is a migration (`status = 'paid'` rows become `placed`), an aggregate change
(`accept()` from `placed`, `markPaid` no longer gating fulfilment), feed queries, the admin tabs,
the website flow and its e2e tests. It is a phase, not an afternoon — and it is the right shape:
every restaurant that takes cash needs it, and it is what makes "confirm, then pay" expressible.

**Already landed** (2026-09-01): `POST /v1/orders` accepts `paymentType` (`online` | `cash` |
`card_on_delivery`, default `online`, and `card_on_delivery` only for delivery). The order stores
what the guest chose, so the operator sees it in the feed. Nothing about the status machine has
been touched yet.

## What the QR checkout needs on top

1. A checkout screen: order type is `dine_in` with the table already resolved from `?t=`, name and
   phone optional for the table (the API only requires them for pickup/delivery), payment choice.
2. A status screen that polls `/v1/orders/:id/status`: *waiting for confirmation* → *confirmed,
   pay now* (Stripe Payment Element for the online path) or *confirmed, pay the waiter*.
3. Stripe in the guest bundle for the online path — lazily, behind the same split the item sheet
   uses, so a guest who pays cash never downloads it.
4. An answer for the order nobody pays: a confirmed, unpaid online order needs a timeout or an
   operator-side cancel, or the kitchen cooks for nobody.

The website keeps paying before confirmation — a delivery order prepaid by card is the normal case
there, and the rule the founder stated is about a guest sitting at a table.
