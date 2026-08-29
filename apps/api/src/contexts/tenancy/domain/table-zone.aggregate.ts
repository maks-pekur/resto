import { z } from 'zod';
import type { LocationId, TenantId } from '@resto/domain';
import { TableZoneAlreadyArchivedError } from './errors';

export const TableZoneName = z.string().min(1).max(120);

export interface TableZoneSnapshot {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly locationId: LocationId;
  readonly name: string;
  readonly status: 'active' | 'archived';
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
}

export class TableZone {
  private constructor(private snapshot: TableZoneSnapshot) {}

  static fromSnapshot(snapshot: TableZoneSnapshot): TableZone {
    return new TableZone(snapshot);
  }

  toSnapshot(): TableZoneSnapshot {
    return this.snapshot;
  }

  rename(name: string, now: Date = new Date()): void {
    if (this.snapshot.status === 'archived') {
      throw new TableZoneAlreadyArchivedError(this.snapshot.id);
    }
    this.snapshot = { ...this.snapshot, name, updatedAt: now };
  }

  archive(now: Date = new Date()): void {
    if (this.snapshot.status === 'archived') {
      throw new TableZoneAlreadyArchivedError(this.snapshot.id);
    }
    this.snapshot = { ...this.snapshot, status: 'archived', archivedAt: now, updatedAt: now };
  }
}
