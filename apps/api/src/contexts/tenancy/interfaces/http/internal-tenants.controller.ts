import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ProvisionTenantInputDto, ScheduleOffboardingInputDto } from '../../application/dto';
import { ProvisionTenantService } from '../../application/provision-tenant.service';
import { ArchiveTenantService } from '../../application/archive-tenant.service';
import { OffboardTenantService } from '../../application/offboard-tenant.service';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { InternalTokenGuard } from './internal-token.guard';
import { mapDomainError } from './error-mapping';
import { Public } from '../../../identity/interfaces/http/decorators/public.decorator';
import { TenantResponseDto, toResponse } from './tenant-response';

const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (err) {
    throw mapDomainError(err);
  }
};

@ApiTags('tenancy')
@Public()
@UseGuards(InternalTokenGuard)
@Controller('internal/v1/tenants')
export class InternalTenantsController {
  constructor(
    @Inject(ProvisionTenantService) private readonly provisioning: ProvisionTenantService,
    @Inject(ArchiveTenantService) private readonly archiving: ArchiveTenantService,
    @Inject(OffboardTenantService) private readonly offboarding: OffboardTenantService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: ProvisionTenantInputDto })
  @ApiCreatedResponse({ type: TenantResponseDto })
  @ApiConflictResponse({ type: ProblemDetailsDto, description: 'slug already taken' })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  async provision(
    @Body(new RestoZodValidationPipe(ProvisionTenantInputDto)) input: ProvisionTenantInputDto,
  ): Promise<TenantResponseDto> {
    const snapshot = await wrap(() => this.provisioning.execute(input));
    return toResponse(snapshot);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  async archive(@Param('id') id: string): Promise<void> {
    await wrap(() => this.archiving.execute(id));
  }

  @Get('scheduled-offboarding')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TenantResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  async listScheduledOffboarding(): Promise<TenantResponseDto[]> {
    const snapshots = await wrap(() => this.offboarding.listScheduled());
    return snapshots.map(toResponse);
  }

  @Post(':id/offboard')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBody({ type: ScheduleOffboardingInputDto })
  @ApiAcceptedResponse({ type: TenantResponseDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  async scheduleOffboarding(
    @Param('id') id: string,
    @Body(new RestoZodValidationPipe(ScheduleOffboardingInputDto))
    input: ScheduleOffboardingInputDto,
  ): Promise<TenantResponseDto> {
    const snapshot = await wrap(() =>
      this.offboarding.schedule({ tenantId: id, requestedBy: input.requestedBy }),
    );
    return toResponse(snapshot);
  }

  @Delete(':id/offboard')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TenantResponseDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  async cancelOffboarding(@Param('id') id: string): Promise<TenantResponseDto> {
    const snapshot = await wrap(() => this.offboarding.cancel({ tenantId: id }));
    return toResponse(snapshot);
  }
}
