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

export class MenuModifierOptionNotFoundError extends Error {
  readonly kind = 'MenuModifierOptionNotFoundError' as const;
  constructor(public readonly optionId: string) {
    super(`Menu modifier option "${optionId}" was not found.`);
    this.name = 'MenuModifierOptionNotFoundError';
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

// Kept in the union so error-mapping's exhaustive switch stays honest; archive services are idempotent today.
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

export class CategoryNestingDepthError extends Error {
  readonly kind = 'CategoryNestingDepthError' as const;
  constructor(
    public readonly categoryId: string,
    message: string,
  ) {
    super(message);
    this.name = 'CategoryNestingDepthError';
  }
}

export class CatalogCodeConflictError extends Error {
  readonly kind = 'CatalogCodeConflictError' as const;
  constructor(
    public readonly entityType: 'category' | 'item',
    public readonly code: string,
  ) {
    super(`A ${entityType} with code "${code}" already exists for this tenant.`);
    this.name = 'CatalogCodeConflictError';
  }
}

// D-04: a tenant with zero active locations has no location to resolve
// availability against; no location is ever synthesized to satisfy this.
export class NoLocationForTenantError extends Error {
  readonly kind = 'NoLocationForTenantError' as const;
  constructor(public readonly tenantId: string) {
    super(`Tenant "${tenantId}" has no active location to resolve availability against.`);
    this.name = 'NoLocationForTenantError';
  }
}

export class MenuIngredientAlreadyAttachedError extends Error {
  readonly kind = 'MenuIngredientAlreadyAttachedError' as const;
  constructor(
    public readonly optionId: string,
    public readonly attachedVia: string,
  ) {
    super(`Ingredient "${optionId}" is already attached to "${attachedVia}".`);
    this.name = 'MenuIngredientAlreadyAttachedError';
  }
}

export type CatalogDomainError =
  | MenuItemNotFoundError
  | MenuCategoryNotFoundError
  | CatalogPublishConflictError
  | MenuModifierGroupNotFoundError
  | MenuModifierOptionNotFoundError
  | MenuItemSizeNotFoundError
  | StopListItemNotFoundError
  | MenuCategoryAlreadyArchivedError
  | MenuItemAlreadyArchivedError
  | CategoryNestingDepthError
  | CatalogCodeConflictError
  | NoLocationForTenantError
  | MenuIngredientAlreadyAttachedError;
