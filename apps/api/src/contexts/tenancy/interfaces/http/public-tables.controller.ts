import {
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { ResolveTableService } from '../../application/resolve-table.service';
import type { TenantSnapshot } from '../../domain/tenant.aggregate';
import { TenantResolverService } from '../../application/tenant-resolver.service';
import { mapDomainError } from './error-mapping';
import { LocationNeutral, Public } from '../../../../shared/auth';
import { wrapWith } from '../../../../shared/api/wrap';
import { ENV_TOKEN } from '../../../../config/config.module';
import type { Env } from '../../../../config/env.schema';
import { effectiveHost } from '../../../../shared/effective-host';

// Not "a long public cache": archiving a table would otherwise leave its sticker resolving to a
// live label at the edge for the cache lifetime. Mirrors MENU_AVAILABILITY_CACHE_CONTROL's shape.
const TABLE_RESOLUTION_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';

const TableResolutionSchema = z.object({
  tableId: z.string().uuid(),
  zoneName: z.string(),
  number: z.string(),
});

type TableResolution = z.infer<typeof TableResolutionSchema>;

class TableResolutionDto extends createZodDto(TableResolutionSchema) {}

const wrap = wrapWith(mapDomainError);

/**
 * The server-side other half of `GuestMenuUrlService`'s sticker URL. Deliberately off
 * `/v1/tenancy/*` — public and unauthenticated, never location-scoped. Mirrors
 * `PublicMenuController`'s host re-verification: `TenantContextMiddleware`'s fallback chain
 * resolves a broader host set than a guest sticker should ever answer on.
 */
@ApiTags('tenancy')
@Public()
@LocationNeutral()
@Controller('v1/tables')
export class PublicTableResolutionController {
  constructor(
    @Inject(ResolveTableService) private readonly resolveTable: ResolveTableService,
    @Inject(TenantResolverService) private readonly tenants: TenantResolverService,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  @Get(':id')
  @ApiOkResponse({ type: TableResolutionDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async resolve(
    @Param('id') id: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Headers('if-none-match') ifNoneMatch?: string,
  ): Promise<TableResolution | undefined> {
    const tenant = await this.requireGuestTenantOr404(req);

    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) throw new NotFoundException();

    const resolution = await wrap(() => this.resolveTable.execute(tenant.id, parsedId.data));

    const etag = `"${resolution.updatedAt.getTime().toString()}"`;
    if (ifNoneMatch === etag) {
      reply.status(304);
      return undefined;
    }
    reply.header('ETag', etag);
    reply.header('Cache-Control', TABLE_RESOLUTION_CACHE_CONTROL);
    return {
      tableId: resolution.tableId,
      zoneName: resolution.zoneName,
      number: resolution.number,
    };
  }

  private async requireGuestTenantOr404(req: FastifyRequest): Promise<TenantSnapshot> {
    const trustProxy = this.env.TRUST_PROXY !== undefined && this.env.TRUST_PROXY.length > 0;
    const host = effectiveHost(req.headers, trustProxy);
    const resolved = await this.tenants.resolveByCustomerHost(host);
    if (!resolved) throw new NotFoundException();
    return resolved;
  }
}
