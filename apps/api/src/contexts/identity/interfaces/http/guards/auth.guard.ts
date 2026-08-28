import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { getTenantContext } from '@resto/db';
import { member as memberTable } from '@resto/db/schema';
import { AUTH_DRIZZLE_TOKEN, AUTH_TOKEN } from '../../../identity.tokens';
import type { Auth } from '../../../infrastructure/better-auth/auth.config';
import type { AuthDrizzle } from '../../../infrastructure/better-auth/auth-db';
import type {
  AnonymousPrincipal,
  CustomerPrincipal,
  OperatorPrincipal,
  Principal,
} from '../../../domain/principal';
import {
  TENANT_LOOKUP_PORT,
  type TenantLookupPort,
} from '../../../application/ports/tenant-lookup.port';
import {
  ALLOW_ARCHIVED_TENANT_KEY,
  IS_PUBLIC_KEY,
  REQUIRES_TENANT_CONTEXT_KEY,
} from '../../../../../shared/auth';

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
    activeLocationId?: string | null;
    sessionToken?: string;
  }
}

/**
 * Default-deny global guard. Skipped on @Public routes; otherwise
 * resolves the BA session, builds a typed Principal, runs the tenant
 * cross-check, and attaches `req.principal`.
 *
 * Tenant context is read from AsyncLocalStorage (bound by
 * TenantContextMiddleware which runs before the guard chain) via
 * `getTenantContext()` from `@resto/db`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AUTH_TOKEN) private readonly auth: Auth,
    @Inject(TENANT_LOOKUP_PORT) private readonly tenantLookup: TenantLookupPort,
    @Inject(AUTH_DRIZZLE_TOKEN) private readonly authDb: AuthDrizzle,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    // A route may opt out of the archived refusal — see AllowArchivedTenant.
    // Public routes never can: existence-hiding for guests is not negotiable.
    const allowArchived =
      !isPublic &&
      this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_ARCHIVED_TENANT_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) === true;

    const alsTenantId = getTenantContext()?.tenantId;
    if (alsTenantId && !allowArchived) {
      const tenant = await this.tenantLookup.findById(alsTenantId);
      if (tenant?.archivedAt) {
        if (isPublic) {
          throw new NotFoundException('No tenant resolved for this host.');
        }
        throw new ForbiddenException({
          code: 'tenant.archived',
          message: 'Tenant has been archived.',
        });
      }
    }

    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const headers = toWebHeaders(req.headers);

    const session = await this.auth.api.getSession({ headers });
    if (!session?.user) {
      throw new UnauthorizedException({
        code: 'auth.session_missing',
        message: 'Authentication required.',
      });
    }

    // BA infers getSession() from the base session type; the organization
    // plugin augments the session object with activeOrganizationId at runtime
    // but the cast above (`as unknown as BetterAuthPlugin`) in auth.config.ts
    // loses that type information. Cast to the narrower shape we depend on.
    const sessionData = session as {
      user: {
        id: string;
        email: string;
        phoneNumber?: string | null;
        twoFactorEnabled?: boolean | null;
      };
      session: {
        activeOrganizationId?: string | null;
        activeLocationId?: string | null;
        token: string;
      };
    };
    const principal = buildPrincipal(sessionData, alsTenantId);

    // Existing cross-check: when BOTH the principal and the request
    // resolved a tenant, they MUST match — otherwise an operator with
    // session active-org=A could hit a tenant-B host (operator session
    // injection).
    if (
      principal.kind !== 'anonymous' &&
      'tenantId' in principal &&
      principal.tenantId &&
      alsTenantId &&
      principal.tenantId !== alsTenantId
    ) {
      throw new ForbiddenException({
        code: 'auth.tenant_mismatch',
        message: 'Principal tenant does not match request tenant.',
      });
    }

    // Opt-in symmetric guard (RES-172): routes that read tenant-scoped
    // data via the principal MUST mark themselves with
    // `@RequiresTenantContext()`; the guard then enforces that ALS is
    // bound by the middleware. This closes the asymmetry where, on
    // routes WITHOUT ALS, an operator's `principal.tenantId` would be
    // implicitly trusted by a forgetful service (RLS bypass risk).
    const requiresTenantContext = this.reflector.getAllAndOverride<boolean | undefined>(
      REQUIRES_TENANT_CONTEXT_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (requiresTenantContext && !alsTenantId) {
      throw new ForbiddenException({
        code: 'auth.tenant_context_missing',
        message: 'Tenant context required for this route.',
      });
    }

    if (principal.kind === 'operator' && principal.tenantId) {
      const role = await this.lookupBaseRole(principal.userId, principal.tenantId);
      if (role) principal.baseRole = role;
    }

    req.principal = principal;
    req.activeLocationId = sessionData.session.activeLocationId ?? null;
    req.sessionToken = sessionData.session.token;
    return true;
  }

  private async lookupBaseRole(
    userId: string,
    tenantId: string,
  ): Promise<'owner' | 'admin' | 'staff' | undefined> {
    const rows = await this.authDb.db
      .select({ role: memberTable.role })
      .from(memberTable)
      .where(and(eq(memberTable.userId, userId), eq(memberTable.tenantId, tenantId)))
      .limit(1);
    const role = rows[0]?.role;
    if (!role) return undefined;
    // D-15 (08.3): BA stores member.role as CSV when a member holds both a system
    // role and a custom role slug. Split and return the highest system role present.
    const parts = role.split(',').map((r) => r.trim());
    if (parts.includes('owner')) return 'owner';
    if (parts.includes('admin')) return 'admin';
    if (parts.includes('staff')) return 'staff';
    return undefined;
  }
}

const toWebHeaders = (raw: FastifyRequest['headers']): Headers => {
  const headers = new Headers();
  for (const [k, v] of Object.entries(raw)) {
    // WR-01: BA's getSession reads a single `cookie` header. Behind a proxy
    // that joins multiple cookies into an array of values (or as two entries),
    // `headers.append` would create duplicates that BA / undici handle
    // inconsistently across versions. Collapse the cookie header explicitly.
    if (k.toLowerCase() === 'cookie') {
      const joined = Array.isArray(v) ? v.join('; ') : typeof v === 'string' ? v : '';
      if (joined.length > 0) headers.set('cookie', joined);
      continue;
    }
    if (Array.isArray(v)) {
      v.forEach((vv) => {
        headers.append(k, vv);
      });
    } else if (typeof v === 'string') {
      headers.set(k, v);
    }
  }
  return headers;
};

const buildPrincipal = (
  session: {
    user: {
      id: string;
      email: string;
      phoneNumber?: string | null;
      twoFactorEnabled?: boolean | null;
    };
    session: {
      activeOrganizationId?: string | null;
      token: string;
    };
  },
  alsTenantId: string | undefined,
): Principal => {
  if (session.user.phoneNumber) {
    if (!alsTenantId) {
      const anonymous: AnonymousPrincipal = { kind: 'anonymous' };
      return anonymous;
    }
    const customer: CustomerPrincipal = {
      kind: 'customer',
      userId: session.user.id,
      phone: session.user.phoneNumber,
      tenantId: alsTenantId,
    };
    return customer;
  }

  const operator: OperatorPrincipal = {
    kind: 'operator',
    userId: session.user.id,
    email: session.user.email,
    ...(session.session.activeOrganizationId
      ? { tenantId: session.session.activeOrganizationId }
      : {}),
    // AUTH-07: BA's twoFactor plugin schema adds `user.twoFactorEnabled`
    // (defaultValue:false). When the plugin is loaded BA always returns a
    // boolean; the optional-chain handles older fixtures that pre-date the
    // plugin (e.g. some integration-test stubs).
    ...(typeof session.user.twoFactorEnabled === 'boolean'
      ? { twoFactorEnabled: session.user.twoFactorEnabled }
      : {}),
  };
  return operator;
};
