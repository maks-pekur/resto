import { Controller, Get, Inject, NotFoundException, Req, Res } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { LocationId, OpeningHours, TenantId, WifiAccess } from '@resto/domain';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { ENV_TOKEN } from '../../../../config/config.module';
import type { Env } from '../../../../config/env.schema';
import { effectiveHost } from '../../../../shared/effective-host';
import { readTableSessionCookie } from '../../../../shared/table-session';
import { LocationNeutral, Public } from '../../../../shared/auth';
import { TableSessionService } from '../../application/table-session.service';
import { TenantResolverService } from '../../application/tenant-resolver.service';
import { LOCATION_REPOSITORY, type LocationRepository } from '../../domain/ports';

const VenueSchema = z.object({
  locationId: z.string().uuid().nullable(),
  name: z.string().nullable(),
  address: z.string().nullable(),
  openingHours: OpeningHours.nullable(),
  /** Guest wi-fi, the same one printed on the table tent. Never staff credentials. */
  wifi: WifiAccess.nullable(),
});
class VenueDto extends createZodDto(VenueSchema) {}

const EMPTY: z.infer<typeof VenueSchema> = {
  locationId: null,
  name: null,
  address: null,
  openingHours: null,
  wifi: null,
};

/**
 * Hours and wi-fi of the point the guest is actually sitting in. Which point that is comes from
 * their table session, never from the request — so this answer is per-guest and must not be
 * cached at the edge.
 */
@ApiTags('tenancy')
@Public()
@LocationNeutral()
@Controller('v1/venue')
export class PublicVenueController {
  constructor(
    @Inject(TenantResolverService) private readonly tenants: TenantResolverService,
    @Inject(TableSessionService) private readonly sessions: TableSessionService,
    @Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  @Get()
  @ApiOkResponse({ type: VenueDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async venue(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<VenueDto> {
    const trustProxy = this.env.TRUST_PROXY !== undefined && this.env.TRUST_PROXY.length > 0;
    const tenant = await this.tenants.resolveByCustomerHost(effectiveHost(req.headers, trustProxy));
    if (!tenant) throw new NotFoundException();

    reply.header('Cache-Control', 'private, no-store');

    const location = await this.resolveLocation(tenant.id, req);
    if (!location) return EMPTY;

    return {
      locationId: location.id,
      name: location.name,
      address: location.address,
      openingHours: location.openingHours,
      wifi: location.wifi,
    };
  }

  private async resolveLocation(tenantId: TenantId, req: FastifyRequest) {
    const sessionId = readTableSessionCookie(req.headers);
    if (sessionId !== undefined) {
      const session = await this.sessions.resolve(sessionId);
      if (session) return this.locations.findById(LocationId.parse(session.locationId));
    }
    // No table: a single-point restaurant still has one honest answer, a chain does not.
    const active = (await this.locations.listForTenant(tenantId)).filter(
      (l) => l.status === 'active',
    );
    return active.length === 1 ? (active[0] ?? null) : null;
  }
}
