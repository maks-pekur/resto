import { SOCIAL_PLATFORMS, type SocialPlatform } from '@resto/domain';

export interface SocialPresentation {
  readonly label: string;
  /** The part of the address that never changes — rendered as an add-on, not typed. */
  readonly prefix: string;
  readonly placeholder: string;
}

interface SocialDefinition {
  readonly label: string;
  readonly prefix: string;
  readonly placeholder: (handle: string) => string;
}

const DEFINITIONS: Readonly<Record<SocialPlatform, SocialDefinition>> = {
  instagram: {
    label: 'Instagram',
    prefix: 'https://instagram.com/',
    placeholder: (handle) => handle,
  },
  facebook: { label: 'Facebook', prefix: 'https://facebook.com/', placeholder: (h) => h },
  tiktok: { label: 'TikTok', prefix: 'https://tiktok.com/@', placeholder: (h) => h },
  telegram: { label: 'Telegram', prefix: 'https://t.me/', placeholder: (h) => h },
  // A wa.me link carries a phone number, not a handle.
  whatsapp: { label: 'WhatsApp', prefix: 'https://wa.me/', placeholder: () => '34600000000' },
  youtube: { label: 'YouTube', prefix: 'https://youtube.com/@', placeholder: (h) => h },
  x: { label: 'X', prefix: 'https://x.com/', placeholder: (h) => h },
  // A Tripadvisor listing is a long generated path, so there is no handle to suggest.
  tripadvisor: {
    label: 'Tripadvisor',
    prefix: 'https://',
    placeholder: () => 'tripadvisor.com/Restaurant_Review-…',
  },
};

export const socialPresentation = (platform: string, handle: string): SocialPresentation => {
  const definition = (DEFINITIONS as Partial<Record<string, SocialDefinition>>)[platform];
  if (!definition) {
    return { label: platform, prefix: 'https://', placeholder: `${handle}.com` };
  }
  return {
    label: definition.label,
    prefix: definition.prefix,
    placeholder: definition.placeholder(handle),
  };
};

export const SOCIAL_ORDER: readonly SocialPlatform[] = SOCIAL_PLATFORMS;
