# Phase 04b — Deferred Items

Pre-existing issues discovered during 04b-01 execution that are out of scope
(not introduced by this plan). Documented here so future plans / sweeps can
pick them up.

## Lint (pre-existing, unrelated to Wave 0)

- `apps/admin/lib/actions/sign-in-and-bind-org.ts:69-77` — three
  `@typescript-eslint/no-unsafe-assignment` / `no-unsafe-member-access`
  errors on a BA response `body.session.id` path. Pre-existing on `main`;
  not touched by 04b-01.
