import { Controller, Get, Inject, NotFoundException, Req, Res } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createZodDto } from 'nestjs-zod';
import { LegalDocuments } from '@resto/domain';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { ENV_TOKEN } from '../../../../config/config.module';
import type { Env } from '../../../../config/env.schema';
import { effectiveHost } from '../../../../shared/effective-host';
import { LocationNeutral, Public } from '../../../../shared/auth';
import { TenantResolverService } from '../../application/tenant-resolver.service';

class LegalDocumentsDto extends createZodDto(LegalDocuments) {}

// The same text for every guest of this restaurant, and it changes about once a year.
const LEGAL_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=3600';

const EMPTY = LegalDocuments.parse({});

/** What the venue publishes about itself: the company, how it takes money, cookies, terms. */
@ApiTags('tenancy')
@Public()
@LocationNeutral()
@Controller('v1/legal')
export class PublicLegalController {
  constructor(
    @Inject(TenantResolverService) private readonly tenants: TenantResolverService,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  @Get()
  @ApiOkResponse({ type: LegalDocumentsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async documents(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LegalDocumentsDto> {
    const trustProxy = this.env.TRUST_PROXY !== undefined && this.env.TRUST_PROXY.length > 0;
    const tenant = await this.tenants.resolveByCustomerHost(effectiveHost(req.headers, trustProxy));
    if (!tenant) throw new NotFoundException();

    reply.header('Cache-Control', LEGAL_CACHE_CONTROL);
    return tenant.legalDocuments ?? EMPTY;
  }
}
