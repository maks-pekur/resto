export const TENANT_LOOKUP_PORT = Symbol('TENANT_LOOKUP_PORT');

export interface TenantLookupPort {
  /**
   * Returns `null` if no tenant matches the given slug. Identity context
   * does NOT throw on miss — bootstrap interprets miss as `TenantNotFound`.
   */
  findBySlug(slug: string): Promise<{ id: string; slug: string; displayName: string } | null>;
}
