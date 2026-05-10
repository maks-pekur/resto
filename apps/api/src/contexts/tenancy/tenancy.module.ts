import { Module } from '@nestjs/common';
import { ProvisionTenantService } from './application/provision-tenant.service';
import { ProvisionBrandService } from './application/provision-brand.service';
import { ArchiveTenantService } from './application/archive-tenant.service';
import { OffboardTenantService } from './application/offboard-tenant.service';
import { TenantQueriesService } from './application/tenant-queries.service';
import { BrandQueriesService } from './application/brand-queries.service';
import { TenantResolverService } from './application/tenant-resolver.service';
import { TenantAndBrandResolverService } from './application/tenant-and-brand-resolver.service';
import { BRAND_REPOSITORY, STRIPE_CONNECT_PORT, TENANT_REPOSITORY } from './domain/ports';
import { NoopStripeConnectAdapter } from './infrastructure/stripe-connect.adapter';
import { TenantDrizzleRepository } from './infrastructure/tenant-drizzle.repository';
import { BrandDrizzleRepository } from './infrastructure/brand-drizzle.repository';
import { InternalTokenGuard } from './interfaces/http/internal-token.guard';
import { InternalTenantsController } from './interfaces/http/internal-tenants.controller';
import { TenantsController } from './interfaces/http/tenants.controller';

@Module({
  controllers: [InternalTenantsController, TenantsController],
  providers: [
    { provide: TENANT_REPOSITORY, useClass: TenantDrizzleRepository },
    { provide: BRAND_REPOSITORY, useClass: BrandDrizzleRepository },
    { provide: STRIPE_CONNECT_PORT, useClass: NoopStripeConnectAdapter },
    ProvisionTenantService,
    ProvisionBrandService,
    ArchiveTenantService,
    OffboardTenantService,
    TenantQueriesService,
    BrandQueriesService,
    TenantResolverService,
    TenantAndBrandResolverService,
    InternalTokenGuard,
  ],
  // Public surface for cross-context callers. Repository tokens
  // (BRAND_REPOSITORY, TENANT_REPOSITORY) intentionally NOT exported —
  // other contexts depend on application services only and project
  // tenancy's domain types into their own port shapes (RES-166).
  exports: [
    TenantResolverService,
    TenantAndBrandResolverService,
    TenantQueriesService,
    BrandQueriesService,
    OffboardTenantService,
    ProvisionTenantService,
    ProvisionBrandService,
  ],
})
export class TenancyModule {}
