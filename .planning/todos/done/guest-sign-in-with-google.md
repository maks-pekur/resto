---
title: Guest sign-in with Google, and the principal rule it breaks
date: 2026-09-04
closed: 2026-09-06
status: absorbed
---

# Absorbed into phase 10.7

The founder chose this feature on 2026-09-06 and it became a phase. Everything this file analysed
now lives in artifacts that are kept current:

- **`.planning/phases/10.7-guest-sign-in-and-their-own-orders/10.7-CONTEXT.md`** — the locked
  decisions.
- **`.planning/notes/guest-sign-in-research.md`** — every claim about Better Auth, with the file and
  line it was read from.
- **`10.7-01-PLAN.md`** — the principal-rule change, planned on its own because it is the trust
  boundary phase 7.4 was carved out for.

**Do not plan from this file.** Two of its conclusions were measured wrong and are corrected in the
artifacts above:

- It said the OAuth redirect URL is tied to the guest app's host. It is tied to the **API's** host,
  via `BETTER_AUTH_BASE_URL`.
- It said the auth endpoints are unreachable from a tenant host, and offered "widen the cookie" or
  "use bearer" as the two ways out. **Both premises were wrong.** `infra/docker/Caddyfile` serves
  the apex and every tenant subdomain from one block and proxies `/api/*` to the api, so a guest's
  sign-in is same-origin and its cookie lands on the restaurant's own host. No cookie widening, no
  bearer token. That error came from reasoning about the dev tunnel instead of production.

What this file got right and the phase kept: the principal rule is wrong for an account with no
phone number, `apps/qr-menu` has no auth client, and `AccountSheet`'s copy will be false until the
account — not the phone number — is what finds an order.
