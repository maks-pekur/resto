import { Logger, Module } from '@nestjs/common';
import Stripe from 'stripe';
import { ENV_TOKEN } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
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
import { BRAND_REPOSITORY, TENANT_REPOSITORY } from './domain/ports';
import { PAYMENT_PROVIDER_PORT } from '../payments/domain/ports';
import { createStripeProviderAdapter } from '../payments/infrastructure/stripe/stripe-provider.adapter';
import { TenantDrizzleRepository } from './infrastructure/tenant-drizzle.repository';
import { BrandDrizzleRepository } from './infrastructure/brand-drizzle.repository';
import { InternalTenantsController } from './interfaces/http/internal-tenants.controller';
import { TenantsController } from './interfaces/http/tenants.controller';
import { StripeOnboardingController } from './interfaces/http/stripe-onboarding.controller';

@Module({
  controllers: [InternalTenantsController, TenantsController, StripeOnboardingController],
  providers: [
    { provide: TENANT_REPOSITORY, useClass: TenantDrizzleRepository },
    { provide: BRAND_REPOSITORY, useClass: BrandDrizzleRepository },
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
  ],
  exports: [
    TENANT_REPOSITORY,
    BRAND_REPOSITORY,
    PAYMENT_PROVIDER_PORT,
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
