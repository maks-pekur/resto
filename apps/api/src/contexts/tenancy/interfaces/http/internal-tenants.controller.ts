import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProvisionTenantInput } from '../../application/dto';
import { ProvisionTenantService } from '../../application/provision-tenant.service';
import { ArchiveTenantService } from '../../application/archive-tenant.service';
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
}
