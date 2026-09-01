import { z } from 'zod';

/**
 * The places a restaurant is found outside its own site. A closed list: each entry is a labelled
 * row in the operator's settings and a link in the guest footer, so it grows by decision.
 */
export const SOCIAL_PLATFORMS = [
  'instagram',
  'facebook',
  'tiktok',
  'telegram',
  'whatsapp',
  'youtube',
  'x',
  'tripadvisor',
  // A listing rather than a profile: the card guests read reviews on and route from.
  'googleMaps',
  'yandexMaps',
  'twogis',
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SocialPlatformSchema = z.enum(SOCIAL_PLATFORMS);

const MAX_URL_LENGTH = 2048;

/** Guest-facing links are rendered as anchors, so anything but http(s) is an injection vector. */
const PublicUrl = z
  .string()
  .trim()
  .min(1)
  .max(MAX_URL_LENGTH)
  .url()
  .refine((value) => /^https?:/iu.test(value), 'must be an http(s) URL');

export const SocialLinksSchema = z.record(SocialPlatformSchema, PublicUrl);
export type SocialLinks = z.infer<typeof SocialLinksSchema>;

export const BrandContactsSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^\+?[0-9 ()-]+$/u, 'digits, spaces and + ( ) - only')
    .nullable()
    .default(null),
  email: z.string().trim().max(254).email().nullable().default(null),
  website: PublicUrl.nullable().default(null),
});
export type BrandContacts = z.infer<typeof BrandContactsSchema>;

export const EMPTY_BRAND_CONTACTS: BrandContacts = { phone: null, email: null, website: null };
