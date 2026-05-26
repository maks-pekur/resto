import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  type HttpException,
} from '@nestjs/common';
import {
  TenantAlreadyArchivedError,
  TenantAlreadySuspendedError,
  TenantErasureTooEarlyError,
  TenantNotFoundError,
  TenantNotSuspendedError,
  TenantOffboardingCoolOffExpiredError,
  TenantOffboardingNotAllowedError,
  TenantSlugArchivedError,
  TenantSlugTakenError,
  TenantSuspendedError,
  TenantSuspensionNotAllowedError,
} from '../../domain/errors';

export const mapDomainError = (err: unknown): unknown => {
  if (err instanceof TenantNotFoundError) {
    return new NotFoundException({
      code: 'tenancy.tenant_not_found',
      message: err.message,
    });
  }
  if (err instanceof TenantSlugTakenError) {
    return new ConflictException(err.message);
  }
  if (err instanceof TenantSlugArchivedError) {
    return new ConflictException(err.message);
  }
  if (err instanceof TenantAlreadyArchivedError) {
    return new ConflictException(err.message);
  }
  if (err instanceof TenantOffboardingNotAllowedError) {
    return new ConflictException(err.message);
  }
  if (err instanceof TenantOffboardingCoolOffExpiredError) {
    return new ConflictException(err.message);
  }
  if (err instanceof TenantErasureTooEarlyError) {
    return new ConflictException(err.message);
  }
  // OQ-1: 403 for recoverable suspensions; 410 reserved for fully-erased tenants
  // (TODO: TEN-erased → 410 when erasure UX ships).
  if (err instanceof TenantSuspendedError) {
    return new ForbiddenException({
      code: 'tenancy.tenant_suspended',
      message: 'Tenant is suspended.',
    });
  }
  if (err instanceof TenantAlreadySuspendedError) {
    return new ConflictException({
      code: 'tenancy.tenant_already_suspended',
      message: err.message,
    });
  }
  if (err instanceof TenantNotSuspendedError) {
    return new ConflictException({
      code: 'tenancy.tenant_not_suspended',
      message: err.message,
    });
  }
  if (err instanceof TenantSuspensionNotAllowedError) {
    return new ConflictException({
      code: 'tenancy.tenant_suspension_not_allowed',
      message: err.message,
    });
  }
  return err;
};

export type { HttpException };
