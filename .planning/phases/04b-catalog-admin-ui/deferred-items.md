# Phase 04b — Deferred Items

Pre-existing issues discovered during 04b-01 execution that are out of scope
(not introduced by this plan). Documented here so future plans / sweeps can
pick them up.

## Lint (pre-existing, unrelated to Wave 0)

- `apps/admin/lib/actions/sign-in-and-bind-org.ts:69-77` — three
  `@typescript-eslint/no-unsafe-assignment` / `no-unsafe-member-access`
  errors on a BA response `body.session.id` path. Pre-existing on `main`;
  not touched by 04b-01.

## Lint (pre-existing, surfaced during 04b-03 acceptance gate)

- `apps/api/src/contexts/identity/infrastructure/email/resend.adapter.ts:266`,
  `:285` — `no-confusing-void-expression` + `no-unnecessary-condition`.
  Pre-existing on `main`; not touched by 04b-03.
- `apps/api/test/e2e/cross-tenant-nats-mix.e2e.spec.ts:94`, `:147` —
  `array-type` (`Array<T>` instead of `T[]`). Pre-existing on `main`.
- `apps/api/test/e2e/gdpr-retention.e2e.spec.ts:4`, `:147` — unused `lt`
  import + `require()` style import. Pre-existing on `main`.
