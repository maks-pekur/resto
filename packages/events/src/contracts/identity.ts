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
