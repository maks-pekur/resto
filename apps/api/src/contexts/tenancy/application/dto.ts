import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { CurrencyValue, TenantSlug } from '@resto/domain';

export const ProvisionTenantInputSchema = z.object({
  slug: TenantSlug,
  displayName: z.string().min(1).max(120),
  locale: z
    .string()
    .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)
    .default('en'),
  defaultCurrency: CurrencyValue,
});
export type ProvisionTenantInput = z.infer<typeof ProvisionTenantInputSchema>;
export class ProvisionTenantInputDto extends createZodDto(ProvisionTenantInputSchema) {}

export const ScheduleOffboardingInputSchema = z.object({
  requestedBy: z.string().min(1).max(120),
});
export type ScheduleOffboardingInput = z.infer<typeof ScheduleOffboardingInputSchema>;
export class ScheduleOffboardingInputDto extends createZodDto(ScheduleOffboardingInputSchema) {}

export const CancelOffboardingInputSchema = z.object({
  cancelledBy: z.string().min(1).max(120).optional(),
});
export type CancelOffboardingInput = z.infer<typeof CancelOffboardingInputSchema>;
export class CancelOffboardingInputDto extends createZodDto(CancelOffboardingInputSchema) {}
