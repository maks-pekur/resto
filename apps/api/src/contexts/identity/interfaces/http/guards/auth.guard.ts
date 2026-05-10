import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
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
import type { CustomerPrincipal, OperatorPrincipal, Principal } from '../../../domain/principal';
import {
  TENANT_LOOKUP_PORT,
  type TenantLookupPort,
} from '../../../application/ports/tenant-lookup.port';
import { REQUIRES_TENANT_CONTEXT_KEY } from '../decorators/requires-tenant-context.decorator';

export const IS_PUBLIC_KEY = 'identity:public';

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
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
    const alsTenantId = getTenantContext()?.tenantId;
    if (alsTenantId) {
      const tenant = await this.tenantLookup.findById(alsTenantId);
      if (tenant?.archivedAt) {
        throw new ForbiddenException({
          code: 'tenant.archived',
          message: 'Tenant has been archived.',
        });
      }
    }

    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
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
    const principal = buildPrincipal(
      session as {
        user: { id: string; email: string; phoneNumber?: string | null };
        session: { activeOrganizationId?: string | null };
      },
      alsTenantId,
    );

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
    return true;
  }

  private async lookupBaseRole(
    userId: string,
    organizationId: string,
  ): Promise<'owner' | 'admin' | 'staff' | undefined> {
    const rows = await this.authDb.db
      .select({ role: memberTable.role })
      .from(memberTable)
      .where(and(eq(memberTable.userId, userId), eq(memberTable.organizationId, organizationId)))
      .limit(1);
    const role = rows[0]?.role;
    if (role === 'owner' || role === 'admin' || role === 'staff') return role;
    return undefined;
  }
}

const toWebHeaders = (raw: FastifyRequest['headers']): Headers => {
  const headers = new Headers();
  for (const [k, v] of Object.entries(raw)) {
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
    user: { id: string; email: string; phoneNumber?: string | null };
    session: { activeOrganizationId?: string | null };
  },
  alsTenantId: string | undefined,
): Principal => {
  if (session.user.phoneNumber) {
    const customer: CustomerPrincipal = {
      kind: 'customer',
      userId: session.user.id,
      phone: session.user.phoneNumber,
      tenantId: alsTenantId ?? '',
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
  };
  return operator;
};
