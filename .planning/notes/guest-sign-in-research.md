# Guest sign-in with Google — what was measured before planning

Written 2026-09-06, before phase 10.7 was planned. Everything here was read out of the installed
package or the repository, not recalled. Cite this rather than re-deriving it.

## The founder's decision

Asked what an account gives a guest, the founder chose **faster checkout *and* order history**
("Плюс свои заказы"). That pulls the order↔customer link forward out of Phase 12 (CRM). Marketing
consent and offers were explicitly *not* chosen — leave them to phases 11/12.

The original ask (2026-09-04) still stands: an unobtrusive offer at checkout, benefits stated, with
"continue without an account" always available.

## The cross-origin problem, and why the obvious fix is wrong

A guest is on `<slug>.<apex>`; the API is on the bare `<apex>`. One DNS zone, two origins.

**Do not set `AUTH_COOKIE_DOMAIN`.** Phase 07.4-06 removed it from the required set deliberately so
the operator's session cookie is host-only and never reaches a tenant storefront. Widening it to
`.<apex>` would undo a narrowing made on a trust boundary, and would put the operator session on
every restaurant's page. The guest problem does not justify that.

## What the installed Better Auth actually offers (1.6.30)

Read from `node_modules/.pnpm/better-auth@1.6.30/.../dist`:

- **`bearer` plugin** (`dist/plugins/bearer/index.mjs`) — already loaded in `auth.config.ts:312`.
  A `before` hook converts an `Authorization: Bearer <token>` header into the session cookie
  internally; an `after` hook emits `set-auth-token` on any response that sets a session cookie,
  and adds it to `Access-Control-Expose-Headers`.
- **`one-tap` plugin** (`dist/plugins/one-tap/index.mjs`) — **not** currently loaded. Exposes
  `POST /one-tap/callback` taking `{ idToken }`. It verifies the token with `verifyGoogleIdToken`
  against an `audience` taken from `options.clientId` or `socialProviders.google.clientId`, rejects
  a mismatched `hd`, then calls `handleOAuthUserInfo` + `setSessionCookie` and **returns the session
  token in the JSON body**.
- **`oauth-popup` plugin** — an alternative that runs the redirect flow in a popup and hands the
  token back through `localStorage`. Not needed if one-tap is used; keep in mind for non-Google
  providers later.

**Why one-tap and not the ordinary redirect flow.** The redirect flow ends in a 302 the browser
follows as a top-level navigation. `set-auth-token` is emitted on that response, but JavaScript on
the destination page cannot read the headers of a redirect it did not fetch — so the token is
produced and unreachable. One-tap's callback is a plain `POST`, so the token comes back in a body
the guest app can read.

**The token is not taken on trust.** One-tap verifies the Google ID token's signature and audience
server-side. The client supplies an ID token, not a session.

## What is already in place

- **Google is wired.** `auth.config.ts:204` registers `socialProviders.google` with
  `prompt: 'select_account'`, gated on both credentials (`identity-core.module.ts:265`).
  `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are optional env keys (`env.schema.ts:264-265`).
  One-tap reuses that same `clientId` — no second credential.
- **Wildcard CORS works, one label deep.** `apps/api/src/shared/security.ts:17-18`: the wildcard
  "never spans dots, so `https://*.example.com` does not match `https://a.b.example.com`".
  `https://*.<apex>` therefore matches `pizza.<apex>` exactly as needed. `CORS_ALLOWED_ORIGINS`
  (`env.schema.ts:188`) is a comma list.
- **The secret must be rotated before production** — it was pasted into a transcript. Tracked in
  `.planning/todos/pending/dev-only-data-to-undo-before-production.md`.

## What is missing, and the one part that is a trust-boundary change

1. **The principal rule is wrong for a Google account.**
   `apps/api/src/contexts/identity/interfaces/http/guards/auth.guard.ts:238` decides identity by
   `if (session.user.phoneNumber)` → customer, else → **operator**. A Google account carries an
   email and no phone, so a signed-in guest is classified as an operator with no tenant. RBAC still
   refuses them, so this is not an open door — but the classification is wrong and safety then
   rests on RBAC catching it rather than on the identity being right.

   **Proposed rule:** an operator is someone who **holds a membership**; everyone else signed in is
   a customer. The guard already queries `member` in `lookupMembership` (line 177), so the data is
   at hand; the query moves earlier and runs once. Keep the phone branch — it stays correct and the
   future OTP login needs it.

   This is the file phase 7.4 was made its own phase for. It deserves its own plan and its own
   review, not a line inside a UI plan.

2. **`apps/qr-menu` has no auth client at all.** `grep -rn better-auth apps/qr-menu` returns
   nothing. `AccountSheet.tsx` is a stub that takes a phone number and renders `account.soon`.
   Its copy promises the order is found "by the number you give at checkout", and QR checkout asks
   only for an optional name — the founder chose to leave that copy because it becomes true once
   this ships. With order history now in scope, revisit it: the account, not the number, will be
   what finds the order.

3. **Orders carry no customer link.** Needed for order history. `orders` has `customer_name`,
   `customer_phone`, `customer_email` as loose columns — no FK to an identity. This is the Phase 12
   slice being pulled forward, and it is the one part with a migration.

4. **Tenant origins are not in the CORS allowlist or Better Auth's trusted origins.** Both take the
   `https://*.<apex>` shape; `trustedOrigins` is built in `identity-core.module.ts`.

## What does NOT need doing

- No same-origin proxy, no tunnel or Caddy route for `/api/auth/*` on tenant hosts. Bearer transport
  is cross-origin by design; CORS is the mechanism.
- No cookie-domain change. See above.
- No second Google credential, no new OAuth redirect URI: one-tap posts an ID token rather than
  redirecting, so nothing new is registered in Google Cloud Console.

## The cost to state plainly

A bearer token lives in JavaScript-reachable storage, so an XSS on a tenant storefront can steal it.
The blast radius is **one guest's own account** — their order history and their name on a checkout
form. Compare with the alternative: widening the cookie would put the *operator's* cross-tenant
session on the same page. The bearer choice is the smaller loss, not a free one. Storage choice
(memory vs `localStorage`) and token lifetime are decisions for the plan.
