/**
 * RES-252 / ADR-0020 I-1 — explicit allowlist of files allowed to call
 * `db.withoutTenant(reason, op)`. Each entry below is a system-context
 * caller that cannot bind an ALS tenant (lookup happens before tenant
 * resolution, message-broker delivery path, platform-wide tables, CLI).
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

  // Audit consumer writes to the platform-wide audit_log table; tenant_id
  // is nullable for platform events (RES-204 added the 'tenant_erased' row).
  'apps/api/src/contexts/audit/application/record-audit.service.ts',

  // Identity event emitter writes outbox from Better Auth hook handlers;
  // BA hooks fire outside any HTTP request, so no ALS tenant is bound.
  'apps/api/src/contexts/identity/infrastructure/identity-event-emitter.adapter.ts',

  // db:audit-fks CLI tool — system-context schema scan via information_schema.
  'packages/db/src/cli/audit-fks.ts',

  // Inbox dedup wrapper — message-broker delivery has no ALS tenant; the
  // envelope carries tenantId for the downstream handler.
  'packages/events/src/inbox/run-deduped.ts',
] as const;

export type WithoutTenantAllowedFile = (typeof WITHOUT_TENANT_ALLOWLIST)[number];
