import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { InternalTokenGuard } from '../../../../shared/api/internal-token.guard';
import { BootstrapOwnerService } from '../../application/bootstrap-owner.service';
import {
  TENANT_LOOKUP_PORT,
  type TenantLookupPort,
} from '../../application/ports/tenant-lookup.port';
import { TenantNotFoundForBootstrapError } from '../../domain/bootstrap-errors';
import { Public } from '../../../../shared/auth';
import { wrapWith } from '../../../../shared/api/wrap';
import { mapIdentityError } from './error-mapping';

const BootstrapOwnerInputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12).max(128),
  name: z.string().trim().min(1).max(120),
});

class BootstrapOwnerInputDto extends createZodDto(BootstrapOwnerInputSchema) {}

const BootstrapOwnerResponseSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string(),
  organizationId: z.string().uuid(),
  email: z.string().email(),
  requiresPasswordChange: z.boolean(),
});

class BootstrapOwnerResponseDto extends createZodDto(BootstrapOwnerResponseSchema) {}

const wrap = wrapWith(mapIdentityError);

/**
 * Bootstrap the first owner for a tenant.
 *
 * Path matches the existing `/internal/v1/tenants/...` family — the
 * tenant id from the prior `POST /internal/v1/tenants` response is
 * the natural address. The body carries credentials. Auth is the
 * shared `INTERNAL_API_TOKEN` (ADR-0012); per-user IAM lands when
 * the operator UI ships and the seed CLI is replaced by an admin
 * invite flow.
 *
 * The endpoint is idempotent on `(tenantId, email)`: re-running with
 * the same email is a no-op (BA already has the user); re-running
 * with a different email when an owner already exists returns 409.
 */
@ApiTags('identity')
@Public()
@UseGuards(InternalTokenGuard)
@Controller('internal/v1/tenants')
export class InternalBootstrapController {
  constructor(
    @Inject(BootstrapOwnerService) private readonly bootstrap: BootstrapOwnerService,
    @Inject(TENANT_LOOKUP_PORT) private readonly tenants: TenantLookupPort,
  ) {}

  @Post(':id/owner')
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: BootstrapOwnerInputDto })
  @ApiCreatedResponse({ type: BootstrapOwnerResponseDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto, description: 'tenant not found' })
  @ApiConflictResponse({ type: ProblemDetailsDto, description: 'owner already exists' })
  @ApiUnauthorizedResponse({
    type: ProblemDetailsDto,
    description: 'missing or invalid internal token',
  })
  async createOwner(
    @Param('id') tenantId: string,
    @Body(new RestoZodValidationPipe(BootstrapOwnerInputDto)) input: BootstrapOwnerInputDto,
  ): Promise<BootstrapOwnerResponseDto> {
    return wrap(async () => {
      const tenant = await this.tenants.findById(tenantId);
      if (!tenant) {
        throw new TenantNotFoundForBootstrapError(tenantId);
      }
      return this.bootstrap.execute({
        tenantSlug: tenant.slug,
        email: input.email,
        password: input.password,
        name: input.name,
      });
    });
  }
}
