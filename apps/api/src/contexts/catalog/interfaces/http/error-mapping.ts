import { ConflictException, NotFoundException, type HttpException } from '@nestjs/common';
import {
  CatalogPublishConflictError,
  MenuCategoryNotFoundError,
  MenuItemNotFoundError,
  type CatalogDomainError,
} from '../../domain/errors';

const isCatalogDomainError = (err: unknown): err is CatalogDomainError =>
  err instanceof MenuItemNotFoundError ||
  err instanceof MenuCategoryNotFoundError ||
  err instanceof CatalogPublishConflictError;

const mapKnown = (err: CatalogDomainError): HttpException => {
  switch (err.kind) {
    case 'MenuItemNotFoundError':
      return new NotFoundException({
        code: 'catalog.menu_item_not_found',
        message: err.message,
      });
    case 'MenuCategoryNotFoundError':
      return new NotFoundException({
        code: 'catalog.menu_category_not_found',
        message: err.message,
      });
    case 'CatalogPublishConflictError':
      return new ConflictException({
        code: 'catalog.publish_conflict',
        message: err.message,
      });
    default: {
      const exhaustive: never = err;
      return exhaustive;
    }
  }
};

export const mapCatalogError = (err: unknown): unknown =>
  isCatalogDomainError(err) ? mapKnown(err) : err;
