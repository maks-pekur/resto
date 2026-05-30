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
