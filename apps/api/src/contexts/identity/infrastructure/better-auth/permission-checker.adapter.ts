import { Inject, Injectable } from '@nestjs/common';
import type { Permission } from '@resto/domain';
import type { OperatorPrincipal } from '../../domain/principal';
import type { PermissionChecker } from '../../application/ports/permission-checker.port';
import { AUTH_TOKEN } from '../../identity.module';
import type { Auth } from './auth.config';

/**
 * BA-backed PermissionChecker. The adapter takes the raw request headers
 * (carrying the BA session cookie or Bearer token) and the permission
 * spec, then calls auth.api.hasPermission. BA evaluates against the
 * member's system role + any tenant-defined custom role permissions.
 *
 * The port `PermissionChecker` declares only (principal, required); the
 * adapter widens with an optional `headers` parameter — caller (the
 * guard) passes Web Headers built from Fastify's req.headers. Without
 * headers BA cannot resolve a session, so we return `false` (deny).
 */
@Injectable()
export class BetterAuthPermissionChecker implements PermissionChecker {
  constructor(@Inject(AUTH_TOKEN) private readonly auth: Auth) {}

  async hasPermission(
    _principal: OperatorPrincipal,
    required: Permission,
    headers?: Headers,
  ): Promise<boolean> {
    if (!headers) return false;
    try {
      // auth.api.hasPermission is contributed by the organization plugin.
      // auth.config.ts casts the plugin as `unknown as BetterAuthPlugin` to
      // work around BA 1.3.x typing gap (index-sig mismatch), which erases the
      // plugin-specific endpoints from the inferred Auth type. The cast to
      // `unknown` here is safe: we stay inside infrastructure/better-auth/ and
      // the runtime call shape is validated against BA's own Zod body schema.
      const api = this.auth.api as unknown as {
        hasPermission: (opts: {
          headers: Headers;
          body: { permissions: Record<string, string[]> };
        }) => Promise<{ success: boolean }>;
      };
      const result = await api.hasPermission({
        headers,
        body: { permissions: required as Record<string, string[]> },
      });
      return result?.success === true;
    } catch {
      return false;
    }
  }
}
