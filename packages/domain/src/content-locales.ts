import { z } from 'zod';

/**
 * The languages a tenant may publish content in. Deliberately a closed list: every entry costs a
 * flag, a font that covers the script and someone able to check the strings, so it grows by
 * decision rather than by a caller passing a new tag.
 */
export const CONTENT_LOCALES = ['ru', 'en', 'uk', 'es'] as const;

export type ContentLocale = (typeof CONTENT_LOCALES)[number];

export const ContentLocaleSchema = z.enum(CONTENT_LOCALES);

export const isContentLocale = (value: string): value is ContentLocale =>
  (CONTENT_LOCALES as readonly string[]).includes(value);

/** A tenant always has at least one content language, and its default is one of them. */
export const ContentLocalesSchema = z
  .array(ContentLocaleSchema)
  .min(1)
  .refine((locales) => new Set(locales).size === locales.length, 'locales must be unique');
