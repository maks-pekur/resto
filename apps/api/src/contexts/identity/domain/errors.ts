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

export class LocationOutOfScopeError extends IdentityDomainError {
  constructor() {
    super('location.out_of_scope', 'Location is not within the operator scope.');
  }
}

export class RoleOccupiedError extends IdentityDomainError {
  constructor(roleSlug: string, memberCount: number) {
    super(
      'role.occupied',
      `Role "${roleSlug}" has ${memberCount.toString()} assigned member(s) and cannot be archived.`,
    );
  }
}

export class RoleNotFoundError extends IdentityDomainError {
  constructor(roleSlug: string) {
    super('role.not_found', `Role "${roleSlug}" not found.`);
  }
}

export class RoleNameReservedError extends IdentityDomainError {
  constructor(name: string) {
    super('role.name_reserved', `"${name}" is a system role name and cannot be used.`);
  }
}

export class InsufficientPermissionsToMintError extends IdentityDomainError {
  constructor() {
    super('role.insufficient_permissions', 'You cannot grant permissions you do not hold.');
  }
}

export class SelfRoleAssignmentError extends IdentityDomainError {
  constructor() {
    super('role.self_assignment', 'You cannot assign a role to yourself.');
  }
}

export class AssignmentExceedsAuthorityError extends IdentityDomainError {
  constructor() {
    super(
      'role.assignment_exceeds_authority',
      'The target role contains permissions you do not hold.',
    );
  }
}
