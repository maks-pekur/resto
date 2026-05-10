import { Inject, Injectable } from '@nestjs/common';
import type { TenantId } from '@resto/domain';
import { BRAND_REPOSITORY, type BrandRepository } from '../domain/ports';
import type { BrandSnapshot } from '../domain/brand.aggregate';

/**
 * Read-side facade for the `Brand` aggregate. Public surface for
 * cross-context callers (identity, future analytics) — they consume this
 * service through their own ports + adapters rather than reaching for
 * `BRAND_REPOSITORY` directly.
 */
@Injectable()
export class BrandQueriesService {
  constructor(@Inject(BRAND_REPOSITORY) private readonly repo: BrandRepository) {}

  async listForTenant(
    tenantId: TenantId,
    brandIds?: readonly string[],
  ): Promise<readonly BrandSnapshot[]> {
    return this.repo.listForTenant(tenantId, brandIds);
  }
}
