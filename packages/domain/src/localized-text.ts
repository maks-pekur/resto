import { z } from 'zod';

/**
 * Internationalized text: `{ en: 'Pizza', ru: 'Пицца' }`.
 *
 * Keys are BCP-47-ish locale tags restricted to the simple two-letter
 * form, optionally with a region (`en`, `en-US`, `pt-BR`). Values are
 * non-empty strings. At least one entry is required — an empty record
 * is meaningless to render.
 *
 * Mirrors the `LocalizedText` runtime shape stored in `jsonb` columns by
 * `@resto/db`. Render-time fallback rules (which locale wins when the
 * customer's preferred locale is missing) belong in the rendering layer,
 * not in the schema.
 */
const localeKeyRegex = /^[a-z]{2}(?:-[A-Z]{2})?$/;

export const LocalizedText = z
  .record(
    z.string().regex(localeKeyRegex, 'must be a locale tag like "en" or "en-US"'),
    z.string().min(1),
  )
  .refine((obj) => Object.keys(obj).length > 0, 'must include at least one locale');
export type LocalizedText = z.infer<typeof LocalizedText>;
