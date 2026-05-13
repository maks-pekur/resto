import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  BetterAuthBootstrapFailureError,
  OwnerAlreadyExistsError,
  TenantNotFoundForBootstrapError,
  WeakPasswordError,
} from '../../domain/bootstrap-errors';
import {
  NoActiveTenantError,
  PrincipalKindMismatchError,
  TenantMismatchError,
} from '../../domain/errors';
import {
  SignupBetterAuthFailureError,
  SignupEmailAlreadyExistsError,
  SlugUnavailableError,
} from '../../domain/signup-errors';

const SIGNUP_FAILURE_CODE: Record<SignupBetterAuthFailureError['stage'], string> = {
  signUpEmail: 'signup.signup_failed',
  signInEmail: 'signup.signin_failed',
  addMember: 'signup.add_member_failed',
};

export const mapIdentityError = (err: unknown): unknown => {
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

  if (err instanceof SignupEmailAlreadyExistsError) {
    return new ConflictException({ code: 'signup.email_taken', message: err.message });
  }
  if (err instanceof SlugUnavailableError) {
    return new ConflictException({ code: 'signup.slug_unavailable', message: err.message });
  }
  if (err instanceof SignupBetterAuthFailureError) {
    return new BadRequestException({
      code: SIGNUP_FAILURE_CODE[err.stage],
      message: 'Sign-up could not be completed; please try again or sign in.',
    });
  }

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
