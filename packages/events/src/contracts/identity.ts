import { z } from 'zod';
import { TenantId } from '@resto/domain';
import { defineEventContract } from '../envelope';

export const IdentitySignedInV1Payload = z.object({
  userId: z.string().uuid(),
  actorSubject: z.string().optional(),
  tenantId: TenantId,
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
});
export type IdentitySignedInV1Payload = z.infer<typeof IdentitySignedInV1Payload>;

export const IdentitySignedInV1 = defineEventContract({
  type: 'identity.signed_in.v1',
  payload: IdentitySignedInV1Payload,
});

export const IdentitySignedOutV1Payload = z.object({
  userId: z.string().uuid(),
  tenantId: TenantId,
  actorSubject: z.string().optional(),
  sessionId: z.string().optional(),
});
export type IdentitySignedOutV1Payload = z.infer<typeof IdentitySignedOutV1Payload>;

export const IdentitySignedOutV1 = defineEventContract({
  type: 'identity.signed_out.v1',
  payload: IdentitySignedOutV1Payload,
});

export const IdentityPasswordResetCompletedV1Payload = z.object({
  userId: z.string().uuid(),
  tenantId: TenantId.optional(),
  actorSubject: z.string().optional(),
  sessionRevokedCount: z.number().int().nonnegative(),
});
export type IdentityPasswordResetCompletedV1Payload = z.infer<
  typeof IdentityPasswordResetCompletedV1Payload
>;

export const IdentityPasswordResetCompletedV1 = defineEventContract({
  type: 'identity.password_reset_completed.v1',
  payload: IdentityPasswordResetCompletedV1Payload,
});

/**
 * Phase 3 / AUTH-10 + D-05: one contract serves two distinct flows
 * discriminated by `reason`:
 *
 * - `dlq_routed` — NATS subscriber routed a poison envelope to
 *   `dlq.<subject>` after `max_deliver` was exhausted. `userId`/`tenantId`
 *   may be absent (the envelope may have been unparseable).
 * - `resend_terminal_failure` — Resend SDK call exhausted its retry
 *   budget for an operator email (invitation / reset / verification).
 *   `userId` and `tenantId` are known at the call site.
 *
 * `tenantId` is optional because the DLQ branch fires from subscriber
 * code with no ALS tenant context bound (ADR-0020 I-6), and a poison
 * envelope may not carry a parseable `tenantId`. The alert is still
 * actionable without one.
 */
export const IdentityEmailDispatchFailedV1Payload = z.object({
  reason: z.enum(['dlq_routed', 'resend_terminal_failure']),
  originalSubject: z.string().min(1).max(255),
  originalEnvelopeId: z.string().uuid().optional(),
  redeliveryCount: z.number().int().nonnegative().optional(),
  errorMessage: z.string().max(2048).optional(),
  userId: z.string().uuid().optional(),
  tenantId: TenantId.optional(),
});
export type IdentityEmailDispatchFailedV1Payload = z.infer<
  typeof IdentityEmailDispatchFailedV1Payload
>;

export const IdentityEmailDispatchFailedV1 = defineEventContract({
  type: 'identity.email_dispatch_failed.v1',
  payload: IdentityEmailDispatchFailedV1Payload,
});

/**
 * Phase 3 / AUTH-09 / D-16a (REINTERPRETED per plan-checker B-4 2026-05-30):
 *
 * Emitted by `organizationHooks.afterUpdateMemberRole` in `auth.config.ts`
 * on every BA-driven role mutation. Closes the role-change BLOCKED row in
 * `.planning/phases/01-tenancy-hardening/audit-gap.md` (the hook exists in
 * BA 1.4.22 at `node_modules/.../organization/types.d.mts:520-525` — the
 * earlier "BA ≥ 1.5 trigger" narrative was based on a wrong hook path).
 *
 * `actorUserId` is the user who performed the role change. Best-effort:
 * BA does not always surface the calling user in the hook context; the
 * field is optional so the audit row materialises even when null.
 *
 * `previousRole` / `newRole` are BA role-slug strings; in practice these
 * are the system presets `owner` / `admin` / `staff` plus any custom
 * tenant-creatable role (which BA stores in `tenant_role`).
 */
export const IdentityRoleChangedV1Payload = z.object({
  userId: z.string().uuid(),
  tenantId: TenantId,
  previousRole: z.string().min(1).max(64),
  newRole: z.string().min(1).max(64),
  actorUserId: z.string().uuid().optional(),
});
export type IdentityRoleChangedV1Payload = z.infer<typeof IdentityRoleChangedV1Payload>;

export const IdentityRoleChangedV1 = defineEventContract({
  type: 'identity.role_changed.v1',
  payload: IdentityRoleChangedV1Payload,
});

// D-16 (08.3): audit contracts for owner-managed role lifecycle
export const IdentityRoleCreatedV1Payload = z.object({
  tenantId: TenantId,
  roleSlug: z.string().min(1).max(64),
  permission: z.record(z.string(), z.array(z.string())),
  actorUserId: z.string().uuid(),
});
export type IdentityRoleCreatedV1Payload = z.infer<typeof IdentityRoleCreatedV1Payload>;

export const IdentityRoleCreatedV1 = defineEventContract({
  type: 'identity.role_created.v1',
  payload: IdentityRoleCreatedV1Payload,
});

export const IdentityRolePermissionsChangedV1Payload = z.object({
  tenantId: TenantId,
  roleSlug: z.string().min(1).max(64),
  previousPermission: z.record(z.string(), z.array(z.string())),
  newPermission: z.record(z.string(), z.array(z.string())),
  actorUserId: z.string().uuid(),
});
export type IdentityRolePermissionsChangedV1Payload = z.infer<
  typeof IdentityRolePermissionsChangedV1Payload
>;

export const IdentityRolePermissionsChangedV1 = defineEventContract({
  type: 'identity.role_permissions_changed.v1',
  payload: IdentityRolePermissionsChangedV1Payload,
});

export const IdentityRoleDeletedV1Payload = z.object({
  tenantId: TenantId,
  roleSlug: z.string().min(1).max(64),
  actorUserId: z.string().uuid(),
});
export type IdentityRoleDeletedV1Payload = z.infer<typeof IdentityRoleDeletedV1Payload>;

export const IdentityRoleDeletedV1 = defineEventContract({
  type: 'identity.role_deleted.v1',
  payload: IdentityRoleDeletedV1Payload,
});
