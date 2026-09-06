# Tips for staff — options and disposition (2026-08-31)

Raised while building the QR-menu bottom navigation: a reference app shows a **Tip** tab, and the
tab must appear only for a restaurant that actually has tipping switched on. Two questions came out
of it — *how do we do tips at all*, and *do we integrate tiptip*. Decision below; the build is
deferred to its own phase.

## What tiptip is

`tiptip` (tiptip.pl, Warsaw) is a Polish cashless-tipping app for **waiters, not venues**: the
waiter registers personally, the account is deliberately independent of the employer, and the money
reaches them without passing through the restaurant's terminal — which is the whole point in a
market where a card payment offers no tip line. Each waiter gets an individual "business card"
(a personal page/QR).

What could not be established from public sources: whether there is a venue account, a partner API,
or any documented way for a third-party app to render per-waiter tip buttons. The vendor's own
pages and the agency case study describe the product, not an integration surface. **Any tiptip
phase therefore starts with a conversation with them, not with code** — contact is published on the
agency page (Piotr Kielan, +48 504 297 304). Comparable services that do publish partner APIs:
TiPJAR, GlobalTips, eTip.

## The better option we already own

We run **Stripe Connect** for every tenant, and the guest is already entering card details in our
checkout. Three consequences:

1. **A tip belongs in the payment, not in a separate tab.** A tab is what a product needs when it
   does not own the payment; we do. A tip line on the existing Payment Intent converts far better
   than a detour a guest takes after paying, and it costs no new vendor, no new KYC, no new
   compliance surface.
2. **The tab is the fallback, not the mechanism** — it serves the guest who paid cash, or who wants
   to tip after the fact.
3. **Direct-to-waiter is a separate, much larger question.** Paying a named waiter rather than the
   restaurant means a Stripe Express account per staff member (identity, KYC, payouts, and a
   payroll/tax story per market). That is a product, not a feature — and it is precisely the
   product tiptip already sells.

## Disposition

**Now (this phase):** nothing tips-related ships. The bottom navigation shows only tabs whose
feature exists — Menu, Cart, Info. This is the rule, not a temporary state: a tab appears when its
capability is on for that tenant, never as a placeholder.

**Phase A — tips we own (small, do first).** A tip line in the guest checkout: preset percentages
plus a custom amount, added to the same Payment Intent, settled to the tenant's existing Stripe
account and reported in the admin per shift. Distribution to staff stays the restaurant's payroll
business, which is also the legally simplest position. Adds a `tips` capability on the tenant; the
Tip tab in the QR menu appears from it.

**Phase B — a link out (cheap, market-agnostic, may precede A).** One optional per-tenant field:
a tips URL (tiptip page, revolut.me, PayPal.me, a bank jar). The tab appears when it is filled and
opens the link. No money touches us, no integration risk, and it covers Poland on day one. This is
the answer to "the client only enters a key or a token" — for a link-out there is nothing to enter
but the link.

**Phase C — a real tiptip integration (only on demand).** Gate it on two facts we do not have:
(a) tiptip exposes a partner API or per-venue embed, and (b) a paying customer asks for tiptip by
name. If both hold: the operator pastes the venue key/token in Settings → Integrations, we store it
beside the Stripe credentials, and the Tip tab renders their flow. Until (a) is answered by the
vendor, estimating this is guesswork.

**Phase D — direct-to-waiter payouts (own the product).** Stripe Express account per staff member,
tips routed with `transfer_data`, staff onboarding in the admin. Only worth it if tipping becomes a
reason restaurants choose us — otherwise Phase B hands the same outcome to a specialist.

## What this implies for the code today

- The tab list in `apps/qr-menu/src/App.tsx` is built from what exists; adding a tab means adding
  the capability that backs it first.
- The tenant will need an `integrations`/capabilities shape (`tips: { mode, url | credentials }`)
  when Phase A or B lands. `Settings → Integrations` is already the screen for it.
