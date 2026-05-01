import { Inject, Injectable, Logger } from '@nestjs/common';
import { createRemoteJWKSet, errors as joseErrors, jwtVerify, type JWTPayload } from 'jose';
import { ENV_TOKEN } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import { InvalidTokenError } from '../domain/errors';
import { isRole, type Role } from '../domain/role';
import type { Principal } from '../domain/principal';
import type { JwtVerifier } from '../domain/ports';

const TENANT_CLAIM = 'tenant_id';
const ROLES_CLAIM = 'roles';
const LOCATIONS_CLAIM = 'locations';

/**
 * JWKS-backed JWT verifier. Keycloak signs every token with a key from
 * its JWKS endpoint; `createRemoteJWKSet` caches the keys, follows kid
 * rotation, and refreshes when an unknown kid appears. Verification is
 * a local CPU operation — no per-request introspection round-trip.
 */
@Injectable()
export class JoseJwtVerifier implements JwtVerifier {
  private readonly logger = new Logger(JoseJwtVerifier.name);

  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(@Inject(ENV_TOKEN) private readonly env: Env) {}

  async verify(token: string): Promise<Principal> {
    const issuer = this.env.KEYCLOAK_ISSUER_URL;
    if (!issuer) {
      throw new InvalidTokenError(
        'KEYCLOAK_ISSUER_URL is not configured; the api refuses to authenticate tokens.',
      );
    }
    try {
      const jwks = this.getJwks(issuer);
      const { payload } = await jwtVerify(token, jwks, {
        issuer,
        algorithms: ['RS256'],
        clockTolerance: '5s',
      });
      return projectPrincipal(payload);
    } catch (err) {
      if (err instanceof joseErrors.JOSEError) {
        this.logger.debug({ name: err.name, code: err.code }, 'JWT verification failed');
        throw new InvalidTokenError(`Token verification failed: ${err.code}`, err);
      }
      if (err instanceof InvalidTokenError) throw err;
      throw new InvalidTokenError('Token verification failed.', err);
    }
  }

  private getJwks(issuer: string): ReturnType<typeof createRemoteJWKSet> {
    if (this.jwks) return this.jwks;
    const url = new URL(`${issuer.replace(/\/$/, '')}/protocol/openid-connect/certs`);
    this.jwks = createRemoteJWKSet(url);
    return this.jwks;
  }
}

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const asStringArray = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
};

export const projectPrincipal = (payload: JWTPayload): Principal => {
  const subject = asString(payload.sub);
  if (!subject) {
    throw new InvalidTokenError('Token is missing the subject (`sub`) claim.');
  }
  const tenantId = asString(payload[TENANT_CLAIM]);
  if (!tenantId) {
    throw new InvalidTokenError(`Token is missing the \`${TENANT_CLAIM}\` claim.`);
  }
  const rawRoles = asStringArray(payload[ROLES_CLAIM]);
  const roles: Role[] = rawRoles.filter(isRole);
  const locations = asStringArray(payload[LOCATIONS_CLAIM]);
  const principal: Principal = { subject, tenantId, roles };
  const email = asString(payload.email);
  if (email !== undefined) Object.assign(principal, { email });
  if (locations.length > 0) Object.assign(principal, { locations });
  return principal;
};
