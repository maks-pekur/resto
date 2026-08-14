import { Inject, Injectable } from '@nestjs/common';
import { schema, TenantAwareDb } from '@resto/db';
import { sql } from 'drizzle-orm';
import type { NextShortNumberInput, OrderSequencePort } from '../domain/ports';

@Injectable()
export class OrderSequenceDrizzleRepository implements OrderSequencePort {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async nextShortNumber(input: NextShortNumberInput): Promise<number> {
    return this.db.withTenant(async (tx) => {
      const rows = await tx
        .insert(schema.orderDailySequences)
        .values({
          tenantId: input.tenantId,
          locationId: input.locationId,
          businessDate: input.businessDate,
          counter: 1,
        })
        .onConflictDoUpdate({
          target: [
            schema.orderDailySequences.tenantId,
            schema.orderDailySequences.locationId,
            schema.orderDailySequences.businessDate,
          ],
          set: { counter: sql`${schema.orderDailySequences.counter} + 1` },
        })
        .returning({ counter: schema.orderDailySequences.counter });

      const row = rows[0];
      if (!row) {
        throw new Error(
          `OrderSequenceDrizzleRepository.nextShortNumber: no row returned for tenant=${input.tenantId} location=${input.locationId} date=${input.businessDate}.`,
        );
      }
      return row.counter;
    });
  }
}
