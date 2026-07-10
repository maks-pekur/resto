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
  MEMBER_LOCATION_SCOPE_READER,
  type MemberLocationScopeReader,
} from '../../../application/ports/member-location-scope-reader.port';
import { BRAND_NEUTRAL_KEY } from '../../../../../shared/auth';

@Injectable()
export class BrandScopeGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(MEMBER_LOCATION_SCOPE_READER) private readonly reader: MemberLocationScopeReader,
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

    const scope = await this.reader.findReachableBrandsForMember({
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
