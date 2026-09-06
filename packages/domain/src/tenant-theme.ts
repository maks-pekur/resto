import { z } from 'zod';

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/u;

/**
 * Customer-facing tenant presentation. Persisted on `tenants.theme` (jsonb)
 * after the brand/tenant merge (Phase 10.2) — `brands.theme` is gone.
 * All fields optional; missing fields normalize to null so the wire shape
 * is uniform whether the operator has set theme bits yet or not.
 */
export const COVER_MAX = 8;

// Historic rows hold an absolute URL minted when the media host happened to be configured a
// certain way, which froze branding to that host. New writes hold the object key instead and
// the reader prefixes it — see `resolveThemeMedia`.
const MEDIA_KEY_RE = /^public\/tenant\/[0-9a-f-]{36}\/brand\/[\w.-]+$/u;

const MediaRef = z
  .string()
  .refine((v) => MEDIA_KEY_RE.test(v) || /^https?:\/\//u.test(v), 'media key or absolute URL');

/** Turns whatever the row holds into an absolute URL the guest can fetch. */
export const resolveThemeMedia = (value: string, publicBaseUrl: string): string =>
  MEDIA_KEY_RE.test(value) ? `${publicBaseUrl.replace(/\/$/u, '')}/${value}` : value;

export const TenantTheme = z
  .object({
    logoUrl: MediaRef.nullable().default(null),
    /** The room, in as many shots as the venue cares to show. First one leads. */
    coverUrls: z.array(MediaRef).max(COVER_MAX).default([]),
    primaryColor: z
      .string()
      .regex(HEX_COLOR_RE, '#RRGGBB hex color required')
      .nullable()
      .default(null),
    font: z.string().min(1).max(64).nullable().default(null),
  })
  .strip();
export type TenantTheme = z.infer<typeof TenantTheme>;
