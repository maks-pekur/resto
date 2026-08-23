import { z } from 'zod';
import type { LocationId, TenantId } from '@resto/domain';
import { LocationAlreadyArchivedError } from './errors';

export const LocationName = z.string().min(1).max(200);

export const LocationAddress = z.string().min(1).max(500);

// D-01 / 08.4-RESEARCH.md Focus Area 4: no IANA-zone validation library
// exists in the repo yet — loose regex only, allows `Etc/UTC`.
export const LocationTimezone = z
  .string()
  .max(64)
  .regex(/^[A-Za-z_]+\/[A-Za-z_]+$/, 'must be an IANA timezone identifier (e.g. Europe/Moscow)');

export const LocationContactsSchema = z.object({
  phone: z.string().max(32).optional(),
  email: z.string().email().max(255).optional(),
});
export type LocationContacts = z.infer<typeof LocationContactsSchema>;

export interface LocationArchivedEvent {
  readonly kind: 'LocationArchived';
  readonly locationId: LocationId;
  readonly tenantId: TenantId;
  readonly occurredAt: Date;
}

export type LocationDomainEvent = LocationArchivedEvent;

export interface LocationSnapshot {
  readonly id: LocationId;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly address: string | null;
  readonly timezone: string | null;
  readonly contacts: LocationContacts | null;
  readonly status: 'active' | 'archived';
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
}

export class Location {
  readonly #events: LocationDomainEvent[] = [];

  private constructor(private snapshot: LocationSnapshot) {}

  static fromSnapshot(snapshot: LocationSnapshot): Location {
    return new Location(snapshot);
  }

  toSnapshot(): LocationSnapshot {
    return this.snapshot;
  }

  archive(now: Date = new Date()): void {
    if (this.snapshot.status === 'archived') {
      throw new LocationAlreadyArchivedError(this.snapshot.id);
    }
    this.snapshot = {
      ...this.snapshot,
      status: 'archived',
      archivedAt: now,
      updatedAt: now,
    };
    this.#events.push({
      kind: 'LocationArchived',
      locationId: this.snapshot.id,
      tenantId: this.snapshot.tenantId,
      occurredAt: now,
    });
  }

  pullEvents(): LocationDomainEvent[] {
    const events = this.#events.slice();
    this.#events.length = 0;
    return events;
  }
}
