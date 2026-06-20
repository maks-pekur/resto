---
quick_id: 260620-wyq
title: 'Fix BLOCK-4 — prod-guardrail fail-open on BA secret / erasure salt'
status: complete
date: 2026-06-20
source_finding: .planning/notes/api-review-2026-06-15.md (BLOCK-4)
commits:
  - a3e935c fix(config): close prod-guardrail fail-open on BETTER_AUTH_SECRET and AUDIT_ERASURE_SALT (BLOCK-4)
---

# Summary — BLOCK-4 prod-guardrail fail-open closed

## What was wrong (confirmed by code read)

`assertProdGuardrails` only rejected a secret in prod when it exactly equalled a
value in `DEV_DEFAULTS`:

- `BETTER_AUTH_SECRET` was **not in `DEV_DEFAULTS`** → never value-checked. The
  `.env.example` placeholder (`local_dev_secret_replace_me_...`, 53 chars) passes
  `min(32)`; identity-core also falls back to
  `DEV_BA_SECRET_FALLBACK = 'dev-only-better-auth-secret-32-chars-padding'`. A known
  BA signing key forges any session/bearer across every tenant.
- `AUDIT_ERASURE_SALT` was guarded against the in-code literal
  (`dev-only-erasure-salt-32-chars-padding`) but **not** the _different_ string
  `.env.example` ships (`local-dev-erasure-salt-replace-me-...`) → the copied value
  slipped through, making GDPR anonymization reversible.

`INTERNAL_API_TOKEN`/`S3_*` matched their `DEV_DEFAULTS` literals exactly and were
correctly caught — so this was specifically a gap for the two most critical secrets.

## Fix (`apps/api/src/config/prod-guardrails.ts`)

- Added `FORBIDDEN_SECRET_VALUES` keyed by `BETTER_AUTH_SECRET` + `AUDIT_ERASURE_SALT`,
  each listing **both** bad values (in-code dev fallback AND the shipped
  `.env.example` placeholder). The guard now rejects unset/blank, an exact forbidden
  value, or — via `PLACEHOLDER_MARKERS` (`replace_me`/`replace-me`/`change_me`/
  `change-me`) — any value still carrying a replace-me marker, so a new placeholder
  fails even if the exact literal drifts.
- Moved `AUDIT_ERASURE_SALT` out of `DEV_DEFAULTS` into the richer check; left
  `S3_*` + `INTERNAL_API_TOKEN` exact-match and the Resend/email-adapter checks
  unchanged. Marker check scoped to the two critical secrets to avoid false positives.

## Verification

- `nx typecheck api` green.
- `prod-guardrails.spec.ts` 26/26 (5 new BLOCK-4 cases: BA secret = dev fallback /
  `.env.example` placeholder / unset / marker → throw; erasure salt = `.env.example`
  placeholder → throw). Full `test/unit` suite 433/433.
- Hardcoded literals verified byte-for-byte against `.env.example` (lines 34, 127)
  and identity-core `DEV_BA_SECRET_FALLBACK`.
- Ripple fixed: `okProdValues` and `identity-boot-integration.spec.ts`'s prod fixtures
  gained a valid `BETTER_AUTH_SECRET` (the new check would otherwise trip the baseline
  "passes" cases — which is the correct fail-closed behaviour).

## Out of scope

- Single-sourcing `DEV_DEFAULTS` / `.env.example` / `DEV_BA_SECRET_FALLBACK` from one
  constants module (review nice-to-have) — marker check already gives drift resilience.
- The `?? DEV_BA_SECRET_FALLBACK` fallback in identity-core is safe to leave: it only
  fires when the secret is unset, which schema-presence + this guardrail reject in prod.
- Remaining review BLOCKs: BLOCK-2 (GDPR erasure of orders/payments PII), BLOCK-3
  (order lifecycle + Stripe payment — that's Phase 8, a whole phase, not a quick fix).
