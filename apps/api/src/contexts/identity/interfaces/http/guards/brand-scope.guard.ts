import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { getBrandId } from '@resto/db';
import { TenantId } from '@resto/domain';
import {
  MEMBER_BRAND_SCOPE_READER,
  type MemberBrandScopeReader,
} from '../../../application/ports/member-brand-scope-reader.port';
import { BRAND_NEUTRAL_KEY } from '../../../../../shared/auth';

/**
 * Brand-scope authorization. Default-on: runs on EVERY route unless @BrandNeutral opts out.
 * Runs after AuthGuard + PermissionsGuard so it can rely on `req.principal`.
 *
 * Decision tree (D-08 / D-10 / D-11):
 *   1. @BrandNeutral present → pass (opt-out).
 *   2. ALS has no brand → 403 brand.context_required.
 *   3. Principal is not an operator → 403 brand.operator_required.
 *   4. Operator has no tenantId → 403 brand.tenant_required.
 *   5. Operator baseRole is `owner` → pass (bypass; owner free-switch, skips pin check).
 *   6. D-10 pin reconciliation (non-owner only):
 *      - req.activeBrandId === null (no pin) → 404 (existence-hiding, closes null-pin bypass).
 *      - req.activeBrandId !== ALS brand → 404 (existence-hiding cross-brand mismatch).
 *   7. Look up member_brand_scope for (userId, tenantId):
 *      - null (no scope rows) → 403 brand.access_denied (default-deny, D-08).
 *      - brandId IN scope → pass.
 *      - brandId NOT IN scope → 403 brand.access_denied.
 */
@Injectable()
export class BrandScopeGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(MEMBER_BRAND_SCOPE_READER) private readonly reader: MemberBrandScopeReader,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const brandNeutral = this.reflector.getAllAndOverride<boolean | undefined>(BRAND_NEUTRAL_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (brandNeutral) return true;

    const brandId = getBrandId();
    if (!brandId) {
      throw new ForbiddenException({
        code: 'brand.context_required',
        message: 'Brand context is required for this route.',
      });
    }

    const req = ctx.switchToHttp().getRequest<FastifyRequest & { activeBrandId?: string | null }>();
    const principal = req.principal;
    if (principal?.kind !== 'operator') {
      throw new ForbiddenException({
        code: 'brand.operator_required',
        message: 'Operator principal required for brand-scoped routes.',
      });
    }

    if (!principal.tenantId) {
      throw new ForbiddenException({
        code: 'brand.tenant_required',
        message: 'Operator must have an active organization to access brand-scoped routes.',
      });
    }

    if (principal.baseRole === 'owner') return true;

    const activeBrandId = req.activeBrandId ?? null;
    if (activeBrandId === null || activeBrandId !== brandId) {
      throw new NotFoundException();
    }

    const scope = await this.reader.findBrandScopeForMember({
      userId: principal.userId,
      tenantId: TenantId.parse(principal.tenantId),
    });

    if (!scope?.includes(brandId)) {
      throw new ForbiddenException({
        code: 'brand.access_denied',
        message: 'Operator is not scoped to this brand.',
      });
    }

    return true;
  }
}
