import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  type HttpException,
} from '@nestjs/common';
import {
  CatalogPublishConflictError,
  CategoryNestingDepthError,
  MenuCategoryAlreadyArchivedError,
  MenuCategoryNotFoundError,
  MenuItemAlreadyArchivedError,
  MenuItemNotFoundError,
  MenuItemSizeNotFoundError,
  MenuModifierGroupNotFoundError,
  StopListItemNotFoundError,
  type CatalogDomainError,
} from '../../domain/errors';

const isCatalogDomainError = (err: unknown): err is CatalogDomainError =>
  err instanceof MenuItemNotFoundError ||
  err instanceof MenuCategoryNotFoundError ||
  err instanceof CatalogPublishConflictError ||
  err instanceof MenuModifierGroupNotFoundError ||
  err instanceof MenuItemSizeNotFoundError ||
  err instanceof StopListItemNotFoundError ||
  err instanceof MenuCategoryAlreadyArchivedError ||
  err instanceof MenuItemAlreadyArchivedError ||
  err instanceof CategoryNestingDepthError;

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
    case 'MenuModifierGroupNotFoundError':
      return new NotFoundException({
        code: 'catalog.modifier_group_not_found',
        message: err.message,
      });
    case 'MenuItemSizeNotFoundError':
      return new NotFoundException({
        code: 'catalog.item_size_not_found',
        message: err.message,
      });
    case 'StopListItemNotFoundError':
      return new NotFoundException({
        code: 'catalog.stop_list_item_not_found',
        message: err.message,
      });
    case 'MenuCategoryAlreadyArchivedError':
      return new ConflictException({
        code: 'catalog.menu_category_already_archived',
        message: err.message,
      });
    case 'MenuItemAlreadyArchivedError':
      return new ConflictException({
        code: 'catalog.menu_item_already_archived',
        message: err.message,
      });
    case 'CategoryNestingDepthError':
      return new BadRequestException({
        code: 'catalog.category_nesting_depth',
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
