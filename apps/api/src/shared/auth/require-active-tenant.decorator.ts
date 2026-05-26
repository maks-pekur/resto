import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { RequireActiveTenantGuard } from './require-active-tenant.guard';

export const REQUIRE_ACTIVE_TENANT = 'tenancy:require_active_tenant';

export const RequireActiveTenant = (): ReturnType<typeof applyDecorators> =>
  applyDecorators(SetMetadata(REQUIRE_ACTIVE_TENANT, true), UseGuards(RequireActiveTenantGuard));
