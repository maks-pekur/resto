export class BrandSlugConflictError extends Error {
  constructor(public readonly slug: string) {
    super(`Brand slug already taken: ${slug}.`);
    this.name = 'BrandSlugConflictError';
  }
}

export class BrandDisplayNameTakenError extends Error {
  constructor(public readonly displayName: string) {
    super(`Brand display name already taken in this tenant: ${displayName}.`);
    this.name = 'BrandDisplayNameTakenError';
  }
}
