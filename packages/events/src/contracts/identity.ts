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
