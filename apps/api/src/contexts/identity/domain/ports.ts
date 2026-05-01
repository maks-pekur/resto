import type { Principal } from './principal';

/**
 * JWT validator port. Implementations verify a bearer token (signature
 * + standard claims) and project it onto a `Principal`. Pure interface;
 * the JWKS adapter implements it in `infrastructure/`.
 */
export interface JwtVerifier {
  verify(token: string): Promise<Principal>;
}

export const JWT_VERIFIER = Symbol('JWT_VERIFIER');

/**
 * Keycloak admin client port — server-to-server operations called by
 * the seed CLI (RES-81) to provision tenants. Kept narrow on purpose;
 * the adapter is the only file that knows the Keycloak admin REST
 * surface.
 */
export interface KeycloakAdminPort {
  ensureRealmRoles(roles: readonly string[]): Promise<void>;
  ensureOrganization(input: { tenantId: string; slug: string; displayName: string }): Promise<void>;
  ensureUser(input: {
    tenantId: string;
    email: string;
    role: string;
    initialPassword: string;
  }): Promise<{ subject: string }>;
}

export const KEYCLOAK_ADMIN_PORT = Symbol('KEYCLOAK_ADMIN_PORT');
