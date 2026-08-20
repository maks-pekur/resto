import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { requireTenantContext } from '@resto/db';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { TenantQueriesService } from '../../application/tenant-queries.service';
import { OffboardTenantService } from '../../application/offboard-tenant.service';
import { ScheduleOffboardingInputDto } from '../../application/dto';
import {
  BrandNeutral,
  LocationNeutral,
  Permissions,
  RequiresTenantContext,
} from '../../../../shared/auth';
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
@BrandNeutral()
@LocationNeutral()
@Controller('v1/tenants')
export class TenantsController {
  constructor(
    @Inject(TenantQueriesService) private readonly queries: TenantQueriesService,
    @Inject(OffboardTenantService) private readonly offboarding: OffboardTenantService,
  ) {}

  @Get('me')
  @Permissions({ tenant: ['read'] })
  @RequiresTenantContext()
  @ApiOkResponse({ type: TenantResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async getMe(): Promise<TenantResponseDto> {
    try {
      return toResponse(await this.queries.getCurrentTenant());
    } catch (err) {
      throw mapDomainError(err);
    }
  }

  @Get('me/domains')
  @Permissions({ tenant: ['read'] })
  @RequiresTenantContext()
  @ApiOkResponse({ type: TenantDomainDto, isArray: true })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async getMeDomains(): Promise<TenantDomainDto[]> {
    try {
      const domains = await this.queries.listCurrentTenantDomains();
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

  @Post('me/offboard')
  @HttpCode(HttpStatus.ACCEPTED)
  @Permissions({ tenant: ['delete'] })
  @RequiresTenantContext()
  @ApiBody({ type: ScheduleOffboardingInputDto })
  @ApiAcceptedResponse({ type: TenantResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async scheduleOffboarding(
    @Body(new RestoZodValidationPipe(ScheduleOffboardingInputDto))
    input: ScheduleOffboardingInputDto,
  ): Promise<TenantResponseDto> {
    try {
      const { tenantId } = requireTenantContext();
      const snapshot = await this.offboarding.schedule({
        tenantId,
        requestedBy: input.requestedBy,
      });
      return toResponse(snapshot);
    } catch (err) {
      throw mapDomainError(err);
    }
  }

  @Delete('me/offboard')
  @HttpCode(HttpStatus.OK)
  @Permissions({ tenant: ['delete'] })
  @RequiresTenantContext()
  @ApiOkResponse({ type: TenantResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async cancelOffboarding(): Promise<TenantResponseDto> {
    try {
      const { tenantId } = requireTenantContext();
      const snapshot = await this.offboarding.cancel({ tenantId });
      return toResponse(snapshot);
    } catch (err) {
      throw mapDomainError(err);
    }
  }
}
