/**
 * Public schema surface for the database package.
 *
 * No app or other package may import from `packages/db` outside of this
 * file (drizzle.config.ts targets it directly). Internal helpers live in
 * `_*.ts` files and are not re-exported.
 */
export * from './tenants';
export * from './users';
export * from './menu';
export * from './audit';

export type { LocalizedText } from './_types';
