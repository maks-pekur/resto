import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV_TOKEN } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import type { KeycloakAdminPort } from '../domain/ports';

/**
 * Keycloak admin adapter. Talks the admin REST API directly with `fetch`
 * — keeps the dependency surface small (no `@keycloak/keycloak-admin-client`).
 *
 * Operations are limited to what the seed CLI (RES-81) needs:
 * realm-role provisioning, organization (tenant) creation, and user
 * creation with role assignment. End-user authentication flows are
 * Keycloak's responsibility, not ours.
 *
 * The adapter is a *placeholder* in MVP-1 — the full implementation
 * lands when the seed CLI ships. The methods below throw a clear
 * not-implemented error so accidental use surfaces immediately rather
 * than producing partial state in Keycloak.
 */
@Injectable()
export class KeycloakAdminAdapter implements KeycloakAdminPort {
  private readonly logger = new Logger(KeycloakAdminAdapter.name);

  constructor(@Inject(ENV_TOKEN) private readonly env: Env) {}

  ensureRealmRoles(_roles: readonly string[]): Promise<void> {
    this.requireConfig();
    return Promise.reject(notImplemented('ensureRealmRoles'));
  }

  ensureOrganization(_input: {
    tenantId: string;
    slug: string;
    displayName: string;
  }): Promise<void> {
    this.requireConfig();
    return Promise.reject(notImplemented('ensureOrganization'));
  }

  ensureUser(_input: {
    tenantId: string;
    email: string;
    role: string;
    initialPassword: string;
  }): Promise<{ subject: string }> {
    this.requireConfig();
    return Promise.reject(notImplemented('ensureUser'));
  }

  private requireConfig(): void {
    if (!this.env.KEYCLOAK_ISSUER_URL || !this.env.KEYCLOAK_CLIENT_SECRET) {
      this.logger.error(
        'Keycloak admin operations require KEYCLOAK_ISSUER_URL and KEYCLOAK_CLIENT_SECRET to be set.',
      );
      throw new Error(
        'Keycloak admin client is not configured (missing KEYCLOAK_ISSUER_URL / KEYCLOAK_CLIENT_SECRET).',
      );
    }
  }
}

const notImplemented = (op: string): Error =>
  new Error(
    `KeycloakAdminAdapter.${op} is not implemented yet — the full surface lands with the seed CLI (RES-81). ` +
      'For MVP-1 dev, run `pnpm dev:keycloak-seed` to provision the realm via the bundled script.',
  );
