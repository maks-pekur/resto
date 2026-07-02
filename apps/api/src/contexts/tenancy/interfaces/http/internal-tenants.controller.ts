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
import { TenantId } from '@resto/domain';
import {
  ProvisionTenantInputDto,
  ScheduleOffboardingInputDto,
  SuspendTenantInputDto,
  SuspendTenantInputSchema,
} from '../../application/dto';
import { ProvisionTenantService } from '../../application/provision-tenant.service';
import { ArchiveTenantService } from '../../application/archive-tenant.service';
import { OffboardTenantService } from '../../application/offboard-tenant.service';
import { SuspendTenantService } from '../../application/suspend-tenant.service';
import { TenantNotFoundError } from '../../domain/errors';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { InternalTokenGuard } from '../../../../shared/api/internal-token.guard';
import { mapDomainError } from './error-mapping';
import { BrandNeutral, Public } from '../../../../shared/auth';
import { wrapWith } from '../../../../shared/api/wrap';
import { TenantResponseDto, toResponse } from './tenant-response';

const wrap = wrapWith(mapDomainError);

const parseTenantIdOr404 = (raw: string): TenantId => {
  const parsed = TenantId.safeParse(raw);
  if (!parsed.success) throw new TenantNotFoundError(raw);
  return parsed.data;
};

@ApiTags('tenancy')
@Public()
@BrandNeutral()
@UseGuards(InternalTokenGuard)
@Controller('internal/v1/tenants')
export class InternalTenantsController {
  constructor(
    @Inject(ProvisionTenantService) private readonly provisioning: ProvisionTenantService,
    @Inject(ArchiveTenantService) private readonly archiving: ArchiveTenantService,
    @Inject(OffboardTenantService) private readonly offboarding: OffboardTenantService,
    @Inject(SuspendTenantService) private readonly suspending: SuspendTenantService,
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
    await wrap(() => this.archiving.execute(parseTenantIdOr404(id)));
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
      this.offboarding.schedule({
        tenantId: parseTenantIdOr404(id),
        requestedBy: input.requestedBy,
      }),
    );
    return toResponse(snapshot);
  }

  @Delete(':id/offboard')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TenantResponseDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  async cancelOffboarding(@Param('id') id: string): Promise<TenantResponseDto> {
    const snapshot = await wrap(() =>
      this.offboarding.cancel({ tenantId: parseTenantIdOr404(id) }),
    );
    return toResponse(snapshot);
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: SuspendTenantInputDto })
  @ApiOkResponse({ type: TenantResponseDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  async suspend(
    @Param('id') id: string,
    @Body(new RestoZodValidationPipe(SuspendTenantInputSchema)) input: SuspendTenantInputDto,
  ): Promise<TenantResponseDto> {
    const snapshot = await wrap(() =>
      this.suspending.suspend({
        tenantId: parseTenantIdOr404(id),
        requestedBy: input.requestedBy,
      }),
    );
    return toResponse(snapshot);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TenantResponseDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  async resume(@Param('id') id: string): Promise<TenantResponseDto> {
    const snapshot = await wrap(() => this.suspending.resume({ tenantId: parseTenantIdOr404(id) }));
    return toResponse(snapshot);
  }
}
