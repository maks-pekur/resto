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
  UsePipes,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProvisionTenantInput, ScheduleOffboardingInput } from '../../application/dto';
import { ProvisionTenantService } from '../../application/provision-tenant.service';
import { ArchiveTenantService } from '../../application/archive-tenant.service';
import { OffboardTenantService } from '../../application/offboard-tenant.service';
import { ZodValidationPipe } from './zod-validation.pipe';
import { InternalTokenGuard } from './internal-token.guard';
import { mapDomainError } from './error-mapping';
import { Public } from '../../../identity/interfaces/http/decorators/public.decorator';
import { type TenantResponse, toResponse } from './tenant-response';

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
  @UsePipes(new ZodValidationPipe(ProvisionTenantInput))
  async provision(@Body() input: ProvisionTenantInput): Promise<TenantResponse> {
    const snapshot = await wrap(() => this.provisioning.execute(input));
    return toResponse(snapshot);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param('id') id: string): Promise<void> {
    await wrap(() => this.archiving.execute(id));
  }

  @Get('scheduled-offboarding')
  @HttpCode(HttpStatus.OK)
  async listScheduledOffboarding(): Promise<TenantResponse[]> {
    const snapshots = await wrap(() => this.offboarding.listScheduled());
    return snapshots.map(toResponse);
  }

  @Post(':id/offboard')
  @HttpCode(HttpStatus.ACCEPTED)
  @UsePipes(new ZodValidationPipe(ScheduleOffboardingInput))
  async scheduleOffboarding(
    @Param('id') id: string,
    @Body() input: ScheduleOffboardingInput,
  ): Promise<TenantResponse> {
    const snapshot = await wrap(() =>
      this.offboarding.schedule({ tenantId: id, requestedBy: input.requestedBy }),
    );
    return toResponse(snapshot);
  }

  @Delete(':id/offboard')
  @HttpCode(HttpStatus.OK)
  async cancelOffboarding(@Param('id') id: string): Promise<TenantResponse> {
    const snapshot = await wrap(() => this.offboarding.cancel({ tenantId: id }));
    return toResponse(snapshot);
  }
}
