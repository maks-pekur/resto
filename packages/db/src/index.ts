/**
 * Public surface of `@resto/db`.
 *
 * Apps depend on this package only via the explicit re-exports here.
 * Internal helpers (logger, schema column factories) are not re-exported.
 */
export * as schema from './schema/index';
export {
  createDb,
  TenantAwareDb,
  type CreateClientOptions,
  type ResolvedConnection,
  type RestoSchema,
  type RestoTx,
} from './client';
export {
  runInTenantContext,
  getTenantContext,
  requireTenantContext,
  type TenantContext,
} from './context';
export { assertNoRlsBypass, RlsBypassError } from './preflight';
export { provisionAppRole, RESTO_APP_ROLE } from './roles';
export type { LocalizedText } from './schema/_types';
