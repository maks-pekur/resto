# Runbook — I-3 prod-fallback audit

> **Authority:** [ADR-0020 § Invariant I-3](../adr/0020-multi-tenancy-and-event-bus-invariants.md).
> Audit performed 2026-05-16 by founder during pre-prod hardening. Prod
> not yet deployed at audit time.

## Inventory and resolution

| Source location                                                                                | Original value                                               | Replaced by                                                                           | Catches future regression                                                                                                 |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/config/env.schema.ts:88-92` (S3\_\* `.default(...)`)                             | `'http://localhost:9000'`, `'minio'`, `'minio_dev_password'` | `.optional()` + entries in `superRefine` required-list                                | Layer 1 (Zod parse) + Layer 2 (`assertProdGuardrails`)                                                                    |
| `apps/api/src/contexts/tenancy/application/offboard-tenant.service.ts:9` (`DEV_SALT_FALLBACK`) | `'dev-only-erasure-salt-32-chars-padding'`                   | constant deleted; service throws if `env.AUDIT_ERASURE_SALT` is undefined             | Layer 1 (existing superRefine) + Layer 2 (`assertProdGuardrails`) + Layer 3 (service throw)                               |
| `apps/qr-menu/src/api/client.ts:5,16` (`VITE_TENANT_SLUG`)                                     | unguarded read of `import.meta.env.VITE_TENANT_SLUG`         | wrapped in `import.meta.env.DEV ? ... : undefined`; Vite tree-shakes from prod bundle | Layer 3 only (qr-menu has no `main.ts` / `loadEnv`); reinforced by `apps/qr-menu/test/bundle-no-dev-leak.spec.ts` CI test |

If a future audit discovers a new dev-fallback, the resolution must
satisfy ADR-0020 I-3: both an `if (NODE_ENV === 'development' || 'test')`
runtime guard AND a non-dev `superRefine` block, OR an equivalent
(Layer 2 / Layer 3) belt-and-suspenders pair. Add the row to this table.

## First-deploy checklist

Before flipping the first real prod deploy, verify each item:

- [ ] Vault (or chosen secret store) contains values for every key
      enforced by `env.schema.ts:superRefine` in non-dev:
      `BETTER_AUTH_SECRET`, `BETTER_AUTH_BASE_URL`, `BETTER_AUTH_DATABASE_URL`,
      `ADMIN_WEB_URL`, `AUTH_COOKIE_DOMAIN`, `AUDIT_ERASURE_SALT`,
      `TRUST_PROXY`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`.
- [ ] None of those values equal a dev default. Specifically:
      `S3_SECRET_KEY != 'minio_dev_password'`, `S3_ACCESS_KEY != 'minio'`,
      `S3_ENDPOINT != 'http://localhost:9000'`,
      `AUDIT_ERASURE_SALT != 'dev-only-erasure-salt-32-chars-padding'`.
- [ ] CI artifact for qr-menu: confirm `apps/qr-menu/dist/assets/*.js`
      contains neither `VITE_TENANT_SLUG` nor `x-tenant-slug`. Reproduce
      locally: `pnpm --filter @resto/qr-menu build && grep -c 'x-tenant-slug' apps/qr-menu/dist/assets/*.js`
      (expect `0`). The automated test `bundle-no-dev-leak.spec.ts` runs in
      CI as a backstop.
- [ ] On first deploy, tail the api logs for one of:
  - **expected (pass)** — `[bootstrap] Resto api listening on :<port>`
  - **expected (fail)** — `prod-guardrails: refusing to start: <list>`
    followed by `process.exit(1)`. If you see this, fix the env vars in
    Vault and redeploy. Do NOT bypass.

## Cross-references

- ADR-0020 § Invariant I-3 — the canonical rule.
- `docs/superpowers/specs/2026-05-16-i3-prod-audit-startup-assertion-design.md`
  — design rationale.
- `apps/api/src/config/prod-guardrails.ts` — Layer 2 implementation.
- `apps/qr-menu/test/bundle-no-dev-leak.spec.ts` — qr-menu CI gate.
