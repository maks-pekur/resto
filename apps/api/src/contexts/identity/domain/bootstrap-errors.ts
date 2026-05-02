/**
 * Errors raised by the BootstrapOwnerService.
 *
 * Kept as standalone classes (rather than extending IdentityDomainError)
 * so the CLI's exit-code mapper (Task 12) can do plain `instanceof` checks
 * against each shape without parsing a string code.
 */
export class TenantNotFoundForBootstrapError extends Error {
  readonly code = 'tenant_not_found' as const;
  constructor(public readonly tenantSlug: string) {
    super(`Tenant "${tenantSlug}" not found.`);
    this.name = 'TenantNotFoundForBootstrapError';
  }
}

export class OwnerAlreadyExistsError extends Error {
  readonly code = 'owner_already_exists' as const;
  constructor(
    public readonly tenantId: string,
    public readonly existingEmail: string,
  ) {
    super(`Tenant ${tenantId} already has owner ${existingEmail}.`);
    this.name = 'OwnerAlreadyExistsError';
  }
}

export class WeakPasswordError extends Error {
  readonly code = 'weak_password' as const;
  constructor(message: string) {
    super(message);
    this.name = 'WeakPasswordError';
  }
}

export class BetterAuthBootstrapFailureError extends Error {
  readonly code = 'bootstrap_failed' as const;
  constructor(stage: string, cause: unknown) {
    super(
      `Bootstrap failed at stage "${stage}": ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.name = 'BetterAuthBootstrapFailureError';
  }
}
