import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  NoActiveTenantError,
  PrincipalKindMismatchError,
  TenantMismatchError,
} from '../../domain/errors';
import {
  BetterAuthBootstrapFailureError,
  OwnerAlreadyExistsError,
  TenantNotFoundForBootstrapError,
  WeakPasswordError,
} from '../../domain/bootstrap-errors';

/**
 * Identity → HTTP error mapping.
 *
 * The body's `code` field gives clients a stable URI suffix
 * (`auth.tenant_mismatch`, `bootstrap.weak_password`, …) that the
 * `ProblemDetailsFilter` turns into the `type` URI. Every controller
 * in this context wraps its work in `wrap()` (defined per-controller)
 * so the rest of the surface keeps throwing plain domain errors.
 */
export const mapIdentityError = (err: unknown): unknown => {
  // Bootstrap-flow errors
  if (err instanceof TenantNotFoundForBootstrapError) {
    return new NotFoundException({ code: 'bootstrap.tenant_not_found', message: err.message });
  }
  if (err instanceof OwnerAlreadyExistsError) {
    return new ConflictException({ code: 'bootstrap.owner_already_exists', message: err.message });
  }
  if (err instanceof WeakPasswordError) {
    return new BadRequestException({ code: 'bootstrap.weak_password', message: err.message });
  }
  if (err instanceof BetterAuthBootstrapFailureError) {
    return new BadGatewayException({ code: 'bootstrap.failed', message: err.message });
  }

  // Auth-context errors (re-mapped from the existing IdentityDomainError tree)
  if (err instanceof TenantMismatchError) {
    return new ForbiddenException({ code: err.code, message: err.message });
  }
  if (err instanceof PrincipalKindMismatchError) {
    return new ForbiddenException({ code: err.code, message: err.message });
  }
  if (err instanceof NoActiveTenantError) {
    return new ForbiddenException({ code: err.code, message: err.message });
  }

  return err;
};
