/**
 * RES-252 / ADR-0020 I-1 — explicit allowlist of files allowed to call
 * `db.withoutTenant(reason, op)`. Each entry below is a system-context
 * caller that cannot bind an ALS tenant (lookup happens before tenant
 * resolution, message-broker delivery path, platform-wide tables, CLI).
 *
 * TEN-11 / TEN-12: every file in this list must (a) exist on disk
 * (asserted at boot by `assertWithoutTenantCallsiteRegistered` in
 * preflight.ts — catches renamed/deleted files) and (b) be permitted to
 * call `db.withoutTenant` by the ESLint per-file override in each
 * package's eslint.config.mjs.
 *
 * ESLint configs in apps/api, packages/db, packages/events mirror this
 * list in per-package override blocks. The parity test at
 * test/unit/withoutTenant-allowlist.spec.ts enforces they stay in sync.
 *
 * To add a new caller: justify here, add to the relevant package's
 * eslint.config.mjs override block, re-run the parity test.
 */
export const WITHOUT_TENANT_ALLOWLIST = [
  // Host-based brand resolution: runs before ALS tenant binding because
  // the host IS what resolves the tenant.
  'apps/api/src/contexts/tenancy/infrastructure/brand-drizzle.repository.ts',

  // Tenant lifecycle (findBySlug / findByDomainHost / save / erase / etc.):
  // lookups happen before ALS binding; platform-level ops cross-tenant by design.
  'apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts',

  // Identity event emitter writes outbox from Better Auth hook handlers;
  // BA hooks fire outside any HTTP request, so no ALS tenant is bound.
  'apps/api/src/contexts/identity/infrastructure/identity-event-emitter.adapter.ts',

  // db:audit-fks CLI tool — system-context schema scan via information_schema.
  'packages/db/src/cli/audit-fks.ts',

  // Inbox dedup wrapper — message-broker delivery has no ALS tenant; the
  // envelope carries tenantId for the downstream handler.
  'packages/events/src/inbox/run-deduped.ts',

  // Outbox dispatcher performs a cross-tenant scan (claim / release /
  // mark-delivered) — it must see all tenants' rows; no ALS binding applies.
  'packages/events/src/outbox/dispatcher.ts',

  // TEN-13: scheduled inbox retention sweep — see packages/db/src/inbox-retention.ts.
  'packages/db/src/inbox-retention.ts',

  // AUTH-10 / Phase 3: NATS subscriber DLQ branch emits a platform-level
  // identity.email_dispatch_failed.v1 alert envelope when a poison message
  // exhausts max_deliver. Fires from message-broker delivery code (no HTTP
  // middleware, no ALS tenant), and the poison envelope itself may not
  // carry a parseable tenantId — alert is platform-scoped.
  'packages/events/src/infrastructure/nats-subscriber.ts',

  // AUTH-01 / Phase 3 / D-05 + D-17: Resend email adapter — terminal
  // failure (3 retries exhausted on 5xx, or 4xx including 429) emits
  // identity.email_dispatch_failed.v1 from the BA send-callback path.
  // BA hooks fire outside HTTP middleware (no ALS), and the verification
  // email pre-org-bind path has no tenantId on data.user.activeOrganization
  // yet. tenantId IS bound via withTenantId when available — this
  // allowlist entry covers the genuine pre-org-bind branch only.
  'apps/api/src/contexts/identity/infrastructure/email/resend.adapter.ts',

  // CAT-10 / D-4a-07 / Phase 4a Plan 06: catalog Redis cache adapter falls
  // back to `nextval('menu_versions_seq')` when Redis is unavailable. The
  // sequence is platform-level (global) so no tenant binds; the operation
  // is the documented degrade path for the menu-version port.
  'apps/api/src/contexts/catalog/infrastructure/redis-catalog-cache.adapter.ts',
] as const;

export type WithoutTenantAllowedFile = (typeof WITHOUT_TENANT_ALLOWLIST)[number];
