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
import { AssignLocationRoleService } from './application/assign-location-role.service';
import { ListMemberLocationRolesService } from './application/list-member-location-roles.service';
import { ListMembersService } from './application/list-members.service';
import { RolesController } from './interfaces/http/roles.controller';
import { MemberRolesController } from './interfaces/http/member-roles.controller';
import { MemberLocationRolesController } from './interfaces/http/member-location-roles.controller';
import { TENANT_LOOKUP_PORT } from './application/ports/tenant-lookup.port';
import { TenantLookupAdapter } from './infrastructure/tenant-lookup.adapter';
import { AuthGuard } from './interfaces/http/guards/auth.guard';
import { TenantSlugRateLimitGuard } from './interfaces/http/guards/tenant-slug-rate-limit.guard';
import { PermissionsGuard } from './interfaces/http/guards/permissions.guard';
import { registerBetterAuthHandler } from './interfaces/http/better-auth.handler';
import { MeController } from './interfaces/http/me.controller';
import { InternalBootstrapController } from './interfaces/http/internal-bootstrap.controller';
import { SignUpController } from './interfaces/http/signup.controller';
import { SignUpService } from './application/signup.service';
import { FinalizeTenantSetupService } from './application/finalize-tenant-setup.service';
import { ListMyTenantsService } from './application/list-my-tenants.service';
import { CheckTenantSlugAvailabilityService } from './application/check-tenant-slug-availability.service';
import { SetActiveLocationService } from './application/set-active-location.service';
import { MeTenantsController } from './interfaces/http/me-tenants.controller';
import { SetActiveLocationController } from './interfaces/http/set-active-location.controller';
import { LocationScopeGuard } from './interfaces/http/guards/location-scope.guard';
import { OwnerOnlyGuard } from './interfaces/http/guards/owner-only.guard';
import { MEMBER_LOCATION_SCOPE_READER } from './application/ports/member-location-scope-reader.port';
import { MemberLocationScopeDrizzleReader } from './infrastructure/member-location-scope-drizzle.reader';
import { SESSION_ACTIVE_LOCATION_WRITER } from './application/ports/session-active-location-writer.port';
import { BetterAuthSessionActiveLocationWriter } from './infrastructure/better-auth/session-active-location.adapter';
import { BA_USER_READER } from './application/ports/ba-user-reader.port';
import { BaUserDrizzleReader } from './infrastructure/ba-user-drizzle.reader';
import { TENANT_PROVISIONING_PORT } from './application/ports/tenant-provisioning.port';
import { TenantProvisioningAdapter } from './infrastructure/tenant-provisioning.adapter';

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
    MeTenantsController,
    SetActiveLocationController,
    InternalBootstrapController,
    SignUpController,
    RolesController,
    MemberRolesController,
    MemberLocationRolesController,
  ],
  providers: [
    BootstrapOwnerService,
    CreateRoleService,
    UpdateRoleService,
    ArchiveRoleService,
    ListRolesService,
    AssignRoleService,
    AssignLocationRoleService,
    ListMemberLocationRolesService,
    ListMembersService,
    SignUpService,
    FinalizeTenantSetupService,
    ListMyTenantsService,
    CheckTenantSlugAvailabilityService,
    SetActiveLocationService,
    { provide: TENANT_LOOKUP_PORT, useClass: TenantLookupAdapter },
    TenantLookupAdapter,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: LocationScopeGuard },
    { provide: APP_GUARD, useClass: OwnerOnlyGuard },
    { provide: MEMBER_LOCATION_SCOPE_READER, useClass: MemberLocationScopeDrizzleReader },
    MemberLocationScopeDrizzleReader,
    { provide: SESSION_ACTIVE_LOCATION_WRITER, useClass: BetterAuthSessionActiveLocationWriter },
    BetterAuthSessionActiveLocationWriter,
    { provide: BA_USER_READER, useClass: BaUserDrizzleReader },
    BaUserDrizzleReader,
    { provide: TENANT_PROVISIONING_PORT, useClass: TenantProvisioningAdapter },
    TenantProvisioningAdapter,
    TenantSlugRateLimitGuard,
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
