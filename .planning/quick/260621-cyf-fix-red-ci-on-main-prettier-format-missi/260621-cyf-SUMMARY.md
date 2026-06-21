---
quick_id: 260621-cyf
title: 'Fix red CI on main — prettier format + next build env'
status: complete
date: 2026-06-21
commits:
  - 1e967a1 style(ordering): apply prettier to order.aggregate spec
  - f8e18ce ci: inject build-time env for admin/website next builds
---

# Summary — make main CI green

## Context

After merging PR #237/#238, main CI was red. Diagnosis: the same 3 jobs failed on
the pre-existing tip (`47c4ff8`) as on my merges — i.e. **pre-existing**, not a
regression:

- `Dependency audit` — non-blocking by design (deferred CVEs, framework-major).
- `Format check` — one unformatted file.
- `Affected build` — admin/website `next build` failed env validation.

## Fixes

- **Format check:** `prettier --write apps/api/src/contexts/ordering/domain/order.aggregate.spec.ts`
  (the only file `prettier --check .` flagged). Whole-repo check now clean.
- **Affected build:** `next build` runs as `NODE_ENV=production`, where the
  admin/website env schemas (`apps/*/lib/env.ts`) fail-loud on missing values
  instead of using dev defaults. The CI `affected` job never set them. Added
  throwaway build placeholders (reserved `.invalid` TLD) to the job env:
  `NEXT_PUBLIC_API_ORIGIN`, `ADMIN_WEB_URL`, `WEBSITE_URL`, `INTERNAL_API_TOKEN`
  (≥16), `ACTIVE_BRAND_COOKIE_SECRET` (≥32). Safe across the matrix: `env.spec`
  tests fully reset `process.env`, so the `test` job is unaffected.

## Verification

- `prettier --check .` clean.
- Local `nx build website` and `nx build admin` with the new env → both
  "Successfully ran target build" (the `EnvValidationError` is gone).

## Out of scope

- `Dependency audit` red is intentional/non-blocking (deferred CVE migration).
