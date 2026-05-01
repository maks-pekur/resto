/**
 * Identity bounded-context errors.
 *
 * Translated to HTTP exceptions by the AuthGuard/RolesGuard themselves
 * (UnauthorizedException / ForbiddenException), so callers do not need
 * a per-context filter.
 */

export class InvalidTokenError extends Error {
  constructor(
    message: string,
    public readonly underlying?: unknown,
  ) {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

export class TenantMismatchError extends Error {
  constructor(
    public readonly tokenTenant: string,
    public readonly resolvedTenant: string,
  ) {
    super(
      `Token tenant "${tokenTenant}" does not match the resolved request tenant "${resolvedTenant}".`,
    );
    this.name = 'TenantMismatchError';
  }
}

export class InsufficientRoleError extends Error {
  constructor(
    public readonly required: readonly string[],
    public readonly actual: readonly string[],
  ) {
    super(
      `Insufficient role: required one of [${required.join(', ')}], have [${actual.join(', ')}].`,
    );
    this.name = 'InsufficientRoleError';
  }
}
