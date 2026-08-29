import { Inject, Injectable } from '@nestjs/common';
import { TenantId } from '@resto/domain';
import { RestaurantTableNotFoundError } from '../domain/errors';
import { TABLE_ZONE_REPOSITORY, type TableZoneRepository } from '../domain/ports';

export interface ResolvedTable {
  readonly tableId: string;
  readonly zoneName: string;
  readonly number: string;
  readonly updatedAt: Date;
}

@Injectable()
export class ResolveTableService {
  constructor(@Inject(TABLE_ZONE_REPOSITORY) private readonly repo: TableZoneRepository) {}

  /**
   * `tenantId` is the host-resolved tenant the controller already re-verified — parsed here as a
   * defensive guard, not threaded into the repository call. `findActiveTableForResolution` reads
   * the tenant from AsyncLocalStorage, which `TenantContextMiddleware` bound from the same guest
   * host before this handler ran (ADR-0020 I-6: only the middleware may rebind it).
   */
  async execute(tenantId: string, tableId: string): Promise<ResolvedTable> {
    TenantId.parse(tenantId);
    const resolution = await this.repo.findActiveTableForResolution(tableId);
    if (!resolution) throw new RestaurantTableNotFoundError(tableId);
    return {
      tableId: resolution.tableId,
      zoneName: resolution.zoneName,
      number: resolution.number,
      updatedAt: resolution.updatedAt,
    };
  }
}
