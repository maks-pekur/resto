---
title: Guest sign-in with Google, and the principal rule it breaks
date: 2026-09-04
updated: 2026-09-06
priority: medium
status: pending
---

# Guest sign-in via Google — what it needs, and the one thing it breaks

Founder asked (2026-09-04) for an unobtrusive offer to sign in at checkout, describing the
benefits, with "continue without an account" always available. Phone/OTP was the first idea and
was dropped: it needs an SMS provider, per-message cost and abuse limits. Google is cheaper and
has no per-use price — but it is not a config toggle.

**Revised 2026-09-06** after the single-apex move and the dev tunnel. One of the three original
obstacles is gone, one was wrong about *which host* it constrained, and a fourth — the real one —
was missing. Read this version, not the original three points.

## 1. The principal rule says "customer = has a phone number" — STILL TRUE

`apps/api/src/contexts/identity/interfaces/http/guards/auth.guard.ts:238` decides who someone is
by one test: `if (session.user.phoneNumber)` → customer, otherwise → **operator**. A Google account
carries an email and no phone, so a guest signing in with Google is classified as an operator with
no tenant. RBAC still refuses them, so this is not an open door — but the classification is wrong,
and everything downstream then depends on RBAC catching it rather than on the identity being right.

**Proposed rule:** an operator is someone who **holds a membership**; everyone else signed in is a
customer. That is what the words already mean here — staff have a `member` row, guests never do.
The guard already queries `member` in `lookupMembership`, so the data is at hand; the query would
move earlier and run once. Keep the phone branch: it stays correct and the future OTP login needs it.

This is a change to the code that decides who may do what. It deserves a plan and a review, not an
ad-hoc edit — which is why it is written down here instead of committed.

## 2. Better Auth has no social provider configured — NO LONGER TRUE

Google was wired on 2026-09-05 in `bf8a5a45`. `auth.config.ts:204` registers
`socialProviders.google` with `prompt: 'select_account'`, gated on both credentials being present
(`identity-core.module.ts:265`); `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are optional env keys
(`env.schema.ts:264-265`), so an unset pair simply leaves the provider off. Real credentials exist
in the local gitignored `.env` — **and the secret was pasted into a session transcript, so it must
be rotated before production**; tracked in [[dev-only-data-to-undo-before-production]].

**The original note had the redirect URL wrong.** It said the URL "has to match whatever host the
guest app is served from, so it changes with the dev tunnel and must be re-registered each time."
It is the **API's** host, not the guest app's, and under the named tunnel it does not change:

- better-auth@1.6.30 builds the callback as `${c.context.baseURL}/callback/${provider.id}`
  (`dist/api/routes/callback.mjs:72`), where `context.baseURL` is `baseURL + basePath` and
  `basePath` defaults to `/api/auth`.
- We mount the handler at `/api/auth/*` (`better-auth.handler.ts:23`).
- So the registered URI is `${BETTER_AUTH_BASE_URL}/api/auth/callback/google` — today
  `https://<apex>/api/auth/callback/google`, a stable hostname on the named tunnel. Register once.

## 3. The qr-menu has no auth client at all — STILL TRUE

`grep -rn better-auth apps/qr-menu` returns nothing. `AccountSheet.tsx` is a stub: it takes a phone
number, sets a flag and renders `account.soon` — "code sign-in will work soon". The checkout prompt
the founder asked for has nothing to call yet.

Also worth fixing when this lands: that stub promises the order is found "by the number you give
at checkout", and the QR checkout does not ask for a phone — only an optional name. The founder
chose to leave the copy as-is because it becomes true once this ships.

## 4. The guest lives on a different host than the API — THE REAL BLOCKER (new)

The single-apex scheme puts the guest on `<slug>.<apex>` and the API on the bare apex. That is one
DNS zone but **two origins**, and two separate things break across them:

**The session cookie is host-only by design.** 07.4-06 removed `AUTH_COOKIE_DOMAIN` from the
required set; when it is unset, `crossSubDomainCookies` is never enabled (`auth.config.ts:560-566`,
`identity-core.module.ts:226`) and Better Auth omits `Domain` entirely. A session minted at
`<apex>` is therefore **never sent to `<slug>.<apex>`**. That narrowing was deliberate — it is what
keeps an operator session off every tenant storefront.

**The auth endpoints are not reachable from a tenant host anyway.** Tunnel ingress routes
`<apex>` + `^/(api|v1)/` to the API, but on `*.<apex>` only `^/qr` is special-cased; everything
else falls to the website, and the website rewrites `/v1/*` only — and only outside production
(`apps/website/next.config.mjs:17-24`). A call to `/api/auth/*` from `<slug>.<apex>` lands in Next
and 404s.

Two ways out, and they are not equivalent:

- **Widen the cookie** to `.<apex>`. One env var, and the shape guard already accepts a leading dot
  (`env.schema.ts:336`). But it re-widens the *operator* cookie to every tenant storefront —
  undoing exactly what 07.4-06 narrowed. Do not pick this without re-reading why it was narrowed.
- **Use bearer transport for the guest app.** The `bearer` plugin is already loaded
  (`auth.config.ts:312`). The guest holds a token instead of relying on a cookie, and the operator
  cookie stays host-only. Costs client-side token storage and an XSS blast-radius conversation.

Whichever is chosen, the tenant hosts still need a route to the auth endpoints — a tunnel ingress
rule in dev and a Caddy route in production, neither of which exists today.

## Scope note

The roadmap puts customer records in **Phase 12 (CRM)**, moved to MVP-2 by the 2026-06-12 scope
rebalance. Doing guest sign-in now pulls that forward. That may well be right — a guest who can
find their own order is worth a lot on a first customer — but it is a scope decision, not a task,
and the benefits copy ("find your orders", "faster next time", "offers") is a product decision
that should be written before the screen is built.
