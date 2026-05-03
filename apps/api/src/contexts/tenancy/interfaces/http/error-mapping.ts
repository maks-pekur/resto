import { ConflictException, NotFoundException, type HttpException } from '@nestjs/common';
import {
  TenantAlreadyArchivedError,
  TenantNotFoundError,
  TenantSlugArchivedError,
  TenantSlugTakenError,
} from '../../domain/errors';

/**
 * Translate domain errors into HTTP exceptions. Domain code throws
 * framework-agnostic `Error` subclasses; the HTTP layer maps them so
 * the global `ProblemDetailsFilter` emits the right status code and
 * `type` URL.
 */
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
  return err;
};
// Re-export for legacy imports: HttpException is part of the union
// returned by `mapDomainError` even though TS narrows it to `unknown`.
export type { HttpException };
