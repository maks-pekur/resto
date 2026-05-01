import {
  Body,
  Controller,
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
import { ProvisionTenantInput } from '../../application/dto';
import { ProvisionTenantService } from '../../application/provision-tenant.service';
import { ArchiveTenantService } from '../../application/archive-tenant.service';
import { TenantQueriesService } from '../../application/tenant-queries.service';
import type { TenantSnapshot } from '../../domain/tenant.aggregate';
import type { TenantDomain } from '../../domain/tenant-domain';
import { ZodValidationPipe } from './zod-validation.pipe';
import { InternalTokenGuard } from './internal-token.guard';
import { mapDomainError } from './error-mapping';

interface TenantResponse {
  id: string;
  slug: string;
  displayName: string;
  status: string;
  locale: string;
  defaultCurrency: string;
  primaryDomain: string;
  stripeAccountId: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

const toResponse = (s: TenantSnapshot): TenantResponse => ({
  id: s.id,
  slug: s.slug,
  displayName: s.displayName,
  status: s.status,
  locale: s.locale,
  defaultCurrency: s.defaultCurrency,
  primaryDomain: s.primaryDomain.domain,
  stripeAccountId: s.stripeAccountId,
  createdAt: s.createdAt.toISOString(),
  updatedAt: s.updatedAt.toISOString(),
  archivedAt: s.archivedAt?.toISOString() ?? null,
});

const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (err) {
    throw mapDomainError(err);
  }
};

@ApiTags('tenancy')
@UseGuards(InternalTokenGuard)
@Controller('internal/v1/tenants')
export class TenantsController {
  constructor(
    @Inject(ProvisionTenantService) private readonly provisioning: ProvisionTenantService,
    @Inject(ArchiveTenantService) private readonly archiving: ArchiveTenantService,
    @Inject(TenantQueriesService) private readonly queries: TenantQueriesService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(ProvisionTenantInput))
  async provision(@Body() input: ProvisionTenantInput): Promise<TenantResponse> {
    const snapshot = await wrap(() => this.provisioning.execute(input));
    return toResponse(snapshot);
  }

  @Get(':slug')
  async getBySlug(@Param('slug') slug: string): Promise<TenantResponse> {
    const snapshot = await wrap(() => this.queries.getBySlug(slug));
    return toResponse(snapshot);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param('id') id: string): Promise<void> {
    await wrap(() => this.archiving.execute(id));
  }

  @Get(':id/domains')
  async listDomains(@Param('id') id: string): Promise<TenantDomain[]> {
    return wrap(() => this.queries.listDomains(id));
  }
}
