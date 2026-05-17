import { z } from 'zod';

/**
 * Decimal-safe money amount.
 *
 * Stored and exchanged as a *string*. Never `number` — IEEE-754 silently
 * loses precision on values that look harmless (e.g. `0.1 + 0.2 !== 0.3`).
 *
 * Mirrors the Postgres `numeric(12, 2)` column emitted by `@resto/db`'s
 * `money` custom type.
 *
 * Accepted format:
 * - integer part: `0` or no leading zeros (`123`, not `0123`)
 * - optional fractional part with 1 or 2 digits (`12`, `12.3`, `12.34`)
 * - non-negative (`PriceDelta` exists for signed deltas)
 *
 * NON-CANONICAL: this schema accepts `'0'`, `'0.0'`, and `'0.00'` as
 * separate-but-equal representations of zero, and `'10'` / `'10.0'` /
 * `'10.00'` likewise. Two equal Money values can therefore have unequal
 * string forms — callers comparing for equality must normalise first.
 * Canonicalisation at parse-time is on the packages/domain backlog
 * (packages/domain/CLAUDE.md WR on canonical form). Mismatch with the
 * `numeric(12,2)` upper bound (no max length enforced here) is also
 * tracked there.
 */
const moneyAmountRegex = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

/**
 * HTTP-boundary form — raw decimal string, no brand. Use this in
 * `createZodDto` request schemas; `nestjs-zod` emits `type: string`
 * for it (the branded variant emits `unknown` — ADR-0020 I-7).
 * Inside the domain use `MoneyAmount`.
 */
export const MoneyAmountValue = z
  .string()
  .regex(moneyAmountRegex, 'must be a non-negative decimal with up to 2 fractional digits');
export type MoneyAmountValue = z.infer<typeof MoneyAmountValue>;

/**
 * Decimal-safe money amount.
 *
 * Stored and exchanged as a *string*. Never `number` — IEEE-754 silently
 * loses precision on values that look harmless (e.g. `0.1 + 0.2 !== 0.3`).
 *
 * Mirrors the Postgres `numeric(12, 2)` column emitted by `@resto/db`'s
 * `money` custom type.
 *
 * Accepted format:
 * - integer part: `0` or no leading zeros (`123`, not `0123`)
 * - optional fractional part with 1 or 2 digits (`12`, `12.3`, `12.34`)
 * - non-negative (`PriceDelta` exists for signed deltas)
 *
 * NON-CANONICAL: this schema accepts `'0'`, `'0.0'`, and `'0.00'` as
 * separate-but-equal representations of zero, and `'10'` / `'10.0'` /
 * `'10.00'` likewise. Two equal Money values can therefore have unequal
 * string forms — callers comparing for equality must normalise first.
 * Canonicalisation at parse-time is on the packages/domain backlog
 * (packages/domain/CLAUDE.md WR on canonical form). Mismatch with the
 * `numeric(12,2)` upper bound (no max length enforced here) is also
 * tracked there.
 */
export const MoneyAmount = MoneyAmountValue.brand<'MoneyAmount'>();
export type MoneyAmount = z.infer<typeof MoneyAmount>;

/**
 * Signed price delta — additive offset on top of a base price (variant
 * upcharge, modifier add-on, optional discount).
 *
 * Same digit rules as `MoneyAmount`, with an optional leading `-`. `-0`
 * is rejected so there is exactly one canonical zero.
 */
const priceDeltaRegex = /^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

export const PriceDelta = z
  .string()
  .regex(priceDeltaRegex, 'must be a decimal with up to 2 fractional digits')
  .refine((v) => v !== '-0' && v !== '-0.0' && v !== '-0.00', 'use "0" instead of "-0"')
  .brand<'PriceDelta'>();
export type PriceDelta = z.infer<typeof PriceDelta>;

const currencyRegex = /^[A-Z]{3}$/;

/**
 * HTTP-boundary form — raw ISO-4217 alphabetic code, no brand. Use
 * this in `createZodDto` request schemas; `nestjs-zod` emits
 * `type: string` for it (the branded variant emits `unknown` —
 * ADR-0020 I-7). Inside the domain use `Currency`.
 */
export const CurrencyValue = z
  .string()
  .regex(currencyRegex, 'must be a 3-letter uppercase ISO-4217 code');
export type CurrencyValue = z.infer<typeof CurrencyValue>;

/**
 * ISO-4217 alphabetic currency code (`USD`, `EUR`, `UAH`, ...). Three
 * uppercase Latin letters. No locale-specific symbols here — those are
 * a UI concern.
 */
export const Currency = CurrencyValue.brand<'Currency'>();
export type Currency = z.infer<typeof Currency>;

/**
 * Money value object: an amount paired with the currency it is
 * denominated in. Two `Money` values must agree on `currency` before any
 * arithmetic is performed (arithmetic helpers live in the application
 * layer, not here — this package only describes the shape).
 */
export const Money = z.object({
  amount: MoneyAmount,
  currency: Currency,
});
export type Money = z.infer<typeof Money>;
