import { Logger, Module } from '@nestjs/common';
import Stripe from 'stripe';
import { ENV_TOKEN } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { IdentityCoreModule } from '../identity/identity-core.module';
import { SeedPresetRolesService } from '../identity/application/seed-preset-roles.service';
import { ProvisionTenantService } from './application/provision-tenant.service';
import { ArchiveTenantService } from './application/archive-tenant.service';
import { OffboardTenantService } from './application/offboard-tenant.service';
import { SuspendTenantService } from './application/suspend-tenant.service';
import { TenantQueriesService } from './application/tenant-queries.service';
import { TenantResolverService } from './application/tenant-resolver.service';
import { StartTenantOnboardingService } from './application/start-tenant-onboarding.service';
import { ProvisionLocationService } from './application/provision-location.service';
import { ListLocationsService } from './application/list-locations.service';
import { ArchiveLocationService } from './application/archive-location.service';
import { LOCATION_REPOSITORY, TENANT_REPOSITORY } from './domain/ports';
import { PAYMENT_PROVIDER_PORT } from '../payments/domain/ports';
import { createStripeProviderAdapter } from '../payments/infrastructure/stripe/stripe-provider.adapter';
import { TenantDrizzleRepository } from './infrastructure/tenant-drizzle.repository';
import { LocationDrizzleRepository } from './infrastructure/location-drizzle.repository';
import { InternalTenantsController } from './interfaces/http/internal-tenants.controller';
import { TenantsController } from './interfaces/http/tenants.controller';
import { LocationsController } from './interfaces/http/locations.controller';
import {
  TenantOnboardingController,
  TenantOAuthCallbackController,
} from './interfaces/http/tenant-onboarding.controller';

@Module({
  imports: [IdentityCoreModule],
  controllers: [
    InternalTenantsController,
    TenantsController,
    TenantOnboardingController,
    TenantOAuthCallbackController,
    LocationsController,
  ],
  providers: [
    { provide: TENANT_REPOSITORY, useClass: TenantDrizzleRepository },
    { provide: LOCATION_REPOSITORY, useClass: LocationDrizzleRepository },
    {
      provide: PAYMENT_PROVIDER_PORT,
      inject: [ENV_TOKEN],
      useFactory: (env: Env) => {
        const stripe = new Stripe(env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder', {
          apiVersion: '2025-02-24.acacia',
          typescript: true,
        });
        return createStripeProviderAdapter(stripe, env, new Logger('StripeProviderAdapter'));
      },
    },
    ProvisionTenantService,
    ArchiveTenantService,
    OffboardTenantService,
    SuspendTenantService,
    TenantQueriesService,
    TenantResolverService,
    StartTenantOnboardingService,
    ProvisionLocationService,
    ListLocationsService,
    ArchiveLocationService,
    SeedPresetRolesService,
  ],
  exports: [
    TENANT_REPOSITORY,
    LOCATION_REPOSITORY,
    PAYMENT_PROVIDER_PORT,
    TenantResolverService,
    TenantQueriesService,
    OffboardTenantService,
    ProvisionTenantService,
    ProvisionLocationService,
    ListLocationsService,
    ArchiveLocationService,
  ],
})
export class TenancyModule {}
