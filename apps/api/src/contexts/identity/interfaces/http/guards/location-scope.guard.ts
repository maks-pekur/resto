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
import { getLocationId } from '@resto/db';
import { TenantId } from '@resto/domain';
import {
  MEMBER_LOCATION_SCOPE_READER,
  type MemberLocationScopeReader,
} from '../../../application/ports/member-location-scope-reader.port';
import { LOCATION_NEUTRAL_KEY } from '../../../../../shared/auth';

@Injectable()
export class LocationScopeGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(MEMBER_LOCATION_SCOPE_READER) private readonly reader: MemberLocationScopeReader,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const locationNeutral = this.reflector.getAllAndOverride<boolean | undefined>(
      LOCATION_NEUTRAL_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (locationNeutral) return true;

    const locationId = getLocationId();
    if (!locationId) {
      throw new ForbiddenException({
        code: 'location.context_required',
        message: 'Location context is required for this route.',
      });
    }

    const req = ctx
      .switchToHttp()
      .getRequest<FastifyRequest & { activeLocationId?: string | null }>();
    const principal = req.principal;
    if (principal?.kind !== 'operator') {
      throw new ForbiddenException({
        code: 'location.operator_required',
        message: 'Operator principal required for location-scoped routes.',
      });
    }

    if (!principal.tenantId) {
      throw new ForbiddenException({
        code: 'location.tenant_required',
        message: 'Operator must have an active tenant to access location-scoped routes.',
      });
    }

    if (principal.baseRole === 'owner') return true;

    const activeLocationId = req.activeLocationId ?? null;
    if (activeLocationId === null || activeLocationId !== locationId) {
      throw new NotFoundException();
    }

    const scope = await this.reader.findLocationScopeForMember({
      userId: principal.userId,
      tenantId: TenantId.parse(principal.tenantId),
    });

    if (!scope?.includes(locationId)) {
      throw new ForbiddenException({
        code: 'location.access_denied',
        message: 'Operator is not scoped to this location.',
      });
    }

    return true;
  }
}
