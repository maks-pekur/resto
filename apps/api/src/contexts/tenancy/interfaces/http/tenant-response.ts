import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import type { TenantSnapshot } from '../../domain/tenant.aggregate';

const TenantResponseSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  displayName: z.string(),
  status: z.string(),
  locale: z.string(),
  defaultCurrency: z.string(),
  primaryDomain: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
  offboardingScheduledAt: z.string().nullable(),
  offboardingExecutedAt: z.string().nullable(),
  offboardingRequestedBy: z.string().nullable(),
});

export class TenantResponseDto extends createZodDto(TenantResponseSchema) {}
export type TenantResponse = z.infer<typeof TenantResponseSchema>;

export const toResponse = (s: TenantSnapshot): TenantResponse => ({
  id: s.id,
  slug: s.slug,
  displayName: s.displayName,
  status: s.status,
  locale: s.locale,
  defaultCurrency: s.defaultCurrency,
  primaryDomain: s.primaryDomain.domain,
  createdAt: s.createdAt.toISOString(),
  updatedAt: s.updatedAt.toISOString(),
  archivedAt: s.archivedAt?.toISOString() ?? null,
  offboardingScheduledAt: s.offboardingScheduledAt?.toISOString() ?? null,
  offboardingExecutedAt: s.offboardingExecutedAt?.toISOString() ?? null,
  offboardingRequestedBy: s.offboardingRequestedBy,
});
