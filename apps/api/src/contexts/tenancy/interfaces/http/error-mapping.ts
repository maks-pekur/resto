import { ConflictException, NotFoundException, type HttpException } from '@nestjs/common';
import {
  TenantAlreadyArchivedError,
  TenantErasureTooEarlyError,
  TenantNotFoundError,
  TenantOffboardingCoolOffExpiredError,
  TenantOffboardingNotAllowedError,
  TenantSlugArchivedError,
  TenantSlugTakenError,
} from '../../domain/errors';

export const mapDomainError = (err: unknown): unknown => {
  if (err instanceof TenantNotFoundError) {
    return new NotFoundException(err.message);
  }
  if (err instanceof TenantSlugTakenError) {
    return new ConflictException(err.message);
  }
  if (err instanceof TenantSlugArchivedError) {
    return new ConflictException(err.message);
  }
  if (err instanceof TenantAlreadyArchivedError) {
    return new ConflictException(err.message);
  }
  if (err instanceof TenantOffboardingNotAllowedError) {
    return new ConflictException(err.message);
  }
  if (err instanceof TenantOffboardingCoolOffExpiredError) {
    return new ConflictException(err.message);
  }
  if (err instanceof TenantErasureTooEarlyError) {
    return new ConflictException(err.message);
  }
  return err;
};

export type { HttpException };
