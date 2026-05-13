import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  CatalogPublishConflictError,
  MenuCategoryNotFoundError,
  MenuItemNotFoundError,
} from '../../../src/contexts/catalog/domain/errors';
import { mapCatalogError } from '../../../src/contexts/catalog/interfaces/http/error-mapping';

describe('mapCatalogError', () => {
  it('maps MenuItemNotFoundError to 404 with code catalog.menu_item_not_found', () => {
    const mapped = mapCatalogError(new MenuItemNotFoundError('some-id'));
    expect(mapped).toBeInstanceOf(NotFoundException);
    expect((mapped as NotFoundException).getResponse()).toMatchObject({
      code: 'catalog.menu_item_not_found',
    });
  });

  it('maps MenuCategoryNotFoundError to 404 with code catalog.menu_category_not_found', () => {
    const mapped = mapCatalogError(new MenuCategoryNotFoundError('some-id'));
    expect(mapped).toBeInstanceOf(NotFoundException);
    expect((mapped as NotFoundException).getResponse()).toMatchObject({
      code: 'catalog.menu_category_not_found',
    });
  });

  it('maps CatalogPublishConflictError to 409 with code catalog.publish_conflict', () => {
    const mapped = mapCatalogError(new CatalogPublishConflictError('version contention'));
    expect(mapped).toBeInstanceOf(ConflictException);
    expect((mapped as ConflictException).getResponse()).toMatchObject({
      code: 'catalog.publish_conflict',
      message: 'version contention',
    });
  });

  it('passes through unknown errors unchanged', () => {
    const err = new Error('something else');
    expect(mapCatalogError(err)).toBe(err);
  });
});
