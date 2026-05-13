import { describe, expect, it } from 'vitest';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { mapIdentityError } from '../../../src/contexts/identity/interfaces/http/error-mapping';
import {
  BetterAuthBootstrapFailureError,
  OwnerAlreadyExistsError,
  TenantNotFoundForBootstrapError,
  WeakPasswordError,
} from '../../../src/contexts/identity/domain/bootstrap-errors';
import {
  NoActiveTenantError,
  PrincipalKindMismatchError,
  TenantMismatchError,
} from '../../../src/contexts/identity/domain/errors';
import {
  SignupBetterAuthFailureError,
  SignupEmailAlreadyExistsError,
  SlugUnavailableError,
} from '../../../src/contexts/identity/domain/signup-errors';

const codeOf = (err: unknown): string | undefined => {
  if (!(err instanceof HttpException)) return undefined;
  const body = err.getResponse() as { code?: string };
  return body.code;
};

describe('mapIdentityError', () => {
  it('maps SignupEmailAlreadyExistsError to 409 signup.email_taken', () => {
    const mapped = mapIdentityError(new SignupEmailAlreadyExistsError('a@b.c'));
    expect(mapped).toBeInstanceOf(ConflictException);
    expect(codeOf(mapped)).toBe('signup.email_taken');
  });

  it('maps SlugUnavailableError to 409 signup.slug_unavailable', () => {
    const mapped = mapIdentityError(new SlugUnavailableError('cafe'));
    expect(mapped).toBeInstanceOf(ConflictException);
    expect(codeOf(mapped)).toBe('signup.slug_unavailable');
  });

  it.each([
    ['signUpEmail', 'signup.signup_failed'],
    ['signInEmail', 'signup.signin_failed'],
    ['addMember', 'signup.add_member_failed'],
  ] as const)('maps SignupBetterAuthFailureError(%s) to 400 %s', (stage, code) => {
    const mapped = mapIdentityError(new SignupBetterAuthFailureError(stage, new Error('upstream')));
    expect(mapped).toBeInstanceOf(BadRequestException);
    expect(codeOf(mapped)).toBe(code);
  });

  it('maps TenantNotFoundForBootstrapError to 404', () => {
    const mapped = mapIdentityError(new TenantNotFoundForBootstrapError('id'));
    expect(mapped).toBeInstanceOf(NotFoundException);
    expect(codeOf(mapped)).toBe('bootstrap.tenant_not_found');
  });

  it('maps OwnerAlreadyExistsError to 409', () => {
    const mapped = mapIdentityError(new OwnerAlreadyExistsError('tid', 'a@b.c'));
    expect(mapped).toBeInstanceOf(ConflictException);
    expect(codeOf(mapped)).toBe('bootstrap.owner_already_exists');
  });

  it('maps WeakPasswordError to 400', () => {
    const mapped = mapIdentityError(new WeakPasswordError('too short'));
    expect(mapped).toBeInstanceOf(BadRequestException);
    expect(codeOf(mapped)).toBe('bootstrap.weak_password');
  });

  it('maps BetterAuthBootstrapFailureError to 502', () => {
    const mapped = mapIdentityError(
      new BetterAuthBootstrapFailureError('signUpEmail', new Error('boom')),
    );
    expect(mapped).toBeInstanceOf(BadGatewayException);
    expect(codeOf(mapped)).toBe('bootstrap.failed');
  });

  it.each([
    ['TenantMismatchError', () => new TenantMismatchError()],
    ['PrincipalKindMismatchError', () => new PrincipalKindMismatchError('operator', 'customer')],
    ['NoActiveTenantError', () => new NoActiveTenantError()],
  ])('maps %s to 403', (_label, build) => {
    const mapped = mapIdentityError(build());
    expect(mapped).toBeInstanceOf(ForbiddenException);
  });

  it('passes unknown errors through unchanged', () => {
    const err = new Error('boom');
    expect(mapIdentityError(err)).toBe(err);
  });
});
