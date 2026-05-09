import { z } from 'zod';
import { Currency, TenantId, TenantSlug } from '@resto/domain';
import { defineEventContract } from '../envelope';

/**
 * Emitted when a new tenant has been provisioned: the tenant row exists,
 * its Keycloak organization is created, the owner user has a one-time
 * password, and the subdomain is registered. This is the canonical
 * "first event in the system" — the pattern other contexts follow.
 */
export const TenantProvisionedV1Payload = z.object({
  tenantId: TenantId,
  slug: TenantSlug,
  displayName: z.string().min(1),
  defaultCurrency: Currency,
});
export type TenantProvisionedV1Payload = z.infer<typeof TenantProvisionedV1Payload>;

export const TenantProvisionedV1 = defineEventContract({
  type: 'tenancy.tenant_provisioned.v1',
  payload: TenantProvisionedV1Payload,
});

export const TenantArchivedV1Payload = z.object({
  tenantId: TenantId,
});
export type TenantArchivedV1Payload = z.infer<typeof TenantArchivedV1Payload>;

export const TenantArchivedV1 = defineEventContract({
  type: 'tenancy.tenant_archived.v1',
  payload: TenantArchivedV1Payload,
});

export const TenantOffboardingScheduledV1Payload = z.object({
  tenantId: TenantId,
  requestedBy: z.string().min(1),
  scheduledAt: z.coerce.date(),
});
export type TenantOffboardingScheduledV1Payload = z.infer<
  typeof TenantOffboardingScheduledV1Payload
>;

export const TenantOffboardingScheduledV1 = defineEventContract({
  type: 'tenancy.tenant_offboarding_scheduled.v1',
  payload: TenantOffboardingScheduledV1Payload,
});

export const TenantOffboardingCancelledV1Payload = z.object({
  tenantId: TenantId,
  cancelledAt: z.coerce.date(),
});
export type TenantOffboardingCancelledV1Payload = z.infer<
  typeof TenantOffboardingCancelledV1Payload
>;

export const TenantOffboardingCancelledV1 = defineEventContract({
  type: 'tenancy.tenant_offboarding_cancelled.v1',
  payload: TenantOffboardingCancelledV1Payload,
});

export const TenantErasureCompletedV1Payload = z.object({
  tenantId: TenantId,
  executedAt: z.coerce.date(),
});
export type TenantErasureCompletedV1Payload = z.infer<typeof TenantErasureCompletedV1Payload>;

export const TenantErasureCompletedV1 = defineEventContract({
  type: 'tenancy.tenant_erasure_completed.v1',
  payload: TenantErasureCompletedV1Payload,
});
