import { Controller, ForbiddenException, Get, Inject } from '@nestjs/common';
import { ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { TenantQueriesService } from '../../application/tenant-queries.service';
import {
  CurrentOperator,
  Permissions,
  type OperatorPrincipal,
} from '../../../identity/interfaces/http';
import { mapDomainError } from './error-mapping';
import { TenantResponseDto, toResponse } from './tenant-response';

const TenantDomainSchema = z.object({
  id: z.string().uuid(),
  domain: z.string(),
  kind: z.string(),
  isPrimary: z.boolean(),
  verifiedAt: z.string().nullable(),
});

class TenantDomainDto extends createZodDto(TenantDomainSchema) {}

@ApiTags('tenancy')
@Controller('v1/tenants')
export class TenantsController {
  constructor(@Inject(TenantQueriesService) private readonly queries: TenantQueriesService) {}

  @Get('me')
  @Permissions({ tenant: ['read'] })
  @ApiOkResponse({ type: TenantResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async getMe(@CurrentOperator() operator: OperatorPrincipal): Promise<TenantResponseDto> {
    if (!operator.tenantId) {
      throw new ForbiddenException({ code: 'auth.no_active_tenant' });
    }
    try {
      return toResponse(await this.queries.getById(operator.tenantId));
    } catch (err) {
      throw mapDomainError(err);
    }
  }

  @Get('me/domains')
  @Permissions({ tenant: ['read'] })
  @ApiOkResponse({ type: TenantDomainDto, isArray: true })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async getMeDomains(@CurrentOperator() operator: OperatorPrincipal): Promise<TenantDomainDto[]> {
    if (!operator.tenantId) {
      throw new ForbiddenException({ code: 'auth.no_active_tenant' });
    }
    try {
      const domains = await this.queries.listDomains(operator.tenantId);
      return domains.map((d) => ({
        id: d.id,
        domain: d.domain,
        kind: d.kind,
        isPrimary: d.isPrimary,
        verifiedAt: d.verifiedAt?.toISOString() ?? null,
      }));
    } catch (err) {
      throw mapDomainError(err);
    }
  }
}
