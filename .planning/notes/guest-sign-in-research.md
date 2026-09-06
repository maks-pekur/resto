# Guest sign-in with Google — what was measured before planning

Written 2026-09-06, before phase 10.7 was planned. Everything here was read out of the installed
package or the repository, not recalled. Cite this rather than re-deriving it.

## The founder's decision

Asked what an account gives a guest, the founder chose **faster checkout *and* order history**
("Плюс свои заказы"). That pulls the order↔customer link forward out of Phase 12 (CRM). Marketing
consent and offers were explicitly *not* chosen — leave them to phases 11/12.

The original ask (2026-09-04) still stands: an unobtrusive offer at checkout, benefits stated, with
"continue without an account" always available.

## The origin question — and the answer I got wrong first

A guest is on `<slug>.<apex>`; Better Auth is mounted at `/api/auth/*` inside `apps/api`.

**My first reading was that a tenant host cannot reach the API, so the session would have to travel
as a bearer token. That is wrong, and it was wrong because I reasoned from the dev tunnel's ingress
instead of from production.** `infra/docker/Caddyfile` serves `{$WEBSITE_HOST}, *.{$WEBSITE_HOST}`
from a single block, and inside it `handle /v1/*` and `handle /api/*` both proxy to `api:3000`. Its
own comment states the intent: 07.4 made "guest checkout and operator auth same-origin on these two
paths".

So `pizza.<apex>/api/auth/...` **is same-origin for the guest**, the `Set-Cookie` it returns carries
no `Domain`, and the session binds to `pizza.<apex>` alone.

**`AUTH_COOKIE_DOMAIN` must stay unset — and that is now load-bearing rather than merely preserved.**
Host-only cookies are what keep a guest's session on `pizza.<apex>` away from `burger.<apex>`, and
the operator's session on `<apex>` away from both. Setting it would merge all three into one scope.
Phase 07.4-06 narrowed this deliberately; this phase runs on that narrowing.

**Where the gap actually is: development.** Production has the Caddy route; local does not.
`apps/website/next.config.mjs` rewrites `/v1/:path*` only and is `NODE_ENV !== 'production'` gated;
`apps/qr-menu/vite.config.ts` proxies `/v1`, `/internal` and `/media`. Neither covers `/api/*`, so
sign-in would work on a server and 404 on the Mac.

## What the installed Better Auth actually offers (1.6.30)

Read from `node_modules/.pnpm/better-auth@1.6.30/.../dist`:

- **`bearer` plugin** (`dist/plugins/bearer/index.mjs`) — already loaded in `auth.config.ts:312`.
  Converts an `Authorization: Bearer <token>` header into a session, and emits `set-auth-token` on
  responses that set a session cookie. **Not used by this phase** — the guest session is a
  same-origin cookie. Recorded because it is loaded and a reader will wonder why it is idle.
- **`one-tap` plugin** (`dist/plugins/one-tap/index.mjs`) — **not** currently loaded. Exposes
  `POST /one-tap/callback` taking `{ idToken }`. It verifies the token with `verifyGoogleIdToken`
  against an `audience` taken from `options.clientId` or `socialProviders.google.clientId`, rejects
  a mismatched `hd`, then calls `handleOAuthUserInfo` + `setSessionCookie` and **returns the session
  token in the JSON body**.
- **`oauth-popup` plugin** — an alternative that runs the redirect flow in a popup and hands the
  token back through `localStorage`. Not needed if one-tap is used; keep in mind for non-Google
  providers later.

**Why one-tap and not the ordinary redirect flow.** The redirect flow's callback URI is built from
`BETTER_AUTH_BASE_URL`, a single value (`https://<apex>`) — so Google returns the guest to the
**apex**, and the session cookie is set for the apex, not for `pizza.<apex>` where the guest is
standing. One-tap has no redirect: the guest app POSTs the ID token to its **own** origin
(`pizza.<apex>/api/auth/one-tap/callback`), so the cookie lands on the right host.

**The token is not taken on trust.** One-tap verifies the Google ID token's signature and audience
server-side. The client supplies an ID token, not a session.

## What is already in place

- **Google is wired.** `auth.config.ts:204` registers `socialProviders.google` with
  `prompt: 'select_account'`, gated on both credentials (`identity-core.module.ts:265`).
  `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are optional env keys (`env.schema.ts:264-265`).
  One-tap reuses that same `clientId` — no second credential.
- **Wildcard origin matching works, one label deep**, in both places that need it: CORS
  (`security.ts:17-18` — "never spans dots") and Better Auth's `trustedOrigins`
  (`trusted-origins.mjs:18-22`). `https://*.<apex>` matches `pizza.<apex>` and not `a.b.<apex>`.
- **The secret must be rotated before production** — it was pasted into a transcript. Tracked in
  `.planning/todos/pending/dev-only-data-to-undo-before-production.md`.

## What is missing, and the one part that is a trust-boundary change

1. **The principal rule is wrong for a Google account.**
   `apps/api/src/contexts/identity/interfaces/http/guards/auth.guard.ts:238` decides identity by
   `if (session.user.phoneNumber)` → customer, else → **operator**. A Google account carries an
   email and no phone, so a signed-in guest is classified as an operator with no tenant. RBAC still
   refuses them, so this is not an open door — but the classification is wrong and safety then
   rests on RBAC catching it rather than on the identity being right.

   **The rule, after two edge cases killed the obvious version.** "Operator = holds a membership"
   breaks registration: `/me/tenants/onboarding` and its siblings sit behind `@CurrentOperator`, and
   a freshly-registered person holds no membership until they have used exactly those routes. The
   rule keys off whether the request arrived on a tenant host instead — `alsTenantId` set means a
   guest surface, where membership decides; unset means the admin or apex, where signed in still
   means operator. Full table in `10.7-01-PLAN.md`. Keep the phone branch — the deferred OTP login
   needs it.

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

4. **Tenant origins are not in Better Auth's `trustedOrigins`.** A same-origin POST still sends an
   `Origin` header and Better Auth rejects a mutating request from an untrusted one. Wildcards are
   supported (`dist/auth/trusted-origins.mjs:18-22` routes any pattern containing `*` through
   `wildcardMatch`); `trustedOrigins` is assembled at `identity-core.module.ts:232`. CORS needs no
   change — the calls are same-origin.

5. **Neither dev proxy covers `/api/*`.** See the origin section: production routes it, local does
   not, so sign-in would work on a server and 404 on the Mac.

## What does NOT need doing

- No new production route: `/api/*` already reaches the api from every tenant host (`Caddyfile`).
  No bearer token, no token in JavaScript, no `localStorage`.
- No cookie-domain change, and no CORS change for sign-in — the calls are same-origin. See above.
- No second Google credential, no new OAuth redirect URI: one-tap posts an ID token rather than
  redirecting, so nothing new is registered in Google Cloud Console.

## What the same-origin cookie does and does not buy

It is `httpOnly`, so an XSS on a tenant storefront cannot read it, and host-only, so it never leaves
that restaurant's host. What it does **not** stop is an XSS acting *as* that guest on the page it
already runs on — the ordinary limit of cookie auth, and why `trustedOrigins` and Better Auth's CSRF
handling still matter.

A JavaScript-readable copy of the session, added "for convenience", would give back exactly the
property this choice buys. Do not.
