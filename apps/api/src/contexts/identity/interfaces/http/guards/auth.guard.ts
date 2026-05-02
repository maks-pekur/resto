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
import { getTenantContext } from '@resto/db';
import { AUTH_TOKEN } from '../../../identity.module';
import type { Auth } from '../../../infrastructure/better-auth/auth.config';
import type { CustomerPrincipal, OperatorPrincipal, Principal } from '../../../domain/principal';

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
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
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

    // Read tenant from ALS — bound by TenantContextMiddleware before this guard runs.
    const alsTenantId = getTenantContext()?.tenantId;

    const principal = buildPrincipal(session, alsTenantId);

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

    req.principal = principal;
    return true;
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
