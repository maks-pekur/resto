import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { getBrandId } from '@resto/db';
import { TenantId } from '@resto/domain';
import {
  MEMBER_BRAND_SCOPE_READER,
  type MemberBrandScopeReader,
} from '../../../application/ports/member-brand-scope-reader.port';
import { REQUIRE_BRAND_KEY } from '../../../../../shared/auth';

/**
 * Per-route brand-scope authorization. Runs after AuthGuard +
 * PermissionsGuard so it can rely on `req.principal`. No metadata = pass.
 *
 * Decision tree (per ADR-0019 §5.3):
 *   1. @RequireBrand absent → pass.
 *   2. ALS has no brand → 403 brand.context_required.
 *   3. Principal is not an operator → 403 brand.operator_required.
 *   4. Operator baseRole is `owner` → pass (bypass).
 *   5. Look up `member_brand_scope` for (userId, tenantId):
 *      - empty rows → pass (default-allow).
 *      - non-empty + brandId IN scope → pass.
 *      - non-empty + brandId NOT IN scope → 403 brand.access_denied.
 */
@Injectable()
export class BrandScopeGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(MEMBER_BRAND_SCOPE_READER) private readonly reader: MemberBrandScopeReader,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean | undefined>(REQUIRE_BRAND_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;

    const brandId = getBrandId();
    if (!brandId) {
      throw new ForbiddenException({
        code: 'brand.context_required',
        message: 'Brand context is required for this route.',
      });
    }

    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
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

    const scope = await this.reader.findBrandScopeForMember({
      userId: principal.userId,
      tenantId: TenantId.parse(principal.tenantId),
    });

    if (scope === null) return true;
    if (scope.includes(brandId)) return true;

    throw new ForbiddenException({
      code: 'brand.access_denied',
      message: 'Operator is not scoped to this brand.',
    });
  }
}
