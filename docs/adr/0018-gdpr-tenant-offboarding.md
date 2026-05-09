# ADR-0018: GDPR tenant offboarding

- **Status:** accepted
- **Date:** 2026-05-09
- **Deciders:** Resto core team
- **Supersedes:** --
- **Superseded by:** --

## Context

Resto hosts in eu-central-1 (per ADR-0011); GDPR applies. The platform has had only soft-archive (`tenants.archived_at`) since RES-78, with no hard-deletion path for offboarding tenants. Under Article 17 (right to erasure), a tenant who terminates the contract is entitled to deletion of their personal data within a reasonable time. The exposure becomes unblockable with the first paying tenant.

This ADR fixes the deletion model and decisions; the implementation lands in three sequential PRs (RES-138 / RES-103 phase 1: domain layer; RES-103/B: HTTP endpoint; RES-103/C: scheduler integration).

## Decision

Tenant offboarding flow:

1. **Schedule.** Operator-triggered (HTTP endpoint in phase 2). Aggregate transitions to `pending_offboarding`; `archived_at` set so AuthGuard (RES-127) blocks all traffic immediately. `TenantOffboardingScheduledV1` emitted.
2. **30-day cool-off.** Reversible -- cancellation via DELETE on the same endpoint restores `active`. `TenantOffboardingCancelledV1` emitted.
3. **Execute erasure.** Background job (phase 3) or manual CLI (phase 1). Cascade hard-delete of tenant-scoped tables; anonymisation of `audit_log` rows for the tenant; tombstone of the `tenants` row. `TenantErasureCompletedV1` emitted.

### Hard-deleted (cascade)

`tenant_domains`, `member`, `organization_role`, `invitation`, `customer_profiles`, all menu tables (categories/items/modifiers), `outbox_events`, `inbox_processed`, and `user` rows where the user holds zero remaining memberships (cascades via FK to `session`/`account`/`verification`/`two_factor`).

### Anonymised (kept for audit)

`audit_log` rows scoped to the tenant. Top-level columns: `actor_subject` and `target_id` become `'erased:' || sha256(salt || value)` (one-way); `ip_address` and `user_agent` become `NULL`. Inside `payload`: `userId` becomes the same hash form; `ipAddress` / `userAgent` / `email` become JSON `null`. Salt comes from env `AUDIT_ERASURE_SALT` (>=32 chars, immutable post-deploy -- rotation would invalidate cross-row correlation).

### Pending outbox events

All `outbox_events` rows scoped to the tenant are deleted as part of the cascade -- including any not-yet-dispatched `TenantProvisioned`/`TenantArchived`/`TenantOffboardingScheduled`/`TenantOffboardingCancelled` rows. Only `TenantErasureCompletedV1` is appended (post-erasure) and dispatched to the audit consumer.

### Tombstoned (anonymised stub kept)

The `tenants` row itself. `displayName='[erased]'`, `slug='erased-<id-prefix>-<timestamp>'`, `stripe_account_id=null`, `status='erased'`. The row is preserved so `audit_log.tenant_id` (FK with `ON DELETE SET NULL`) keeps its reference and post-erasure compliance queries (`SELECT * FROM audit_log WHERE tenant_id = X`) still scope correctly.

### Out of scope

- **Backups.** Article 17(3)(b) exempts ongoing storage in immutable backups. Backup retention (7-30d per RES-102) is the outer SLA -- tenant data ages out of backups via natural rotation. Documented in the runbook at `docs/runbooks/tenant-offboarding.md`.
- **Customer-individual erasure** (Article 17 personal right for end-customers). Separate ticket once the ordering bounded context ships and customer phone/email lives somewhere. The audit-log anonymisation pattern is reusable.
- **TLS / load-balancer / CDN access logs.** Hosting infra concern, covered separately.

## Alternatives considered

- **Hard-delete `tenants` row.** Rejected: `audit_log.tenant_id` becomes orphan-NULL after `ON DELETE SET NULL`, losing compliance scoping. Tombstone preserves it.
- **Anonymise everything (no hard-delete).** Rejected: unnecessary retention of catalog/menu/customer rows that have no audit value; clutters DB.
- **Hard-delete audit_log too.** Rejected: removes forensic / regulatory reporting capability without GDPR mandate (audit logs typically qualify for legitimate-interest retention with PII removed).

## Consequences

### Positive

- Clear erasure SLA (30d cool-off + execution).
- Audit trail preserved for compliance / forensic needs.
- Reversible during cool-off -- operator mistake is recoverable.

### Negative

- 30-day cool-off creates "tenant blocked but data retained" window. Acceptable; documented in runbook.
- `audit_log` anonymisation requires the salt to be persisted out-of-band (Vault / 1Password Connect). Salt loss -> audit rows lose cross-row correlation but data itself is still anonymised (one-way hash).
- Tombstone keeps the `tenants` row forever (slug `erased-...` permanently consuming the namespace). Acceptable; UUID-based stub is unique.

### Neutral

- Backup retention boundary is fixed by the backup-policy ADR (RES-102), not this one.

## Implementation notes

The cascade DELETE chain runs through a `SECURITY DEFINER` function `tenancy_erase_tenant(uuid, text)` (migration `0011_tenancy_erase_function.sql`). Migration `0008` revoked DELETE from the runtime `resto_app` role; rather than re-grant DELETE broadly, the function exposes exactly the erasure cascade and nothing else. Owned by `resto_admin`, EXECUTE granted only to `resto_app`. The function asserts `app.is_system = true` (set by `db.withoutTenant`) and rejects salts under 32 chars at the SQL boundary.

Phase 1 (RES-138 / RES-103/A): migrations `0010_tenant_offboarding.sql` (schema) + `0011_tenancy_erase_function.sql` (SECURITY DEFINER function); aggregate methods + repo `eraseTenant`; `OffboardTenantService`; manual CLI; runbook. No HTTP endpoint.

Phase 2 (RES-103/B): `POST /internal/v1/tenants/:id/offboard`, `DELETE` cancellation, `GET /scheduled`. e2e covers cool-off + erasure execution.

Phase 3 (RES-103/C, MVP-2): wires `OffboardTenantService.executeErasure` into the leader-locked job-runner pattern (precedent: RES-115 `OutboxDispatcher`).
