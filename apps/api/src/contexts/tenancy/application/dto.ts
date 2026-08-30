import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  BrandContactsSchema,
  CountryCodeValue,
  LocalizedText,
  SocialLinksSchema,
  TenantSlug,
} from '@resto/domain';

export const ProvisionTenantInputSchema = z.object({
  slug: TenantSlug,
  displayName: z.string().min(1).max(120),
  country: CountryCodeValue,
  locale: z
    .string()
    .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)
    .optional(),
  /**
   * D-25/D-30 (10.2 plan 13): omitted by every caller except the signup
   * flow, which provisions `'pending_setup'` so onboarding has something
   * to finalize. Defaults to `'active'` inside `Tenant.provision`.
   */
  status: z.enum(['pending_setup', 'active']).optional(),
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

export const SuspendTenantInputSchema = z.object({
  requestedBy: z.string().min(1).max(120),
});
export type SuspendTenantInput = z.infer<typeof SuspendTenantInputSchema>;
export class SuspendTenantInputDto extends createZodDto(SuspendTenantInputSchema) {}

export const ResumeTenantInputSchema = z.object({});
export type ResumeTenantInput = z.infer<typeof ResumeTenantInputSchema>;
export class ResumeTenantInputDto extends createZodDto(ResumeTenantInputSchema) {}

const LOGO_MAX_BYTES = 2_097_152;

export const BrandLogoUploadUrlInputSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
  sizeBytes: z.number().int().positive().max(LOGO_MAX_BYTES),
});
export type BrandLogoUploadUrlInput = z.infer<typeof BrandLogoUploadUrlInputSchema>;
export class BrandLogoUploadUrlInputDto extends createZodDto(BrandLogoUploadUrlInputSchema) {}

export const BrandLogoUploadUrlResponseSchema = z.object({
  uploadUrl: z.string().url(),
  s3Key: z.string().min(1).max(1024),
});
export type BrandLogoUploadUrlResponse = z.infer<typeof BrandLogoUploadUrlResponseSchema>;
export class BrandLogoUploadUrlResponseDto extends createZodDto(BrandLogoUploadUrlResponseSchema) {}

export const UpdateBrandInputSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  description: LocalizedText.nullable().optional(),
  socials: SocialLinksSchema.optional(),
  contacts: BrandContactsSchema.optional(),
  /** The key returned by the logo upload, or null to drop the logo. */
  logoS3Key: z.string().min(1).max(1024).nullable().optional(),
});
export type UpdateBrandRequest = z.infer<typeof UpdateBrandInputSchema>;
export class UpdateBrandInputDto extends createZodDto(UpdateBrandInputSchema) {}
