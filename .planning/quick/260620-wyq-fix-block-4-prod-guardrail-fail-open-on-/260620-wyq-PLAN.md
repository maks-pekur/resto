---
quick_id: 260620-wyq
title: 'Fix BLOCK-4 — prod-guardrail fail-open on BA secret / erasure salt'
status: in-progress
created: 2026-06-20
source_finding: .planning/notes/api-review-2026-06-15.md (BLOCK-4)
---

# Quick Task 260620-wyq — close the prod-guardrail fail-open (BLOCK-4)

## Problem (confirmed by code read)

`assertProdGuardrails` (`apps/api/src/config/prod-guardrails.ts`) only rejects a
secret in prod when it exactly equals a value in `DEV_DEFAULTS`. Two of the most
critical secrets slip through:

- **`BETTER_AUTH_SECRET`** is not in `DEV_DEFAULTS` at all → never value-checked.
  `.env.example:34` ships `local_dev_secret_replace_me_with_a_real_32_char_value`
  (53 chars → passes `min(32)`), and identity-core falls back to
  `DEV_BA_SECRET_FALLBACK = 'dev-only-better-auth-secret-32-chars-padding'`. A known
  BA signing key = forge any session/bearer for any user in any tenant.
- **`AUDIT_ERASURE_SALT`** is guarded against the in-code literal
  `dev-only-erasure-salt-32-chars-padding`, but `.env.example:127` ships a
  _different_ string (`local-dev-erasure-salt-replace-me-...`) → the copied value
  passes. A known salt makes GDPR anonymization reversible.

The schema's `superRefine` requires these to be _present_ in prod but never checks
their _value_ — the guardrail is the value layer, and it's fail-open here.

## Fix (`prod-guardrails.ts` only)

- Move `AUDIT_ERASURE_SALT` out of `DEV_DEFAULTS` into a new
  `FORBIDDEN_SECRET_VALUES` map that lists, per key, **every** value that must
  fail-closed in prod — both the in-code dev fallback and the shipped
  `.env.example` placeholder. Add `BETTER_AUTH_SECRET` with the same two-value
  treatment.
- Add `PLACEHOLDER_MARKERS` (`replace_me`, `replace-me`, `change_me`, `change-me`)
  and reject any guarded secret whose (lowercased) value contains one — so a new
  unreplaced placeholder fails even if the exact literal drifts. Scope markers to
  the two critical secrets to avoid false positives on unrelated env values.
- Keep the existing `DEV_DEFAULTS` exact-match loop for `S3_*` + `INTERNAL_API_TOKEN`
  and the Resend / email-adapter checks unchanged.
- WHY-comment links BLOCK-4 and notes the literals must stay in sync with
  `.env.example` + identity-core's `DEV_BA_SECRET_FALLBACK`.

## Tests (`apps/api/test/unit/prod-guardrails.spec.ts`)

- Add a valid `BETTER_AUTH_SECRET` to the `okProdValues` fixture (else the baseline
  prod env now fails the new check).
- New cases: BA secret = dev fallback → throws; BA secret = `.env.example`
  placeholder → throws; BA secret undefined in prod → throws; erasure salt =
  `.env.example` placeholder → throws; a secret containing a `replace_me` marker →
  throws; baseline real-secrets env still passes.

## Gates

- `nx typecheck api` green.
- `prod-guardrails.spec.ts` green (existing + new cases).

## Out of scope

- Single-sourcing `DEV_DEFAULTS` / `.env.example` / `DEV_BA_SECRET_FALLBACK` from one
  constants module (the review's nice-to-have) — the marker check already provides
  drift resilience; a shared-constants refactor is a separate cleanup.
- The `?? DEV_BA_SECRET_FALLBACK` fallback in identity-core is left as-is: it only
  triggers when the secret is unset, which the schema (presence) + this guardrail
  (now also value/undefined) reject in prod.
