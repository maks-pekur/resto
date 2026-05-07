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
