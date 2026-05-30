/**
 * Supported email locales (D-03).
 *
 * MVP-1 keeps locale resolution to the inviter's `Accept-Language` header
 * — no per-user `locale` BA additionalField, no migration. Per-user
 * preference is deferred to MVP-2 / CRM phase.
 */
export type EmailLocale = 'en' | 'ru';

export const SUPPORTED_LOCALES: readonly EmailLocale[] = ['en', 'ru'] as const;
