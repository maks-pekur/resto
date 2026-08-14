import { Inject, Injectable } from '@nestjs/common';
import { schema, TenantAwareDb } from '@resto/db';
import { sql } from 'drizzle-orm';
import type { NextShortNumberInput, OrderSequencePort } from '../domain/ports';

@Injectable()
export class OrderSequenceDrizzleRepository implements OrderSequencePort {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async nextShortNumber(input: NextShortNumberInput): Promise<number> {
    return this.db.withTenant(async (tx) => {
      // ScopedTx.insertInto() cannot express ON CONFLICT DO UPDATE with an
      // arithmetic SET clause + RETURNING -- raw tx is the sanctioned escape
      // hatch (ADR-0020 I-1), same family as catalog-drizzle.repository.ts's
      // listStopListAggregateAcrossLocations. Safety here comes from
      // tenantId being part of both the inserted values AND the conflict
      // target (the composite primary key), so no row outside the bound
      // tenant can ever be reached or created -- and the composite FK to
      // locations(id, tenant_id) rejects a locationId from another tenant.
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
          // Postgres serialises INSERT ... ON CONFLICT DO UPDATE per row, so
          // two simultaneous callers for the same (tenant, location, date)
          // get distinct, gap-free values with no explicit SELECT ... FOR
          // UPDATE -- MAX(short_number) + 1 would be the classic
          // read-then-write race this project's Friday-evening concurrent
          // checkout constraint rules out.
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
