import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { APP_GUARD, HttpAdapterHost } from '@nestjs/core';
import type { FastifyInstance } from 'fastify';
import { ENV_TOKEN } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { TenancyModule } from '../tenancy/tenancy.module';
import { IdentityCoreModule } from './identity-core.module';
import { AUTH_TOKEN } from './identity.tokens';
import type { Auth } from './infrastructure/better-auth/auth.config';
import { BootstrapOwnerService } from './application/bootstrap-owner.service';
import { CreateRoleService } from './application/create-role.service';
import { UpdateRoleService } from './application/update-role.service';
import { ArchiveRoleService } from './application/archive-role.service';
import { ListRolesService } from './application/list-roles.service';
import { AssignRoleService } from './application/assign-role.service';
import { ListMembersService } from './application/list-members.service';
import { RolesController } from './interfaces/http/roles.controller';
import { MemberRolesController } from './interfaces/http/member-roles.controller';
import { TENANT_LOOKUP_PORT } from './application/ports/tenant-lookup.port';
import { TenantLookupAdapter } from './infrastructure/tenant-lookup.adapter';
import { AuthGuard } from './interfaces/http/guards/auth.guard';
import { BrandSlugRateLimitGuard } from './interfaces/http/guards/brand-slug-rate-limit.guard';
import { PermissionsGuard } from './interfaces/http/guards/permissions.guard';
import { registerBetterAuthHandler } from './interfaces/http/better-auth.handler';
import { MeController } from './interfaces/http/me.controller';
import { InternalBootstrapController } from './interfaces/http/internal-bootstrap.controller';
import { SignUpController } from './interfaces/http/signup.controller';
import { SignUpService } from './application/signup.service';
import { ListMyBrandsService } from './application/list-my-brands.service';
import { CreateMyBrandService } from './application/create-my-brand.service';
import { CheckBrandSlugAvailabilityService } from './application/check-brand-slug-availability.service';
import { SetActiveBrandService } from './application/set-active-brand.service';
import { SetActiveLocationService } from './application/set-active-location.service';
import { MeBrandsController } from './interfaces/http/me-brands.controller';
import { SetActiveBrandController } from './interfaces/http/set-active-brand.controller';
import { SetActiveLocationController } from './interfaces/http/set-active-location.controller';
import { BrandScopeGuard } from './interfaces/http/guards/brand-scope.guard';
import { LocationScopeGuard } from './interfaces/http/guards/location-scope.guard';
import { MEMBER_BRAND_SCOPE_READER } from './application/ports/member-brand-scope-reader.port';
import { MemberBrandScopeDrizzleReader } from './infrastructure/member-brand-scope-drizzle.reader';
import { MEMBER_LOCATION_SCOPE_READER } from './application/ports/member-location-scope-reader.port';
import { MemberLocationScopeDrizzleReader } from './infrastructure/member-location-scope-drizzle.reader';
import { SESSION_ACTIVE_BRAND_WRITER } from './application/ports/session-active-brand-writer.port';
import { BetterAuthSessionActiveBrandWriter } from './infrastructure/better-auth/session-active-brand.adapter';
import { SESSION_ACTIVE_LOCATION_WRITER } from './application/ports/session-active-location-writer.port';
import { BetterAuthSessionActiveLocationWriter } from './infrastructure/better-auth/session-active-location.adapter';
import { BA_USER_READER } from './application/ports/ba-user-reader.port';
import { BaUserDrizzleReader } from './infrastructure/ba-user-drizzle.reader';
import { TENANT_PROVISIONING_PORT } from './application/ports/tenant-provisioning.port';
import { TenantProvisioningAdapter } from './infrastructure/tenant-provisioning.adapter';
import { BRAND_PROVISIONING_PORT } from './application/ports/brand-provisioning.port';
import { BrandProvisioningAdapter } from './infrastructure/brand-provisioning.adapter';

/**
 * HTTP-side composition for the identity context. Imports
 * `IdentityCoreModule` for BA wiring and `TenancyModule` so the
 * tenant-lookup adapter (used by `BootstrapOwnerService` and the
 * bootstrap controller) can resolve `TenantQueriesService`.
 */
@Module({
  imports: [IdentityCoreModule, TenancyModule],
  controllers: [
    MeController,
    MeBrandsController,
    SetActiveBrandController,
    SetActiveLocationController,
    InternalBootstrapController,
    SignUpController,
    RolesController,
    MemberRolesController,
  ],
  providers: [
    BootstrapOwnerService,
    CreateRoleService,
    UpdateRoleService,
    ArchiveRoleService,
    ListRolesService,
    AssignRoleService,
    ListMembersService,
    SignUpService,
    ListMyBrandsService,
    CreateMyBrandService,
    CheckBrandSlugAvailabilityService,
    SetActiveBrandService,
    SetActiveLocationService,
    { provide: TENANT_LOOKUP_PORT, useClass: TenantLookupAdapter },
    TenantLookupAdapter,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: BrandScopeGuard },
    { provide: APP_GUARD, useClass: LocationScopeGuard },
    { provide: MEMBER_BRAND_SCOPE_READER, useClass: MemberBrandScopeDrizzleReader },
    MemberBrandScopeDrizzleReader,
    { provide: MEMBER_LOCATION_SCOPE_READER, useClass: MemberLocationScopeDrizzleReader },
    MemberLocationScopeDrizzleReader,
    { provide: SESSION_ACTIVE_BRAND_WRITER, useClass: BetterAuthSessionActiveBrandWriter },
    BetterAuthSessionActiveBrandWriter,
    { provide: SESSION_ACTIVE_LOCATION_WRITER, useClass: BetterAuthSessionActiveLocationWriter },
    BetterAuthSessionActiveLocationWriter,
    { provide: BA_USER_READER, useClass: BaUserDrizzleReader },
    BaUserDrizzleReader,
    { provide: TENANT_PROVISIONING_PORT, useClass: TenantProvisioningAdapter },
    TenantProvisioningAdapter,
    { provide: BRAND_PROVISIONING_PORT, useClass: BrandProvisioningAdapter },
    BrandProvisioningAdapter,
    BrandSlugRateLimitGuard,
  ],
})
export class IdentityHttpModule implements OnModuleInit {
  constructor(
    @Inject(HttpAdapterHost) private readonly httpHost: HttpAdapterHost,
    @Inject(AUTH_TOKEN) private readonly auth: Auth,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    const fastify: FastifyInstance = this.httpHost.httpAdapter.getInstance();
    registerBetterAuthHandler(
      fastify,
      this.auth,
      this.env.BETTER_AUTH_BASE_URL ?? 'http://localhost:4000',
    );
  }
}
