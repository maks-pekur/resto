/**
 * Catalog bounded-context errors. Translated to HTTP exceptions at the
 * controller layer (NotFound / Conflict).
 */
export class MenuItemNotFoundError extends Error {
  constructor(public readonly itemId: string) {
    super(`Menu item "${itemId}" was not found.`);
    this.name = 'MenuItemNotFoundError';
  }
}

export class MenuCategoryNotFoundError extends Error {
  constructor(public readonly categoryId: string) {
    super(`Menu category "${categoryId}" was not found.`);
    this.name = 'MenuCategoryNotFoundError';
  }
}

export class CatalogPublishConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogPublishConflictError';
  }
}
