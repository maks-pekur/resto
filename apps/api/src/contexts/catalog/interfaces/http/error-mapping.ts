import { NotFoundException } from '@nestjs/common';
import { MenuCategoryNotFoundError, MenuItemNotFoundError } from '../../domain/errors';

export const mapCatalogError = (err: unknown): unknown => {
  if (err instanceof MenuItemNotFoundError) {
    return new NotFoundException({
      code: 'catalog.menu_item_not_found',
      message: err.message,
    });
  }
  if (err instanceof MenuCategoryNotFoundError) {
    return new NotFoundException({
      code: 'catalog.menu_category_not_found',
      message: err.message,
    });
  }
  return err;
};
