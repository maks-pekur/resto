import { z } from 'zod';
import type { LocationId, TenantId } from '@resto/domain';
import { RestaurantTableAlreadyArchivedError } from './errors';

// Free display text — an operator may want `A1` or `терраса-3` (CONTEXT D-23).
export const TableNumber = z.string().min(1).max(32);

export interface RestaurantTableSnapshot {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly zoneId: string;
  readonly locationId: LocationId;
  readonly number: string;
  readonly ordinal: number;
  /** The secret in the table's printed code — never shown to a guest, only encoded. */
  readonly qrToken: string;
  readonly status: 'active' | 'archived';
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
}

export interface RenumberInput {
  readonly number: string;
  readonly ordinal: number;
}

export class RestaurantTable {
  private constructor(private snapshot: RestaurantTableSnapshot) {}

  static fromSnapshot(snapshot: RestaurantTableSnapshot): RestaurantTable {
    return new RestaurantTable(snapshot);
  }

  toSnapshot(): RestaurantTableSnapshot {
    return this.snapshot;
  }

  renumber(input: RenumberInput, now: Date = new Date()): void {
    if (this.snapshot.status === 'archived') {
      throw new RestaurantTableAlreadyArchivedError(this.snapshot.id);
    }
    this.snapshot = {
      ...this.snapshot,
      number: input.number,
      ordinal: input.ordinal,
      updatedAt: now,
    };
  }

  archive(now: Date = new Date()): void {
    if (this.snapshot.status === 'archived') {
      throw new RestaurantTableAlreadyArchivedError(this.snapshot.id);
    }
    this.snapshot = { ...this.snapshot, status: 'archived', archivedAt: now, updatedAt: now };
  }
}
