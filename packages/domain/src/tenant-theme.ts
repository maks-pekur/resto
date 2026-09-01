import { z } from 'zod';

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/u;

/**
 * Customer-facing tenant presentation. Persisted on `tenants.theme` (jsonb)
 * after the brand/tenant merge (Phase 10.2) — `brands.theme` is gone.
 * All fields optional; missing fields normalize to null so the wire shape
 * is uniform whether the operator has set theme bits yet or not.
 */
export const TenantTheme = z
  .object({
    logoUrl: z.string().url().nullable().default(null),
    coverUrl: z.string().url().nullable().default(null),
    primaryColor: z
      .string()
      .regex(HEX_COLOR_RE, '#RRGGBB hex color required')
      .nullable()
      .default(null),
    font: z.string().min(1).max(64).nullable().default(null),
  })
  .strip();
export type TenantTheme = z.infer<typeof TenantTheme>;
