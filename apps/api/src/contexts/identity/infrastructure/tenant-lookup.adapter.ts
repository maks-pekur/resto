import { Inject, Injectable } from '@nestjs/common';
import { TenantQueriesService } from '../../tenancy/application/tenant-queries.service';
import { TenantNotFoundError } from '../../tenancy/domain/errors';
import type { TenantLookupPort } from '../application/ports/tenant-lookup.port';

@Injectable()
export class TenantLookupAdapter implements TenantLookupPort {
  constructor(@Inject(TenantQueriesService) private readonly queries: TenantQueriesService) {}

  async findBySlug(
    slug: string,
  ): Promise<{ id: string; slug: string; displayName: string } | null> {
    try {
      const snapshot = await this.queries.getBySlug(slug);
      return { id: snapshot.id, slug: snapshot.slug, displayName: snapshot.displayName };
    } catch (err) {
      if (err instanceof TenantNotFoundError) return null;
      throw err;
    }
  }
}
