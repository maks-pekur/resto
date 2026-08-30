import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { getLocationId, requireTenantContext } from '@resto/db';
import { TenantId } from '@resto/domain';
import { LOCATION_REPOSITORY, type LocationRepository } from '../../tenancy/domain/ports';
import { PAYMENT_REPOSITORY, type PaymentRepository } from '../../payments/domain/ports';
import {
  ORDER_FEED_REPOSITORY,
  type OrderFeedRepository,
  type OrderFeedRow,
} from '../domain/ports';
import type { OrderStatus } from '../domain/order.aggregate';
import { addDays, zonedMidnightUtc } from '../../../shared/zoned-day';
import type { OrderDatePreset, OrderStatusPreset } from './order-feed-dto';

const ACTIVE_STATUSES: readonly OrderStatus[] = ['paid', 'accepted', 'preparing', 'ready'];
const ALL_STATUSES: readonly OrderStatus[] = [
  'created',
  'requires_action',
  'paid',
  'accepted',
  'preparing',
  'ready',
  'completed',
  'canceled',
  'refunded',
  'failed',
];
const COMPLETED_STATUSES: readonly OrderStatus[] = ['completed'];
const CANCELED_STATUSES: readonly OrderStatus[] = ['canceled', 'refunded'];

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface ListOrdersInput {
  readonly statusPreset?: OrderStatusPreset;
  readonly channel?: 'site' | 'qr-menu';
  readonly datePreset?: OrderDatePreset;
  readonly since?: { readonly createdAt: Date; readonly id: string };
  readonly limit?: number;
  readonly offset?: number;
}

export interface ListOrdersResult {
  readonly rows: readonly OrderFeedRow[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

@Injectable()
export class ListOrdersService {
  constructor(
    @Inject(ORDER_FEED_REPOSITORY) private readonly feedRepo: OrderFeedRepository,
    @Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
  ) {}

  async execute(input: ListOrdersInput): Promise<ListOrdersResult> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);
    const requestedLocationId = getLocationId();

    const allLocations = await this.locations.listForTenant(tenantId);
    const activeLocations = allLocations.filter((l) => l.status === 'active');

    if (requestedLocationId === undefined) {
      throw new ForbiddenException({
        code: 'location.context_required',
        message: 'Location context is required for the order feed.',
      });
    }
    const match = activeLocations.find((l) => l.id === requestedLocationId);
    if (!match) {
      throw new NotFoundException();
    }
    const locationIds: string[] = [match.id];
    const referenceTimezone: string | null = match.timezone;

    const statusPreset = input.statusPreset ?? 'active';
    const statuses = resolveStatusPreset(statusPreset);
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.max(input.offset ?? 0, 0);
    const { from, to } = resolveDateRange(input.datePreset ?? 'today', referenceTimezone);
    const isRefundFailedPreset = statusPreset === 'refund_failed';

    const { rows, total } = await this.feedRepo.list({
      tenantId,
      locationIds,
      statuses: [...statuses],
      ...(input.channel !== undefined ? { channel: input.channel } : {}),
      createdFrom: from,
      createdTo: to,
      ...(input.since !== undefined ? { since: input.since } : {}),
      limit: isRefundFailedPreset ? MAX_LIMIT : limit,
      offset: isRefundFailedPreset ? 0 : offset,
    });

    const patchedRows = await this.#applyFailedRefundFlag(tenantId, rows);
    if (!isRefundFailedPreset) {
      return { rows: patchedRows, total, limit, offset };
    }

    const failedRows = patchedRows.filter((r) => r.hasFailedRefund);
    return {
      rows: failedRows.slice(offset, offset + limit),
      total: failedRows.length,
      limit,
      offset,
    };
  }

  async #applyFailedRefundFlag(
    tenantId: TenantId,
    rows: readonly OrderFeedRow[],
  ): Promise<OrderFeedRow[]> {
    if (rows.length === 0) return [];
    const failed = await this.payments.findFailedRefundsForOrders(
      tenantId,
      rows.map((r) => r.id),
    );
    const failedOrderIds = new Set(failed.map((f) => f.orderId));
    return rows.map((r) => ({ ...r, hasFailedRefund: failedOrderIds.has(r.id) }));
  }
}

function resolveStatusPreset(preset: OrderStatusPreset): readonly OrderStatus[] {
  switch (preset) {
    case 'active':
      return ACTIVE_STATUSES;
    case 'all_today':
      return ALL_STATUSES;
    case 'completed':
      return COMPLETED_STATUSES;
    case 'canceled':
      return CANCELED_STATUSES;
    case 'refund_failed':
      return ALL_STATUSES;
  }
}

function resolveDateRange(
  preset: OrderDatePreset,
  timezone: string | null,
): { from: Date; to: Date } {
  const tz = timezone ?? 'UTC';
  const todayStart = zonedMidnightUtc(new Date(), tz);

  if (preset === 'today') {
    return { from: todayStart, to: addDays(todayStart, 1) };
  }
  if (preset === 'yesterday') {
    const yesterdayStart = addDays(todayStart, -1);
    return { from: yesterdayStart, to: todayStart };
  }
  return { from: addDays(todayStart, -6), to: addDays(todayStart, 1) };
}
