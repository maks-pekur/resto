import { Inject, Injectable, Logger } from '@nestjs/common';
import { requireTenantContext, schema, TenantAwareDb } from '@resto/db';
import { and, desc, eq } from 'drizzle-orm';

import type {
  ServiceRequest,
  ServiceRequestKind,
  ServiceRequestRepository,
  ServiceRequestRow,
} from '../domain/service-request';

/**
 * The floor's side of "excuse me". A second tap does not queue a second call — the same open
 * request is handed back, so a nervous guest cannot fill the staff's screen.
 */
@Injectable()
export class ServiceRequestDrizzleRepository implements ServiceRequestRepository {
  private readonly logger = new Logger(ServiceRequestDrizzleRepository.name);

  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async open(input: {
    readonly kind: ServiceRequestKind;
    readonly tableId: string;
    readonly locationId: string;
  }): Promise<ServiceRequest> {
    const ctx = requireTenantContext();
    return this.db.withTenant(async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.serviceRequests)
        .where(
          and(
            eq(schema.serviceRequests.tenantId, ctx.tenantId),
            eq(schema.serviceRequests.tableId, input.tableId),
            eq(schema.serviceRequests.kind, input.kind),
            eq(schema.serviceRequests.status, 'open'),
          ),
        )
        .limit(1);
      if (existing !== undefined) return toRequest(existing);

      const [row] = await tx
        .insert(schema.serviceRequests)
        .values({
          tenantId: ctx.tenantId,
          locationId: input.locationId,
          tableId: input.tableId,
          kind: input.kind,
        })
        .returning();
      if (row === undefined) throw new Error('Service request insert returned no row.');
      this.logger.log({ kind: input.kind, tableId: input.tableId }, 'Service requested.');
      return toRequest(row);
    });
  }

  async listOpen(): Promise<readonly ServiceRequestRow[]> {
    const ctx = requireTenantContext();
    return this.db.withTenant(async (tx) => {
      const rows = await tx
        .select({
          id: schema.serviceRequests.id,
          kind: schema.serviceRequests.kind,
          tableId: schema.serviceRequests.tableId,
          locationId: schema.serviceRequests.locationId,
          createdAt: schema.serviceRequests.createdAt,
          zoneName: schema.tableZones.name,
          tableNumber: schema.restaurantTables.number,
        })
        .from(schema.serviceRequests)
        .innerJoin(
          schema.restaurantTables,
          and(
            eq(schema.restaurantTables.id, schema.serviceRequests.tableId),
            eq(schema.restaurantTables.tenantId, schema.serviceRequests.tenantId),
          ),
        )
        .innerJoin(
          schema.tableZones,
          and(
            eq(schema.tableZones.id, schema.restaurantTables.zoneId),
            eq(schema.tableZones.tenantId, schema.restaurantTables.tenantId),
          ),
        )
        .where(
          and(
            eq(schema.serviceRequests.tenantId, ctx.tenantId),
            eq(schema.serviceRequests.status, 'open'),
          ),
        )
        .orderBy(desc(schema.serviceRequests.createdAt));

      return rows.map((row) => ({ ...row, kind: row.kind as ServiceRequestKind }));
    });
  }

  async resolve(id: string): Promise<void> {
    const ctx = requireTenantContext();
    await this.db.withTenant(async (tx) => {
      await tx
        .update(schema.serviceRequests)
        .set({ status: 'resolved', resolvedAt: new Date() })
        .where(
          and(
            eq(schema.serviceRequests.tenantId, ctx.tenantId),
            eq(schema.serviceRequests.id, id),
            eq(schema.serviceRequests.status, 'open'),
          ),
        );
    });
  }
}

interface Row {
  id: string;
  kind: string;
  tableId: string;
  locationId: string;
  createdAt: Date;
}

const toRequest = (row: Row): ServiceRequest => ({
  id: row.id,
  kind: row.kind as ServiceRequestKind,
  tableId: row.tableId,
  locationId: row.locationId,
  createdAt: row.createdAt,
});
