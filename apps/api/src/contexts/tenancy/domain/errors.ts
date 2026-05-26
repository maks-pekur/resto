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
