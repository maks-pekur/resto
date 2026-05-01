import type { Role } from './role';

/**
 * Authenticated principal carried on a request after the AuthGuard
 * accepts the bearer token.
 *
 * - `subject`: Keycloak `sub` claim — stable id of the human across all
 *   tenants they belong to.
 * - `tenantId`: tenant the token authorises action against (Keycloak
 *   organization mapping → claim → enforced against the resolved
 *   tenant context).
 * - `roles`: realm/client roles attached to the user inside the tenant.
 * - `locations`: optional location ids the user is scoped to (ABAC
 *   skeleton, validated against the single MVP-1 location for now).
 */
export interface Principal {
  readonly subject: string;
  readonly tenantId: string;
  readonly roles: readonly Role[];
  readonly locations?: readonly string[];
  /** Email address from the token, when present — used for audit. */
  readonly email?: string;
}
