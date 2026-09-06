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
  OPTIONAL_AUTH_KEY,
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

    if (isPublic) {
      const wantsPrincipal =
        this.reflector.getAllAndOverride<boolean | undefined>(OPTIONAL_AUTH_KEY, [
          ctx.getHandler(),
          ctx.getClass(),
        ]) === true;
      if (!wantsPrincipal) return true;

      // Never refuses. A lapsed or malformed session must still be able to place an order, so
      // every failure path here ends in an anonymous principal rather than a 401.
      const openReq = ctx.switchToHttp().getRequest<FastifyRequest>();
      openReq.principal = { kind: 'anonymous' };
      try {
        const open = await this.auth.api.getSession({ headers: toWebHeaders(openReq.headers) });
        if (open?.user) {
          const data = open as SessionData;
          const membership = alsTenantId
            ? await this.lookupMembership(data.user.id, alsTenantId)
            : null;
          openReq.principal = buildPrincipal(data, alsTenantId, membership);
          openReq.sessionToken = data.session.token;
        }
      } catch {
        openReq.principal = { kind: 'anonymous' };
      }
      return true;
    }

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
    const sessionData = session as SessionData;
    // One lookup, against the tenant this request is about: the host's when it resolved one,
    // otherwise the session's active organization (07.4 moved the operator's tenant there).
    const requestTenantId = alsTenantId ?? sessionData.session.activeOrganizationId ?? undefined;
    const membership =
      requestTenantId !== undefined
        ? await this.lookupMembership(sessionData.user.id, requestTenantId)
        : null;

    const principal = buildPrincipal(sessionData, alsTenantId, membership);

    const principalTenantId =
      principal.kind !== 'anonymous' && 'tenantId' in principal ? principal.tenantId : undefined;

    // 07.4 D-02: a session with no activeOrganizationId used to skip this
    // check entirely, binding whatever x-tenant-id the request carried.
    const tenantMismatch =
      principal.kind === 'operator'
        ? alsTenantId !== undefined && principalTenantId !== alsTenantId
        : principalTenantId !== undefined &&
          alsTenantId !== undefined &&
          principalTenantId !== alsTenantId;

    if (tenantMismatch) {
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

    // 07.4 D-02, restored deliberately: a session claiming a tenant it holds no member row in must
    // be refused — that is what stops a stale activeOrganizationId from outliving a revoked
    // membership. Under 10.7's rule this is reachable only when the session carries an
    // activeOrganizationId; a guest with none became a customer above and never arrives here.
    if (principal.kind === 'operator' && alsTenantId !== undefined && membership === null) {
      throw new ForbiddenException({
        code: 'auth.tenant_membership_missing',
        message: 'Principal is not a member of the request tenant.',
      });
    }

    req.principal = principal;
    req.activeLocationId = sessionData.session.activeLocationId ?? null;
    req.sessionToken = sessionData.session.token;
    return true;
  }

  private async lookupMembership(
    userId: string,
    tenantId: string,
  ): Promise<{ role: 'owner' | 'admin' | 'staff' | undefined } | null> {
    const rows = await this.authDb.db
      .select({ role: memberTable.role })
      .from(memberTable)
      .where(and(eq(memberTable.userId, userId), eq(memberTable.tenantId, tenantId)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    const role = row.role;
    if (!role) return { role: undefined };
    // D-15 (08.3): BA stores member.role as CSV when a member holds both a system
    // role and a custom role slug. Split and return the highest system role present.
    const parts = role.split(',').map((r) => r.trim());
    if (parts.includes('owner')) return { role: 'owner' };
    if (parts.includes('admin')) return { role: 'admin' };
    if (parts.includes('staff')) return { role: 'staff' };
    return { role: undefined };
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

type MembershipRow = { role: 'owner' | 'admin' | 'staff' | undefined } | null;

interface SessionData {
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
}

export const buildPrincipal = (
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
  membership: MembershipRow,
): Principal => {
  // 07.4's phone branch is untouched and stays FIRST: it is the settled customer signal and the
  // deferred OTP login needs it. 10.7 adds only the phoneless guest below it.
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

  // 10.7 D-10: a Google guest has an email, no phone, no member row and no chosen organization.
  // Before this branch they were classified as an operator. Only a session carrying no operator
  // identity at all takes it — an operator bound elsewhere stays an operator and still meets
  // 07.4 D-02's mismatch refusal below.
  if (alsTenantId !== undefined && membership === null && !session.session.activeOrganizationId) {
    const guest: CustomerPrincipal = {
      kind: 'customer',
      userId: session.user.id,
      phone: null,
      tenantId: alsTenantId,
    };
    return guest;
  }

  const operator: OperatorPrincipal = {
    kind: 'operator',
    userId: session.user.id,
    email: session.user.email,
    ...(session.session.activeOrganizationId
      ? { tenantId: session.session.activeOrganizationId }
      : {}),
    ...(membership?.role ? { baseRole: membership.role } : {}),
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
