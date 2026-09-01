# Guest identity — what the profile sheet is waiting for

**Status:** UI shipped, backend not started (2026-09-01).

The QR menu's header carries a profile control that opens `AccountSheet`. The sheet states the
rule we settled on — *a guest orders first and is asked who they are afterwards* — takes a phone
number, and says plainly that signing in by code is not live yet. Nothing about it pretends to
authenticate.

## What has to exist before the button can work

- `POST /v1/customers/otp` — issue a code to a phone, per tenant, rate-limited per number and per
  IP (the existing `RateLimitGuard` shapes are the precedent).
- `POST /v1/customers/session` — exchange phone + code for a customer session cookie, mirroring
  `table-session` (HttpOnly, SameSite=Lax, Secure outside dev).
- `GET /v1/customers/me/orders` — the history the sheet promises, scoped to the tenant whose menu
  the guest is standing in.

`customer_profiles` already models the per-tenant guest, and `Principal` already has its
`kind: 'customer'` branch, so the identity itself is not new — only the way in.

## Decisions already made

- Login is never a gate in front of ordering: the cart and checkout must keep working for someone
  who never signs in.
- The anchor is the phone number given at checkout, not an email or a social account.
- Reviews and order history hang off the order link, not off an account.
