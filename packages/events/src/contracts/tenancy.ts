import { z } from 'zod';
import { Currency, TenantId, TenantSlug } from '@resto/domain';
import { defineEventContract } from '../envelope';

/**
 * Emitted when a new tenant has been provisioned: the tenant row exists,
 * the owner user has a one-time password, and the subdomain is
 * registered. This is the canonical "first event in the system" — the
 * pattern other contexts follow.
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

export const TenantSuspendedV1Payload = z.object({
  tenantId: TenantId,
  requestedBy: z.string().min(1),
  suspendedAt: z.coerce.date(),
});
export type TenantSuspendedV1Payload = z.infer<typeof TenantSuspendedV1Payload>;

export const TenantSuspendedV1 = defineEventContract({
  type: 'tenancy.tenant_suspended.v1',
  payload: TenantSuspendedV1Payload,
});

export const TenantResumedV1Payload = z.object({
  tenantId: TenantId,
  resumedAt: z.coerce.date(),
});
export type TenantResumedV1Payload = z.infer<typeof TenantResumedV1Payload>;

export const TenantResumedV1 = defineEventContract({
  type: 'tenancy.tenant_resumed.v1',
  payload: TenantResumedV1Payload,
});

export const TenantPaymentAccountLinkedV1Payload = z.object({
  tenantId: TenantId,
  stripeAccountId: z.string().min(1).max(255),
  accountType: z.enum(['express', 'standard']),
});
export type TenantPaymentAccountLinkedV1Payload = z.infer<
  typeof TenantPaymentAccountLinkedV1Payload
>;

export const TenantPaymentAccountLinkedV1 = defineEventContract({
  type: 'tenancy.tenant_payment_account_linked.v1',
  payload: TenantPaymentAccountLinkedV1Payload,
});

export const TenantPaymentCapabilitiesAppliedV1Payload = z.object({
  tenantId: TenantId,
  chargesEnabled: z.boolean(),
  payoutsEnabled: z.boolean(),
  onboardingStatus: z.enum(['not_started', 'pending', 'complete', 'restricted']),
});
export type TenantPaymentCapabilitiesAppliedV1Payload = z.infer<
  typeof TenantPaymentCapabilitiesAppliedV1Payload
>;

export const TenantPaymentCapabilitiesAppliedV1 = defineEventContract({
  type: 'tenancy.tenant_payment_capabilities_applied.v1',
  payload: TenantPaymentCapabilitiesAppliedV1Payload,
});
