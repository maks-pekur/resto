import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { runInTenantContext } from '@resto/db';
import type { LocationSnapshot } from '../../../src/contexts/tenancy/domain/location.aggregate';
import type { TenantSnapshot } from '../../../src/contexts/tenancy/domain/tenant.aggregate';
import type {
  LocationRepository,
  TenantRepository,
} from '../../../src/contexts/tenancy/domain/ports';
import type {
  AnalyticsReader,
  DashboardTotalsQuery,
} from '../../../src/contexts/analytics/domain/ports';
import type { MemberLocationScopeReader } from '../../../src/contexts/identity/application/ports/member-location-scope-reader.port';
import { GetDashboardKpisService } from '../../../src/contexts/analytics/application/get-dashboard-kpis.service';

const tenantId = randomUUID();
const locationA = randomUUID();
const locationB = randomUUID();

const location = (id: string, overrides: Partial<LocationSnapshot> = {}): LocationSnapshot =>
  ({
    id,
    tenantId,
    name: `Location ${id.slice(0, 4)}`,
    slug: `loc-${id.slice(0, 4)}`,
    status: 'active',
    timezone: null,
    ...overrides,
  }) as LocationSnapshot;

const tenant = {
  id: tenantId,
  timezone: 'UTC',
  defaultCurrency: 'EUR',
} as unknown as TenantSnapshot;

const OWNER = { userId: 'user-owner', isOwner: true };

const buildService = (
  locations: readonly LocationSnapshot[],
  memberScope: readonly string[] | null = null,
) => {
  const queries: DashboardTotalsQuery[] = [];
  const reader: AnalyticsReader = {
    readDashboardTotals: (query) => {
      queries.push(query);
      return Promise.resolve(
        queries.length === 1
          ? { revenue: '150.00', completedOrders: 3, newGuests: 2, refunds: '10.00' }
          : { revenue: '100.00', completedOrders: 2, newGuests: 1, refunds: '0.00' },
      );
    },
  };
  const locationRepo = {
    listForTenant: () => Promise.resolve(locations),
  } as unknown as LocationRepository;
  const tenantRepo = { findById: () => Promise.resolve(tenant) } as unknown as TenantRepository;
  const scopeReader = {
    findLocationScopeForMember: () => Promise.resolve(memberScope),
  } as unknown as MemberLocationScopeReader;

  return {
    service: new GetDashboardKpisService(reader, locationRepo, tenantRepo, scopeReader),
    queries,
  };
};

describe('GetDashboardKpisService', () => {
  it('reports the current window against the one before it', async () => {
    const { service, queries } = buildService([location(locationA)]);

    const result = await runInTenantContext({ tenantId }, () =>
      service.execute({ from: '2026-08-01', to: '2026-08-28', ...OWNER }),
    );

    expect(result.revenue).toEqual({ value: '150.00', previous: '100.00' });
    expect(result.completedOrders).toEqual({ value: 3, previous: 2 });
    expect(result.newGuests).toEqual({ value: 2, previous: 1 });
    expect(result.refunds).toEqual({ value: '10.00', previous: '0.00' });
    expect(result.currency).toBe('EUR');
    expect(result.range).toEqual({ from: '2026-08-01', to: '2026-08-28' });

    const [current, previous] = queries;
    const dayMs = 86_400_000;
    expect((current?.to.getTime() ?? 0) - (current?.from.getTime() ?? 0)).toBe(28 * dayMs);
    expect(previous?.to.getTime()).toBe(current?.from.getTime());
    expect((previous?.to.getTime() ?? 0) - (previous?.from.getTime() ?? 0)).toBe(28 * dayMs);
  });

  it('defaults to today when no range is given', async () => {
    const { service } = buildService([location(locationA)]);

    const result = await runInTenantContext({ tenantId }, () => service.execute({ ...OWNER }));

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    expect(result.range).toEqual({ from: today, to: today });
  });

  it('covers every active location when no location is bound', async () => {
    const { service, queries } = buildService([
      location(locationA),
      location(locationB),
      location(randomUUID(), { status: 'archived' }),
    ]);

    await runInTenantContext({ tenantId }, () =>
      service.execute({ from: '2026-08-24', to: '2026-08-30', ...OWNER }),
    );

    expect(queries[0]?.locationIds).toEqual([locationA, locationB]);
  });

  it('narrows to the bound location', async () => {
    const { service, queries } = buildService([location(locationA), location(locationB)]);

    await runInTenantContext({ tenantId, locationId: locationB }, () =>
      service.execute({ from: '2026-08-24', to: '2026-08-30', ...OWNER }),
    );

    expect(queries[0]?.locationIds).toEqual([locationB]);
  });

  it('refuses a location that is not an active location of this tenant', async () => {
    const { service } = buildService([location(locationA)]);

    await expect(
      runInTenantContext({ tenantId, locationId: locationB }, () =>
        service.execute({ from: '2026-08-24', to: '2026-08-30', ...OWNER }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('shows a scoped member only the locations they hold', async () => {
    const { service, queries } = buildService(
      [location(locationA), location(locationB)],
      [locationB],
    );

    await runInTenantContext({ tenantId }, () =>
      service.execute({
        from: '2026-08-24',
        to: '2026-08-30',
        userId: 'user-admin',
        isOwner: false,
      }),
    );

    expect(queries[0]?.locationIds).toEqual([locationB]);
  });

  it('refuses a scoped member the location they do not hold', async () => {
    const { service } = buildService([location(locationA), location(locationB)], [locationA]);

    await expect(
      runInTenantContext({ tenantId, locationId: locationB }, () =>
        service.execute({
          from: '2026-08-24',
          to: '2026-08-30',
          userId: 'user-admin',
          isOwner: false,
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('shows a member with no scope rows nothing at all', async () => {
    const { service, queries } = buildService([location(locationA)], null);

    await runInTenantContext({ tenantId }, () =>
      service.execute({
        from: '2026-08-24',
        to: '2026-08-30',
        userId: 'user-admin',
        isOwner: false,
      }),
    );

    expect(queries[0]?.locationIds).toEqual([]);
  });
});
