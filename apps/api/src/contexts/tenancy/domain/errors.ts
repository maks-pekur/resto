/**
 * Tenancy bounded-context errors.
 *
 * Each is a regular `Error` subclass; the HTTP interface translates them
 * into RFC 7807 problems via the global `ProblemDetailsFilter`.
 */

export class TenantSlugTakenError extends Error {
  constructor(public readonly slug: string) {
    super(`Tenant slug "${slug}" is already in use.`);
    this.name = 'TenantSlugTakenError';
  }
}

export class TenantNotFoundError extends Error {
  constructor(public readonly identifier: string) {
    super(`Tenant "${identifier}" was not found.`);
    this.name = 'TenantNotFoundError';
  }
}

export class TenantAlreadyArchivedError extends Error {
  constructor(public readonly tenantId: string) {
    super(`Tenant "${tenantId}" is already archived.`);
    this.name = 'TenantAlreadyArchivedError';
  }
}

/**
 * Thrown when `provisionTenant` is called for a slug that already maps to
 * an archived tenant. Re-provisioning is policy-deferred — operators must
 * pick a different slug or run an explicit reactivation flow (future).
 */
export class TenantSlugArchivedError extends Error {
  constructor(public readonly slug: string) {
    super(
      `Tenant slug "${slug}" is archived. Choose a different slug or reactivate the existing tenant.`,
    );
    this.name = 'TenantSlugArchivedError';
  }
}

export class TenantSetupNotPendingError extends Error {
  constructor(public readonly tenantId: string) {
    super(`Tenant "${tenantId}" is not pending setup; onboarding cannot be finalized again.`);
    this.name = 'TenantSetupNotPendingError';
  }
}

export class TenantOffboardingNotAllowedError extends Error {
  constructor(
    public readonly tenantId: string,
    public readonly currentStatus: string,
  ) {
    super(`Tenant "${tenantId}" cannot be offboarded from status "${currentStatus}".`);
    this.name = 'TenantOffboardingNotAllowedError';
  }
}

export class TenantOffboardingCoolOffExpiredError extends Error {
  constructor(public readonly tenantId: string) {
    super(
      `Cool-off window has expired for tenant "${tenantId}"; cancellation is no longer possible.`,
    );
    this.name = 'TenantOffboardingCoolOffExpiredError';
  }
}

export class TenantErasureTooEarlyError extends Error {
  constructor(public readonly tenantId: string) {
    super(`Tenant "${tenantId}" cool-off has not yet expired; erasure cannot be executed.`);
    this.name = 'TenantErasureTooEarlyError';
  }
}

export class TenantSuspendedError extends Error {
  constructor(public readonly tenantId: string) {
    super(`Tenant "${tenantId}" is suspended.`);
    this.name = 'TenantSuspendedError';
  }
}

export class TenantAlreadySuspendedError extends Error {
  constructor(public readonly tenantId: string) {
    super(`Tenant "${tenantId}" is already suspended.`);
    this.name = 'TenantAlreadySuspendedError';
  }
}

export class TenantNotSuspendedError extends Error {
  constructor(
    public readonly tenantId: string,
    public readonly currentStatus: string,
  ) {
    super(`Tenant "${tenantId}" is not suspended (current status: "${currentStatus}").`);
    this.name = 'TenantNotSuspendedError';
  }
}

export class TenantSuspensionNotAllowedError extends Error {
  constructor(
    public readonly tenantId: string,
    public readonly currentStatus: string,
  ) {
    super(`Tenant "${tenantId}" cannot be suspended from status "${currentStatus}".`);
    this.name = 'TenantSuspensionNotAllowedError';
  }
}

export class LocationNotFoundError extends Error {
  constructor(public readonly identifier: string) {
    super(`Location "${identifier}" was not found.`);
    this.name = 'LocationNotFoundError';
  }
}

export class LocationAlreadyArchivedError extends Error {
  constructor(public readonly locationId: string) {
    super(`Location "${locationId}" is already archived.`);
    this.name = 'LocationAlreadyArchivedError';
  }
}

export class LocationHasOrdersError extends Error {
  readonly kind = 'LocationHasOrdersError' as const;
  constructor(public readonly locationId: string) {
    super(`Location "${locationId}" has orders and cannot be deleted — archive it instead.`);
    this.name = 'LocationHasOrdersError';
  }
}

export class LocationNotArchivedError extends Error {
  readonly kind = 'LocationNotArchivedError' as const;
  constructor(public readonly locationId: string) {
    super(`Location "${locationId}" is not archived, so it cannot be restored.`);
    this.name = 'LocationNotArchivedError';
  }
}

export class StripeOnboardingFailedError extends Error {
  constructor(
    public readonly tenantId: string,
    cause?: Error,
  ) {
    super(`Stripe onboarding failed for tenant "${tenantId}".`);
    this.name = 'StripeOnboardingFailedError';
    if (cause !== undefined) this.cause = cause;
  }
}

export class LocationNameNotSluggableError extends Error {
  constructor(public readonly locationName: string) {
    super(
      `Location name "${locationName}" produces no usable slug. Names written entirely in punctuation or ` +
        'symbols cannot become a URL — use letters or digits in at least one word.',
    );
    this.name = 'LocationNameNotSluggableError';
  }
}

export class TableZoneNotFoundError extends Error {
  constructor(public readonly identifier: string) {
    super(`Table zone "${identifier}" was not found.`);
    this.name = 'TableZoneNotFoundError';
  }
}

export class TableZoneAlreadyArchivedError extends Error {
  constructor(public readonly zoneId: string) {
    super(`Table zone "${zoneId}" is already archived.`);
    this.name = 'TableZoneAlreadyArchivedError';
  }
}

export class RestaurantTableNotFoundError extends Error {
  constructor(public readonly identifier: string) {
    super(`Table "${identifier}" was not found.`);
    this.name = 'RestaurantTableNotFoundError';
  }
}

export class RestaurantTableAlreadyArchivedError extends Error {
  constructor(public readonly tableId: string) {
    super(`Table "${tableId}" is already archived.`);
    this.name = 'RestaurantTableAlreadyArchivedError';
  }
}

export class TableNumberTakenError extends Error {
  constructor(
    public readonly zoneId: string,
    public readonly number: string,
  ) {
    super(`Table number "${number}" is already in use in zone "${zoneId}".`);
    this.name = 'TableNumberTakenError';
  }
}

export class TableBulkLimitExceededError extends Error {
  constructor(
    public readonly requestedCount: number,
    public readonly cap: number,
  ) {
    super(`Requested ${requestedCount} tables in one batch, which exceeds the cap of ${cap}.`);
    this.name = 'TableBulkLimitExceededError';
  }
}

export class LocationTableLimitReachedError extends Error {
  constructor(
    public readonly locationId: string,
    public readonly cap: number,
  ) {
    super(`Location "${locationId}" has reached its active-table cap of ${cap}.`);
    this.name = 'LocationTableLimitReachedError';
  }
}

export class DefaultLocaleNotSupportedError extends Error {
  readonly kind = 'DefaultLocaleNotSupportedError' as const;
  constructor(public readonly locale: string) {
    super(`Default locale "${locale}" must be one of the tenant's content languages.`);
    this.name = 'DefaultLocaleNotSupportedError';
  }
}

export class BrandLogoNotOwnedError extends Error {
  readonly kind = 'BrandLogoNotOwnedError' as const;
  constructor(public readonly tenantId: string) {
    super(`Logo key does not belong to tenant "${tenantId}".`);
    this.name = 'BrandLogoNotOwnedError';
  }
}
