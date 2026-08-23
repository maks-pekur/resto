/**
 * Public surface of `@resto/db`.
 *
 * Apps depend on this package only via the explicit re-exports here.
 * Internal helpers (logger, schema column factories) are not re-exported.
 */
export * as schema from './schema/index';
export {
  createDb,
  ScopedTx,
  TenantAwareDb,
  type CreateClientOptions,
  type ResolvedConnection,
  type RestoSchema,
  type RestoTx,
  type TenantScopedTable,
} from './client';
export {
  runInTenantContext,
  getTenantContext,
  requireTenantContext,
  getLocationId,
  requireLocationContext,
  withLocation,
  type TenantContext,
} from './context';
export {
  assertAuthRoleNoBypass,
  assertInboxProcessedDeletable,
  assertNoBaCredentialAccess,
  assertNoRlsBypass,
  assertSetConfigRevoked,
  assertTenantLockInstalled,
  assertWithoutTenantCallsiteRegistered,
  AuthRoleBypassRlsError,
  BaCredentialAccessNotRevokedError,
  InboxProcessedDeleteMissingError,
  RlsBypassError,
  SetConfigNotRevokedError,
  TenantLockNotInstalledError,
  WithoutTenantAllowlistMisalignedError,
} from './preflight';
export { provisionAppRole, RESTO_APP_ROLE } from './roles';
export { provisionAuthRole, RESTO_AUTH_ROLE } from './auth-role';
export { TenantScopedRepository } from './repository-base';
export { deleteInboxProcessedOlderThan } from './inbox-retention';
export { WITHOUT_TENANT_ALLOWLIST, type WithoutTenantAllowedFile } from './withoutTenant.allowlist';
export type { LocalizedText } from './schema/_types';
export type { MenuItemPhoto } from './schema/menu';
