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

export class MenuModifierGroupNotFoundError extends Error {
  readonly kind = 'MenuModifierGroupNotFoundError' as const;
  constructor(public readonly groupId: string) {
    super(`Menu modifier group "${groupId}" was not found.`);
    this.name = 'MenuModifierGroupNotFoundError';
  }
}

export class MenuItemSizeNotFoundError extends Error {
  readonly kind = 'MenuItemSizeNotFoundError' as const;
  constructor(public readonly sizeId: string) {
    super(`Menu item size "${sizeId}" was not found.`);
    this.name = 'MenuItemSizeNotFoundError';
  }
}

export class StopListItemNotFoundError extends Error {
  readonly kind = 'StopListItemNotFoundError' as const;
  constructor(public readonly itemId: string) {
    super(`Stop-list entry for item "${itemId}" was not found.`);
    this.name = 'StopListItemNotFoundError';
  }
}

// Phase 4b D-4b-07. Archive services are idempotent on already-archived rows
// (the behavior spec calls for no-op re-archive); these classes exist as a
// defensive type-level slot for the controller's error mapping in case a
// future caller wants strict mode. Left in the union so the exhaustive
// switch in error-mapping.ts stays honest.
export class MenuCategoryAlreadyArchivedError extends Error {
  readonly kind = 'MenuCategoryAlreadyArchivedError' as const;
  constructor(public readonly categoryId: string) {
    super(`Menu category "${categoryId}" is already archived.`);
    this.name = 'MenuCategoryAlreadyArchivedError';
  }
}

export class MenuItemAlreadyArchivedError extends Error {
  readonly kind = 'MenuItemAlreadyArchivedError' as const;
  constructor(public readonly itemId: string) {
    super(`Menu item "${itemId}" is already archived.`);
    this.name = 'MenuItemAlreadyArchivedError';
  }
}

export type CatalogDomainError =
  | MenuItemNotFoundError
  | MenuCategoryNotFoundError
  | CatalogPublishConflictError
  | MenuModifierGroupNotFoundError
  | MenuItemSizeNotFoundError
  | StopListItemNotFoundError
  | MenuCategoryAlreadyArchivedError
  | MenuItemAlreadyArchivedError;
