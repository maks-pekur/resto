---
title: Guest sign-in with Google, and the principal rule it breaks
date: 2026-09-04
priority: medium
status: pending
---

# Guest sign-in via Google — what it needs, and the one thing it breaks

Founder asked (2026-09-04) for an unobtrusive offer to sign in at checkout, describing the
benefits, with "continue without an account" always available. Phone/OTP was the first idea and
was dropped: it needs an SMS provider, per-message cost and abuse limits. Google is cheaper and
has no per-use price — but it is not a config toggle. Three things stand in the way.

## 1. The principal rule says "customer = has a phone number"

`apps/api/src/contexts/identity/interfaces/http/guards/auth.guard.ts` decides who someone is by
one test: `if (session.user.phoneNumber)` → customer, otherwise → **operator**. A Google account
carries an email and no phone, so a guest signing in with Google is classified as an operator with
no tenant. RBAC still refuses them, so this is not an open door — but the classification is wrong,
and everything downstream then depends on RBAC catching it rather than on the identity being right.

**Proposed rule:** an operator is someone who **holds a membership**; everyone else signed in is a
customer. That is what the words already mean here — staff have a `member` row, guests never do.
The guard already queries `member` in `lookupBaseRole`, so the data is at hand; the query would
move earlier and run once. Keep the phone branch: it stays correct and the future OTP login needs it.

This is a change to the code that decides who may do what. It deserves a plan and a review, not an
ad-hoc edit — which is why it is written down here instead of committed.

## 2. Better Auth has no social provider configured

`auth.config.ts` loads `bearer`, `organization` and `twoFactor` only — no `socialProviders`. The
Google client id and secret are the founder's to create in Google Cloud Console; they become two
new env vars, and both belong in the ephemeral-host guardrail's thinking: the OAuth **redirect
URL** has to match whatever host the guest app is served from, so it changes with the dev tunnel
and must be re-registered in Google each time. See
[[dev-only-data-to-undo-before-production]].

## 3. The qr-menu has no auth client at all

`AccountSheet.tsx` is a stub: it takes a phone number, sets a flag and renders
`account.soon` — "code sign-in will work soon". No Better Auth client is imported anywhere in
`apps/qr-menu`. The checkout prompt the founder asked for has nothing to call yet.

Also worth fixing when this lands: that stub promises the order is found "by the number you give
at checkout", and the QR checkout does not ask for a phone — only an optional name. The founder
chose to leave the copy as-is because it becomes true once this ships.

## Scope note

The roadmap puts customer records in **Phase 12 (CRM)**, moved to MVP-2 by the 2026-06-12 scope
rebalance. Doing guest sign-in now pulls that forward. That may well be right — a guest who can
find their own order is worth a lot on a first customer — but it is a scope decision, not a task,
and the benefits copy ("find your orders", "faster next time", "offers") is a product decision
that should be written before the screen is built.
