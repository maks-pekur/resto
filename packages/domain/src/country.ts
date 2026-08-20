import { z } from 'zod';
import type { CurrencyValue } from './money';

/**
 * HTTP-boundary form — raw enum, no brand. Crosses the signup DTO boundary,
 * so it stays unbranded: a branded schema emits `type: unknown` in the
 * `nestjs-zod` OpenAPI output (ADR-0020 I-7). Type is always derived via
 * `z.infer`, never hand-written.
 */
export const CountryCodeValue = z.enum(['UA', 'GB', 'ES']);
export type CountryCodeValue = z.infer<typeof CountryCodeValue>;

/** D-33 order — used by the admin `Select`. */
export const SUPPORTED_COUNTRIES: readonly CountryCodeValue[] = ['UA', 'GB', 'ES'];

export interface CountryConfig {
  readonly currency: CurrencyValue;
  readonly defaultLocale: string;
}

/**
 * Country -> currency/locale registry (D-32/D-33/D-35). Compile-time-closed
 * catalogue, matching `reserved-slugs.ts` / `rbac/permissions.ts` — no Zod
 * wrapper on the registry object itself, only the input `CountryCodeValue`
 * needs validation.
 */
export const COUNTRY_REGISTRY: Readonly<Record<CountryCodeValue, CountryConfig>> = {
  // WHY (D-38, RESEARCH Pitfall 6): apps/admin ships ru/en and gains es in this phase
  // but never uk, so mapping UA to uk would render a langSwitcher showing Ukrainian
  // selected while every string falls back to Russian. Keep every default locale
  // inside the {ru, en, es} intersection of what both apps ship — do not add uk here.
  UA: { currency: 'UAH', defaultLocale: 'ru' },
  GB: { currency: 'GBP', defaultLocale: 'en' },
  ES: { currency: 'EUR', defaultLocale: 'es' },
};

export const currencyForCountry = (country: CountryCodeValue): CurrencyValue =>
  COUNTRY_REGISTRY[country].currency;

export const defaultLocaleForCountry = (country: CountryCodeValue): string =>
  COUNTRY_REGISTRY[country].defaultLocale;
