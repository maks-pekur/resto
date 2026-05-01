import { NotFoundException } from '@nestjs/common';
import { MenuCategoryNotFoundError, MenuItemNotFoundError } from '../../domain/errors';

/**
 * Translate catalog domain errors into HTTP exceptions. The global
 * `ProblemDetailsFilter` renders them as RFC 7807.
 */
export const mapCatalogError = (err: unknown): unknown => {
  if (err instanceof MenuItemNotFoundError) {
    return new NotFoundException(err.message);
  }
  if (err instanceof MenuCategoryNotFoundError) {
    return new NotFoundException(err.message);
  }
  return err;
};
