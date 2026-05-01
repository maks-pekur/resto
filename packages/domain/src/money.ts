import { z } from 'zod';

/**
 * Decimal-safe money amount.
 *
 * Stored and exchanged as a *string* in canonical decimal form (`'0'`,
 * `'12.34'`, `'1234567890.99'`). Never `number` — IEEE-754 silently loses
 * precision on values that look harmless (e.g. `0.1 + 0.2 !== 0.3`).
 *
 * Mirrors the Postgres `numeric(12, 2)` column emitted by `@resto/db`'s
 * `money` custom type.
 *
 * Format rules:
 * - integer part: `0` or no leading zeros (`123`, not `0123`)
 * - optional fractional part with 1 or 2 digits (`12`, `12.3`, `12.34`)
 * - non-negative (a separate `PriceDelta` exists for signed deltas)
 */
const moneyAmountRegex = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

export const MoneyAmount = z
  .string()
  .regex(moneyAmountRegex, 'must be a non-negative decimal with up to 2 fractional digits')
  .brand<'MoneyAmount'>();
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

/**
 * ISO-4217 alphabetic currency code (`USD`, `EUR`, `UAH`, ...). Three
 * uppercase Latin letters. No locale-specific symbols here — those are
 * a UI concern.
 */
const currencyRegex = /^[A-Z]{3}$/;

export const Currency = z
  .string()
  .regex(currencyRegex, 'must be a 3-letter uppercase ISO-4217 code')
  .brand<'Currency'>();
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
