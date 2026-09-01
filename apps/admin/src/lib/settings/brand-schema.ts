import { z } from 'zod';
import { SOCIAL_PLATFORMS } from '@resto/domain';

export const BRAND_NAME_MAX = 120;
export const BRAND_DESCRIPTION_MAX = 2000;

const PHONE_RE = /^\+?[0-9 ()-]+$/u;

const optionalUrl = (value: string): boolean => {
  if (value.trim().length === 0) return true;
  try {
    const url = new URL(withScheme(value));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

/** Operators type `instagram.com/x`, not a URL; the form is not the place to teach them otherwise. */
export const withScheme = (value: string): string =>
  /^https?:\/\//iu.test(value.trim()) ? value.trim() : `https://${value.trim()}`;

/** Messages are i18n keys, not sentences: the form resolves them under `settings.brand`. */
export const BrandFormSchema = z.object({
  displayName: z.string().trim().min(1, 'nameRequired').max(BRAND_NAME_MAX, 'nameTooLong'),
  description: z.record(z.string().max(BRAND_DESCRIPTION_MAX, 'descriptionTooLong')).nullable(),
  phone: z
    .string()
    .trim()
    .max(32, 'phoneInvalid')
    .refine((v) => v.length === 0 || PHONE_RE.test(v), 'phoneInvalid'),
  email: z
    .string()
    .trim()
    .max(254)
    .refine((v) => v.length === 0 || z.string().email().safeParse(v).success, 'emailInvalid'),
  website: z.string().trim().refine(optionalUrl, 'urlInvalid'),
  socials: z.record(z.enum(SOCIAL_PLATFORMS), z.string().trim().refine(optionalUrl, 'urlInvalid')),
  logoUrl: z.string().nullable(),
  logoS3Key: z.string().nullable(),
  coverUrl: z.string().nullable(),
  coverS3Key: z.string().nullable(),
});

export type BrandFormValues = z.infer<typeof BrandFormSchema>;
