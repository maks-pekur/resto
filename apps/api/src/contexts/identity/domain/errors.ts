/**
 * Domain errors raised by the identity context. The shared exception
 * filter maps them to HTTP responses with stable body codes.
 */
export class IdentityDomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class TenantMismatchError extends IdentityDomainError {
  constructor() {
    super('auth.tenant_mismatch', 'Principal tenant does not match request tenant.');
  }
}

export class PrincipalKindMismatchError extends IdentityDomainError {
  constructor(expected: 'operator' | 'customer', actual: string) {
    super(
      'auth.principal_kind_mismatch',
      `Endpoint requires ${expected} principal; got ${actual}.`,
    );
  }
}

export class NoActiveTenantError extends IdentityDomainError {
  constructor() {
    super('auth.no_active_tenant', 'Operator principal has no active tenant membership.');
  }
}
