import { Inject, Injectable } from '@nestjs/common';
import { TenantQueriesService } from '../../tenancy/application/tenant-queries.service';
import type { TenantLookupPort } from '../application/ports/tenant-lookup.port';

@Injectable()
export class TenantLookupAdapter implements TenantLookupPort {
  constructor(@Inject(TenantQueriesService) private readonly queries: TenantQueriesService) {}

  async findBySlug(
    slug: string,
  ): Promise<{ id: string; slug: string; displayName: string } | null> {
    const snapshot = await this.queries.findBySlug(slug);
    if (!snapshot) return null;
    return { id: snapshot.id, slug: snapshot.slug, displayName: snapshot.displayName };
  }
}
