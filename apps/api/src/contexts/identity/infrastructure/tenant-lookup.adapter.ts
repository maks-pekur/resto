import { Inject, Injectable } from '@nestjs/common';
import { TenantQueriesService } from '../../tenancy/application/tenant-queries.service';
import type { TenantLookupPort, TenantSummary } from '../application/ports/tenant-lookup.port';

@Injectable()
export class TenantLookupAdapter implements TenantLookupPort {
  constructor(@Inject(TenantQueriesService) private readonly queries: TenantQueriesService) {}

  async findBySlug(slug: string): Promise<TenantSummary | null> {
    const snapshot = await this.queries.findBySlug(slug);
    if (!snapshot) return null;
    return { id: snapshot.id, slug: snapshot.slug, displayName: snapshot.displayName };
  }

  async findById(id: string): Promise<TenantSummary | null> {
    const snapshot = await this.queries.findById(id);
    if (!snapshot) return null;
    return { id: snapshot.id, slug: snapshot.slug, displayName: snapshot.displayName };
  }
}
