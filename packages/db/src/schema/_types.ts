import { customType } from 'drizzle-orm/pg-core';

/**
 * Case-insensitive text. Backed by Postgres `citext` extension (loaded by
 * the dev image init script and the first SQL migration in production).
 *
 * Use for values where case is irrelevant for equality (emails, slugs that
 * we accept in any case but store as-is).
 */
export const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'citext';
  },
});

/**
 * Decimal-safe money. We never store prices as `double precision` —
 * floating-point rounding errors are unacceptable for charges.
 *
 * Stored as `numeric(12, 2)`: up to 9_999_999_999.99 — enough for any
 * realistic single-item price denominated in cents.
 */
export const money = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'numeric(12, 2)';
  },
});

/**
 * Internationalized text: `{ en: 'Pizza', ru: 'Пицца' }`. Exactly the
 * shape `@resto/domain` will validate via Zod.
 */
export type LocalizedText = Record<string, string>;
