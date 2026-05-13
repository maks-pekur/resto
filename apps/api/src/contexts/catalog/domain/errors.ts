export class MenuItemNotFoundError extends Error {
  readonly kind = 'MenuItemNotFoundError' as const;
  constructor(public readonly itemId: string) {
    super(`Menu item "${itemId}" was not found.`);
    this.name = 'MenuItemNotFoundError';
  }
}

export class MenuCategoryNotFoundError extends Error {
  readonly kind = 'MenuCategoryNotFoundError' as const;
  constructor(public readonly categoryId: string) {
    super(`Menu category "${categoryId}" was not found.`);
    this.name = 'MenuCategoryNotFoundError';
  }
}

export class CatalogPublishConflictError extends Error {
  readonly kind = 'CatalogPublishConflictError' as const;
  constructor(message: string) {
    super(message);
    this.name = 'CatalogPublishConflictError';
  }
}

export type CatalogDomainError =
  | MenuItemNotFoundError
  | MenuCategoryNotFoundError
  | CatalogPublishConflictError;
