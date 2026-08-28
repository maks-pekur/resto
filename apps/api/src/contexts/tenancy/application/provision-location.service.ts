import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { LOCATION_RESERVED_SLUG_SET, LocationId, TenantId, slugifyName } from '@resto/domain';
import { LOCATION_REPOSITORY, TENANT_REPOSITORY } from '../domain/ports';
import type { LocationRepository, TenantRepository } from '../domain/ports';
import type { LocationContacts, LocationSnapshot } from '../domain/location.aggregate';
import { LocationNameNotSluggableError } from '../domain/errors';

export interface ProvisionLocationInput {
  readonly name: string;
  readonly address: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  /** Omitted means "inherit the tenant's zone" — the common case. */
  readonly timezone?: string | null | undefined;
  readonly contacts: LocationContacts | null;
}

/**
 * Slug generation is server-side on purpose. The client shows a preview so the operator is not
 * surprised, but the value that lands in a URL and a unique index is decided where the other
 * locations are visible — a browser cannot see whether "voskresenka" is already taken.
 */
const buildUniqueSlug = (name: string, taken: ReadonlySet<string>): string => {
  const base = slugifyName(name);
  if (base === '') throw new LocationNameNotSluggableError(name);

  const isFree = (candidate: string): boolean =>
    !taken.has(candidate) && !LOCATION_RESERVED_SLUG_SET.has(candidate);

  if (isFree(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix++) {
    const candidate = `${base}-${suffix.toString()}`;
    if (isFree(candidate)) return candidate;
  }
  // 998 locations sharing one name is not a real tenant; fall back rather than loop forever.
  return `${base}-${randomUUID().slice(0, 8)}`;
};

@Injectable()
export class ProvisionLocationService {
  private readonly logger = new Logger(ProvisionLocationService.name);

  constructor(
    @Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenants: TenantRepository,
  ) {}

  async execute(input: ProvisionLocationInput): Promise<LocationSnapshot> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);
    const now = new Date();

    const existing = await this.locations.listForTenant(tenantId);
    const slug = buildUniqueSlug(input.name, new Set(existing.map((location) => location.slug)));

    // D: the tenant's zone is the default, never the ceiling — a chain can cross zones.
    const timezone =
      input.timezone !== undefined
        ? input.timezone
        : ((await this.tenants.findById(tenantId))?.timezone ?? null);

    const snapshot: LocationSnapshot = {
      id: LocationId.parse(randomUUID()),
      tenantId,
      name: input.name,
      slug,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      timezone,
      contacts: input.contacts,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };

    await this.locations.save(snapshot);
    this.logger.log(
      { tenantId: ctx.tenantId, locationId: snapshot.id, slug },
      'Location provisioned.',
    );
    return snapshot;
  }
}
