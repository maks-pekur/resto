import { Logger, Module } from '@nestjs/common';
import Stripe from 'stripe';
import { ENV_TOKEN } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { IdentityCoreModule } from '../identity/identity-core.module';
import { SeedPresetRolesService } from '../identity/application/seed-preset-roles.service';
import { ProvisionTenantService } from './application/provision-tenant.service';
import { ProvisionBrandService } from './application/provision-brand.service';
import { ArchiveTenantService } from './application/archive-tenant.service';
import { OffboardTenantService } from './application/offboard-tenant.service';
import { SuspendTenantService } from './application/suspend-tenant.service';
import { TenantQueriesService } from './application/tenant-queries.service';
import { BrandQueriesService } from './application/brand-queries.service';
import { TenantResolverService } from './application/tenant-resolver.service';
import { TenantAndBrandResolverService } from './application/tenant-and-brand-resolver.service';
import { StartStripeOnboardingService } from './application/start-stripe-onboarding.service';
import { StartBrandOnboardingService } from './application/start-brand-onboarding.service';
import { ProvisionLocationService } from './application/provision-location.service';
import { ListLocationsService } from './application/list-locations.service';
import { ArchiveLocationService } from './application/archive-location.service';
import { BRAND_REPOSITORY, LOCATION_REPOSITORY, TENANT_REPOSITORY } from './domain/ports';
import { PAYMENT_PROVIDER_PORT } from '../payments/domain/ports';
import { createStripeProviderAdapter } from '../payments/infrastructure/stripe/stripe-provider.adapter';
import { TenantDrizzleRepository } from './infrastructure/tenant-drizzle.repository';
import { BrandDrizzleRepository } from './infrastructure/brand-drizzle.repository';
import { LocationDrizzleRepository } from './infrastructure/location-drizzle.repository';
import { InternalTenantsController } from './interfaces/http/internal-tenants.controller';
import { TenantsController } from './interfaces/http/tenants.controller';
import { StripeOnboardingController } from './interfaces/http/stripe-onboarding.controller';
import { LocationsController } from './interfaces/http/locations.controller';
import {
  BrandOnboardingController,
  BrandOAuthCallbackController,
} from './interfaces/http/brand-onboarding.controller';

@Module({
  imports: [IdentityCoreModule],
  controllers: [
    InternalTenantsController,
    TenantsController,
    StripeOnboardingController,
    BrandOnboardingController,
    BrandOAuthCallbackController,
    LocationsController,
  ],
  providers: [
    { provide: TENANT_REPOSITORY, useClass: TenantDrizzleRepository },
    { provide: BRAND_REPOSITORY, useClass: BrandDrizzleRepository },
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
    ProvisionBrandService,
    ArchiveTenantService,
    OffboardTenantService,
    SuspendTenantService,
    TenantQueriesService,
    BrandQueriesService,
    TenantResolverService,
    TenantAndBrandResolverService,
    StartStripeOnboardingService,
    StartBrandOnboardingService,
    ProvisionLocationService,
    ListLocationsService,
    ArchiveLocationService,
    SeedPresetRolesService,
  ],
  exports: [
    TENANT_REPOSITORY,
    BRAND_REPOSITORY,
    LOCATION_REPOSITORY,
    PAYMENT_PROVIDER_PORT,
    TenantResolverService,
    TenantAndBrandResolverService,
    TenantQueriesService,
    BrandQueriesService,
    OffboardTenantService,
    ProvisionTenantService,
    ProvisionBrandService,
    ProvisionLocationService,
    ListLocationsService,
    ArchiveLocationService,
  ],
})
export class TenancyModule {}
