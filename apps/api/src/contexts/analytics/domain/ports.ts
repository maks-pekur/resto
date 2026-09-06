import type { TenantId } from '@resto/domain';

export interface DashboardTotals {
  readonly revenue: string;
  readonly completedOrders: number;
  readonly newGuests: number;
  readonly refunds: string;
}

export interface DashboardTotalsQuery {
  readonly tenantId: TenantId;
  readonly locationIds: readonly string[];
  readonly from: Date;
  readonly to: Date;
}

export interface AnalyticsReader {
  readDashboardTotals(query: DashboardTotalsQuery): Promise<DashboardTotals>;
}

export const ANALYTICS_READER = Symbol('ANALYTICS_READER');
