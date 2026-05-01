import { z } from 'zod';
import { Currency, TenantSlug } from '@resto/domain';

/**
 * Input shape for `provisionTenant`. Used by the internal HTTP endpoint
 * and by the seed CLI (RES-81). Slug and currency are validated against
 * the domain primitives — uppercase ISO-4217, kebab-case + reserved
 * list — so application code never has to guess.
 */
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
