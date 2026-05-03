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
