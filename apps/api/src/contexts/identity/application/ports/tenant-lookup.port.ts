export const TENANT_LOOKUP_PORT = Symbol('TENANT_LOOKUP_PORT');

export interface TenantSummary {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
}

export interface TenantLookupPort {
  /**
   * Returns `null` if no tenant matches the given slug. Identity context
   * does NOT throw on miss — bootstrap interprets miss as `TenantNotFound`.
   */
  findBySlug(slug: string): Promise<TenantSummary | null>;

  /**
   * Same contract as `findBySlug`, keyed by tenant id. Used by the
   * HTTP bootstrap endpoint where the operator already knows the id from
   * the prior `POST /internal/v1/tenants` response.
   */
  findById(id: string): Promise<TenantSummary | null>;
}
