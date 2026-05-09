import { Module } from '@nestjs/common';
import { ProvisionTenantService } from './application/provision-tenant.service';
import { ArchiveTenantService } from './application/archive-tenant.service';
import { OffboardTenantService } from './application/offboard-tenant.service';
import { TenantQueriesService } from './application/tenant-queries.service';
import { TenantResolverService } from './application/tenant-resolver.service';
import { STRIPE_CONNECT_PORT, TENANT_REPOSITORY } from './domain/ports';
import { NoopStripeConnectAdapter } from './infrastructure/stripe-connect.adapter';
import { TenantDrizzleRepository } from './infrastructure/tenant-drizzle.repository';
import { InternalTokenGuard } from './interfaces/http/internal-token.guard';
import { InternalTenantsController } from './interfaces/http/internal-tenants.controller';
import { TenantsController } from './interfaces/http/tenants.controller';

@Module({
  controllers: [InternalTenantsController, TenantsController],
  providers: [
    { provide: TENANT_REPOSITORY, useClass: TenantDrizzleRepository },
    { provide: STRIPE_CONNECT_PORT, useClass: NoopStripeConnectAdapter },
    ProvisionTenantService,
    ArchiveTenantService,
    OffboardTenantService,
    TenantQueriesService,
    TenantResolverService,
    InternalTokenGuard,
  ],
  exports: [TenantResolverService, TenantQueriesService, OffboardTenantService],
})
export class TenancyModule {}
