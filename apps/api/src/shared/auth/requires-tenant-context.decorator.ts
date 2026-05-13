import { SetMetadata } from '@nestjs/common';

export const REQUIRES_TENANT_CONTEXT_KEY = 'identity:requires_tenant_context';

export const RequiresTenantContext = (): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRES_TENANT_CONTEXT_KEY, true);
