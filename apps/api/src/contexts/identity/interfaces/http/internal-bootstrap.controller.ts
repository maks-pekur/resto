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
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  BootstrapOwnerService,
  type BootstrapOwnerResult,
} from '../../application/bootstrap-owner.service';
import {
  TENANT_LOOKUP_PORT,
  type TenantLookupPort,
} from '../../application/ports/tenant-lookup.port';
import { TenantNotFoundForBootstrapError } from '../../domain/bootstrap-errors';
import { mapIdentityError } from './error-mapping';
import { Public } from './decorators/public.decorator';
import { InternalTokenGuard } from '../../../tenancy/interfaces/http/internal-token.guard';
import { ZodValidationPipe } from '../../../tenancy/interfaces/http/zod-validation.pipe';

export const BootstrapOwnerInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12).max(128),
  name: z.string().trim().min(1).max(120),
});
export type BootstrapOwnerInput = z.infer<typeof BootstrapOwnerInput>;

const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (err) {
    throw mapIdentityError(err);
  }
};

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
  async createOwner(
    @Param('id') tenantId: string,
    @Body(new ZodValidationPipe(BootstrapOwnerInput))
    input: BootstrapOwnerInput,
  ): Promise<BootstrapOwnerResult> {
    return wrap(async () => {
      const tenant = await this.tenants.findById(tenantId);
      if (!tenant) {
        // Re-throw as the bootstrap-flow error so error-mapping resolves
        // a stable `bootstrap.tenant_not_found` code on the response.
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
