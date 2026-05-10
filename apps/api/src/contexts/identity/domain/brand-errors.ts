export class BrandSlugConflictError extends Error {
  constructor(public readonly slug: string) {
    super(`Brand slug already taken: ${slug}.`);
    this.name = 'BrandSlugConflictError';
  }
}
