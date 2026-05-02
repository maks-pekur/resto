import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import type { Permission } from '@resto/domain';
import {
  PERMISSION_CHECKER,
  type PermissionChecker,
} from '../../../application/ports/permission-checker.port';

export const PERMISSIONS_KEY = 'identity:permissions';

/**
 * Reads @Permissions(spec) metadata and delegates to the
 * PermissionChecker port. No metadata = no-op pass. Customer principals
 * are rejected (no RBAC for customers in Phase B). Missing principal is
 * defensive — should not happen given AuthGuard ran first.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PERMISSION_CHECKER) private readonly checker: PermissionChecker,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;

    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const principal = req.principal;
    if (principal?.kind !== 'operator') {
      throw new ForbiddenException({
        code: 'auth.forbidden',
        message: 'Operator principal required.',
      });
    }

    const headers = toWebHeaders(req.headers);
    // The adapter widens the port signature with an optional headers arg.
    // We cast to accept the wider call without changing the port interface.
    const allowed = await (
      this.checker as unknown as {
        hasPermission(p: typeof principal, r: Permission, h: Headers): Promise<boolean>;
      }
    ).hasPermission(principal, required, headers);

    if (!allowed) {
      throw new ForbiddenException({
        code: 'auth.forbidden',
        message: 'Insufficient permissions.',
      });
    }
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
