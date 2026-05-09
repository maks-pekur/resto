import { z } from 'zod';
import { Currency, TenantSlug } from '@resto/domain';

export const ProvisionTenantInput = z.object({
  slug: TenantSlug,
  displayName: z.string().min(1).max(120),
  locale: z
    .string()
    .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)
    .default('en'),
  defaultCurrency: Currency,
});
export type ProvisionTenantInput = z.infer<typeof ProvisionTenantInput>;

export const ScheduleOffboardingInput = z.object({
  requestedBy: z.string().min(1).max(120),
});
export type ScheduleOffboardingInput = z.infer<typeof ScheduleOffboardingInput>;

export const CancelOffboardingInput = z.object({
  cancelledBy: z.string().min(1).max(120).optional(),
});
export type CancelOffboardingInput = z.infer<typeof CancelOffboardingInput>;
