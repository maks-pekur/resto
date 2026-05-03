import { Controller, ForbiddenException, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantQueriesService } from '../../application/tenant-queries.service';
import { CurrentOperator } from '../../../identity/interfaces/http/decorators/current-principal.decorator';
import { Permissions } from '../../../identity/interfaces/http/decorators/permissions.decorator';
import type { OperatorPrincipal } from '../../../identity/domain/principal';
import type { TenantDomain } from '../../domain/tenant-domain';
import { mapDomainError } from './error-mapping';
import { type TenantResponse, toResponse } from './tenant-response';

@ApiTags('tenancy')
@Controller('v1/tenants')
export class TenantsController {
  constructor(@Inject(TenantQueriesService) private readonly queries: TenantQueriesService) {}

  @Get('me')
  @Permissions({ tenant: ['read'] })
  async getMe(@CurrentOperator() operator: OperatorPrincipal): Promise<TenantResponse> {
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
  async getMeDomains(@CurrentOperator() operator: OperatorPrincipal): Promise<TenantDomain[]> {
    if (!operator.tenantId) {
      throw new ForbiddenException({ code: 'auth.no_active_tenant' });
    }
    try {
      return await this.queries.listDomains(operator.tenantId);
    } catch (err) {
      throw mapDomainError(err);
    }
  }
}
