import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { getLocationId, requireTenantContext } from '@resto/db';
import { TenantId } from '@resto/domain';
import { addDays, zonedMidnightUtc } from '../../../shared/zoned-day';
import {
  LOCATION_REPOSITORY,
  TENANT_REPOSITORY,
  type LocationRepository,
  type TenantRepository,
} from '../../tenancy/domain/ports';
import {
  MEMBER_LOCATION_SCOPE_READER,
  type MemberLocationScopeReader,
} from '../../identity/application/ports/member-location-scope-reader.port';
import { ANALYTICS_READER, type AnalyticsReader } from '../domain/ports';
import {
  DEFAULT_DASHBOARD_RANGE_DAYS,
  type DashboardKpisQueryInput,
  type DashboardKpisResponse,
} from './dashboard-dto';

export interface GetDashboardKpisInput extends DashboardKpisQueryInput {
  readonly userId: string;
  readonly isOwner: boolean;
}

@Injectable()
export class GetDashboardKpisService {
  constructor(
    @Inject(ANALYTICS_READER) private readonly reader: AnalyticsReader,
    @Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenants: TenantRepository,
    @Inject(MEMBER_LOCATION_SCOPE_READER)
    private readonly memberScope: MemberLocationScopeReader,
  ) {}

  async execute(input: GetDashboardKpisInput): Promise<DashboardKpisResponse> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new NotFoundException();

    const days = input.days ?? DEFAULT_DASHBOARD_RANGE_DAYS;
    const active = (await this.locations.listForTenant(tenantId)).filter(
      (l) => l.status === 'active',
    );

    // No location header means the every-location dashboard, the same shape the stop-list
    // aggregate uses (D-10): the set is server-resolved, never taken from the caller.
    const requestedLocationId = getLocationId();
    const scoped =
      requestedLocationId === undefined
        ? null
        : (active.find((l) => l.id === requestedLocationId) ?? undefined);
    if (scoped === undefined) throw new NotFoundException();

    // The route is location-neutral, so LocationScopeGuard steps aside and the scope check
    // is this service's job — deny-by-default, exactly as the guard reads it.
    const visible = input.isOwner
      ? null
      : ((await this.memberScope.findLocationScopeForMember({
          userId: input.userId,
          tenantId,
        })) ?? []);
    if (scoped !== null && visible !== null && !visible.includes(scoped.id)) {
      throw new ForbiddenException({
        code: 'location.access_denied',
        message: 'Operator is not scoped to this location.',
      });
    }

    const everyLocation = visible === null ? active : active.filter((l) => visible.includes(l.id));
    const locationIds = scoped === null ? everyLocation.map((l) => l.id) : [scoped.id];
    const timezone = scoped?.timezone ?? tenant.timezone;

    const to = addDays(zonedMidnightUtc(new Date(), timezone), 1);
    const from = addDays(to, -days);
    const previousFrom = addDays(from, -days);

    const [current, previous] = await Promise.all([
      this.reader.readDashboardTotals({ tenantId, locationIds, from, to }),
      this.reader.readDashboardTotals({ tenantId, locationIds, from: previousFrom, to: from }),
    ]);

    return {
      range: { from: from.toISOString(), to: to.toISOString(), days },
      currency: tenant.defaultCurrency,
      revenue: { value: current.revenue, previous: previous.revenue },
      completedOrders: { value: current.completedOrders, previous: previous.completedOrders },
      newGuests: { value: current.newGuests, previous: previous.newGuests },
      refunds: { value: current.refunds, previous: previous.refunds },
    };
  }
}
