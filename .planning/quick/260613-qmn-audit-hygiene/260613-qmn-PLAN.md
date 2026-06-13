---
quick_id: 260613-qmn
slug: audit-hygiene
date: 2026-06-13
status: planned
source: .planning/AUDIT.md findings #22, #23, #24 (LOW)
---

# Quick Task 260613-qmn: Audit hygiene one-liners (#22, #23, #24)

Three small, independent fixes from the deep audit. Each is its own atomic commit.

## Task 1 — #22: redact `title` on 5xx (info-leak)

- **file:** `apps/api/src/shared/exception.filter.ts`
- **problem:** `title = exception.message` for HttpException; RES-175 only redacts
  `detail`, so a 5xx (e.g. `BadGatewayException({ message: err.message })` from
  `BetterAuthBootstrapFailureError`) leaks the raw cause in `title`.
- **action:** Compute `isServerError` before building `problem`; when true, coerce
  `title` to the generic `'Internal Server Error'`. This also makes the `type`-URI
  fallback (`slugify(title)`) safe. Reuse the single `isServerError` for the
  existing detail redaction.
- **done:** A 5xx response never echoes `exception.message` in `title`.

## Task 2 — #23: add the documented `redact` config to the db logger

- **file:** `packages/db/src/logger.ts`
- **problem:** both CLAUDE.md files state `logger.ts` redacts `password/token/
email/phone/params`; the actual pino config has no `redact`. Reality must match
  the documented invariant (re-enabling Drizzle query logging would otherwise emit
  PII verbatim).
- **action:** Add `redact` with those paths + one-level wildcards, `censor:
'[redacted]'`.
- **done:** `logger.ts` carries the redact config the docs promise.

## Task 3 — #24: drop the stale correlationId-violation note

- **file:** `CLAUDE.md` (root, Architectural Constraints, line ~276)
- **problem:** audit verified identity does NOT violate the OTel-correlationId
  invariant (all emit sites use `buildEnvelope`); the "identity context currently
  violates this — see CONCERNS.md" note is false.
- **action:** Remove the trailing stale sentence.
- **done:** Constraint line no longer claims a non-existent violation.

## Out of scope

- All other AUDIT findings. #1 (RBAC bypass) goes through a discussion phase next.

## must_haves

- truths:
  - "5xx ProblemDetails title is generic, never the exception message"
  - "db logger has redact covering password/token/email/phone/params"
  - "root CLAUDE.md no longer claims identity violates the correlationId invariant"
- artifacts:
  - "apps/api/src/shared/exception.filter.ts"
  - "packages/db/src/logger.ts"
  - "CLAUDE.md"
