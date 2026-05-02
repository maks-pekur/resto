/**
 * Public schema surface for the database package.
 *
 * No app or other package may import from `packages/db` outside of this
 * file (drizzle.config.ts targets it directly). Internal helpers live in
 * `_*.ts` files and are not re-exported.
 */
export * from './tenants';
export * from './menu';
export * from './audit';
export * from './outbox';
export * from './auth';
export * from './customer-profiles';

export type { LocalizedText } from './_types';
