import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  type HttpException,
} from '@nestjs/common';
import {
  LocationAlreadyArchivedError,
  LocationNotFoundError,
  LocationTableLimitReachedError,
  RestaurantTableAlreadyArchivedError,
  RestaurantTableNotFoundError,
  StripeOnboardingFailedError,
  TableBulkLimitExceededError,
  TableNumberTakenError,
  TableZoneAlreadyArchivedError,
  TableZoneNotFoundError,
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

const PG_UNIQUE_VIOLATION = '23505';
const RESTAURANT_TABLE_NUMBER_CONSTRAINT = 'restaurant_tables_zone_number_active_uq';

// A race on the partial unique index reaches here as a raw driver error, not TableNumberTakenError;
// unmapped it would be redacted to an unactionable 5xx by ProblemDetailsFilter.
const isTableNumberUniqueViolation = (err: unknown): boolean => {
  const seen = new Set<unknown>();
  let cur: unknown = err;
  while (typeof cur === 'object' && cur !== null && !seen.has(cur)) {
    seen.add(cur);
    const e = cur as {
      code?: string;
      constraint_name?: string;
      constraint?: string;
      cause?: unknown;
    };
    if (e.code === PG_UNIQUE_VIOLATION) {
      const constraint = e.constraint_name ?? e.constraint;
      if (constraint === RESTAURANT_TABLE_NUMBER_CONSTRAINT) return true;
    }
    cur = e.cause;
  }
  return false;
};

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
  if (err instanceof LocationNotFoundError) {
    return new NotFoundException({
      code: 'tenancy.location_not_found',
      message: err.message,
    });
  }
  if (err instanceof LocationAlreadyArchivedError) {
    return new ConflictException({
      code: 'tenancy.location_already_archived',
      message: err.message,
    });
  }
  if (err instanceof StripeOnboardingFailedError) {
    return new BadGatewayException({
      code: 'tenancy.stripe_onboarding_failed',
      message: err.message,
    });
  }
  if (err instanceof TableZoneNotFoundError) {
    return new NotFoundException({
      code: 'tenancy.table_zone_not_found',
      message: err.message,
    });
  }
  if (err instanceof RestaurantTableNotFoundError) {
    return new NotFoundException({
      code: 'tenancy.table_not_found',
      message: err.message,
    });
  }
  if (err instanceof TableZoneAlreadyArchivedError) {
    return new ConflictException({
      code: 'tenancy.table_zone_already_archived',
      message: err.message,
    });
  }
  if (err instanceof RestaurantTableAlreadyArchivedError) {
    return new ConflictException({
      code: 'tenancy.table_already_archived',
      message: err.message,
    });
  }
  if (err instanceof TableNumberTakenError) {
    return new ConflictException({
      code: 'tenancy.table_number_taken',
      message: err.message,
    });
  }
  if (err instanceof TableBulkLimitExceededError) {
    return new BadRequestException({
      code: 'tenancy.table_bulk_limit_exceeded',
      message: err.message,
    });
  }
  if (err instanceof LocationTableLimitReachedError) {
    return new BadRequestException({
      code: 'tenancy.location_table_limit_reached',
      message: err.message,
    });
  }
  if (isTableNumberUniqueViolation(err)) {
    return new ConflictException({
      code: 'tenancy.table_number_taken',
      message: 'Table number is already in use in this zone.',
    });
  }
  return err;
};

export type { HttpException };
