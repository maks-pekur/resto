import { z } from 'zod';
import type { LocationId, TenantId } from '@resto/domain';
import { LocationNotArchivedError, LocationAlreadyArchivedError } from './errors';

export const LocationName = z.string().min(1).max(200);

export const LocationAddress = z.string().min(1).max(500);

/**
 * An exact point, required on every location created through the API. A free-text address cannot
 * answer "how far is this order" or "is it inside the delivery zone"; a coordinate can.
 * Rows that predate this carry nulls — the migration refused to invent values for them.
 */
export const LocationLatitude = z.number().min(-90).max(90);
export const LocationLongitude = z.number().min(-180).max(180);

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
  readonly slug: string;
  readonly address: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
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

  /**
   * Everything an operator may edit after creation. The slug is deliberately absent: it is in URLs
   * and in operators' muscle memory, so renaming a location must not silently move its address.
   */
  update(
    input: {
      readonly name?: string | undefined;
      readonly address?: string | null | undefined;
      readonly latitude?: number | null | undefined;
      readonly longitude?: number | null | undefined;
      readonly timezone?: string | null | undefined;
      readonly contacts?: LocationContacts | null | undefined;
    },
    now: Date = new Date(),
  ): void {
    if (this.snapshot.status === 'archived') {
      throw new LocationAlreadyArchivedError(this.snapshot.id);
    }
    this.snapshot = {
      ...this.snapshot,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
      ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.contacts !== undefined ? { contacts: input.contacts } : {}),
      updatedAt: now,
    };
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

  /** Archiving is our delete, so un-archiving has to exist — otherwise a slip is permanent. */
  restore(now: Date = new Date()): void {
    if (this.snapshot.status !== 'archived') {
      throw new LocationNotArchivedError(this.snapshot.id);
    }
    this.snapshot = {
      ...this.snapshot,
      status: 'active',
      archivedAt: null,
      updatedAt: now,
    };
  }

  pullEvents(): LocationDomainEvent[] {
    const events = this.#events.slice();
    this.#events.length = 0;
    return events;
  }
}
