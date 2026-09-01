import { Logger, Module } from '@nestjs/common';
import Stripe from 'stripe';
import { ENV_TOKEN } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { IdentityCoreModule } from '../identity/identity-core.module';
import { SeedPresetRolesService } from '../identity/application/roles/seed-preset-roles.service';
import { ProvisionTenantService } from './application/provision-tenant.service';
import { FinalizeTenantOnboardingService } from './application/finalize-tenant-onboarding.service';
import { ArchiveTenantService } from './application/archive-tenant.service';
import { OffboardTenantService } from './application/offboard-tenant.service';
import { SuspendTenantService } from './application/suspend-tenant.service';
import { TenantQueriesService } from './application/tenant-queries.service';
import { TenantResolverService } from './application/tenant-resolver.service';
import { StartTenantOnboardingService } from './application/start-tenant-onboarding.service';
import { ProvisionLocationService } from './application/provision-location.service';
import { ListLocationsService } from './application/list-locations.service';
import { ArchiveLocationService } from './application/archive-location.service';
import { RestoreLocationService } from './application/restore-location.service';
import { DeleteLocationService } from './application/delete-location.service';
import { SetContentLocalesService } from './application/set-content-locales.service';
import { UpdateBrandService } from './application/update-brand.service';
import { GetBrandLogoUploadUrlService } from './application/get-brand-logo-upload-url.service';
import { S3BrandMediaAdapter } from './infrastructure/s3-brand-media.adapter';
import { BRAND_MEDIA_PORT } from './domain/ports';
import { UpdateLocationService } from './application/update-location.service';
import { CreateTableZoneService } from './application/create-table-zone.service';
import { ListTableZonesService } from './application/list-table-zones.service';
import { AddTablesService } from './application/add-tables.service';
import { RenameTableZoneService } from './application/rename-table-zone.service';
import { RenameTableService } from './application/rename-table.service';
import { ArchiveTableZoneService } from './application/archive-table-zone.service';
import { ArchiveTableService } from './application/archive-table.service';
import { TableSessionService } from './application/table-session.service';
import { GuestMenuUrlService } from './application/guest-menu-url.service';
import { ResolveTableService } from './application/resolve-table.service';
import { LOCATION_REPOSITORY, TABLE_ZONE_REPOSITORY, TENANT_REPOSITORY } from './domain/ports';
import { PAYMENT_PROVIDER_PORT } from '../payments/domain/ports';
import { createStripeProviderAdapter } from '../payments/infrastructure/stripe/stripe-provider.adapter';
import { TenantDrizzleRepository } from './infrastructure/tenant-drizzle.repository';
import { LocationDrizzleRepository } from './infrastructure/location-drizzle.repository';
import { TableZoneDrizzleRepository } from './infrastructure/table-zone-drizzle.repository';
import { InternalTenantsController } from './interfaces/http/internal-tenants.controller';
import { TenantsController } from './interfaces/http/tenants.controller';
import { LocationsController } from './interfaces/http/locations.controller';
import { TableZonesController } from './interfaces/http/table-zones.controller';
import { PublicTableResolutionController } from './interfaces/http/public-tables.controller';
import { PublicVenueController } from './interfaces/http/public-venue.controller';
import { PublicLegalController } from './interfaces/http/public-legal.controller';
import { ServiceRequestsController } from './interfaces/http/service-requests.controller';
import { ServiceRequestDrizzleRepository } from './infrastructure/service-request-drizzle.repository';
import { SERVICE_REQUEST_REPOSITORY } from './domain/service-request';
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
    TableZonesController,
    PublicTableResolutionController,
    PublicVenueController,
    PublicLegalController,
    ServiceRequestsController,
  ],
  providers: [
    { provide: SERVICE_REQUEST_REPOSITORY, useClass: ServiceRequestDrizzleRepository },
    { provide: TENANT_REPOSITORY, useClass: TenantDrizzleRepository },
    { provide: LOCATION_REPOSITORY, useClass: LocationDrizzleRepository },
    { provide: TABLE_ZONE_REPOSITORY, useClass: TableZoneDrizzleRepository },
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
    FinalizeTenantOnboardingService,
    ArchiveTenantService,
    OffboardTenantService,
    SuspendTenantService,
    TenantQueriesService,
    TenantResolverService,
    StartTenantOnboardingService,
    ProvisionLocationService,
    ListLocationsService,
    ArchiveLocationService,
    RestoreLocationService,
    DeleteLocationService,
    SetContentLocalesService,
    UpdateBrandService,
    GetBrandLogoUploadUrlService,
    { provide: BRAND_MEDIA_PORT, useClass: S3BrandMediaAdapter },
    UpdateLocationService,
    CreateTableZoneService,
    ListTableZonesService,
    AddTablesService,
    RenameTableZoneService,
    RenameTableService,
    ArchiveTableZoneService,
    ArchiveTableService,
    GuestMenuUrlService,
    TableSessionService,
    ResolveTableService,
    SeedPresetRolesService,
  ],
  exports: [
    TENANT_REPOSITORY,
    LOCATION_REPOSITORY,
    TABLE_ZONE_REPOSITORY,
    PAYMENT_PROVIDER_PORT,
    TenantResolverService,
    TenantQueriesService,
    OffboardTenantService,
    ProvisionTenantService,
    FinalizeTenantOnboardingService,
    ProvisionLocationService,
    ListLocationsService,
    ArchiveLocationService,
    RestoreLocationService,
    DeleteLocationService,
    SetContentLocalesService,
    UpdateLocationService,
    GuestMenuUrlService,
    // The ordering controller reads a guest's table from their scanned session.
    TableSessionService,
  ],
})
export class TenancyModule {}
