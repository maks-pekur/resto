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
const PAID_STATUSES: readonly OrderStatus[] = ['paid'];
const ACCEPTED_STATUSES: readonly OrderStatus[] = ['accepted'];
const PREPARING_STATUSES: readonly OrderStatus[] = ['preparing'];
const READY_STATUSES: readonly OrderStatus[] = ['ready'];
const CANCELED_STATUSES: readonly OrderStatus[] = ['canceled', 'refunded'];

// The tabs an operator works from are queues: the order waiting longest sits at the top. A
// finished list is history and reads the other way round, newest first.
const QUEUE_PRESETS: readonly OrderStatusPreset[] = [
  'active',
  'unaccepted',
  'accepted',
  'preparing',
  'ready',
];

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface ListOrdersInput {
  readonly statusPreset?: OrderStatusPreset;
  readonly channel?: 'site' | 'qr-menu';
  readonly orderType?: 'dine_in' | 'pickup' | 'delivery';
  readonly datePreset?: OrderDatePreset;
  readonly from?: string;
  readonly to?: string;
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
    const { from, to } = resolveWindow(input, referenceTimezone);
    const isRefundFailedPreset = statusPreset === 'refund_failed';

    const { rows, total } = await this.feedRepo.list({
      tenantId,
      locationIds,
      statuses: [...statuses],
      ...(input.channel !== undefined ? { channel: input.channel } : {}),
      ...(input.orderType !== undefined ? { orderType: input.orderType } : {}),
      ...(statusPreset === 'unaccepted' ? { unacceptedOnly: true } : {}),
      sort: QUEUE_PRESETS.includes(statusPreset) ? 'oldest_first' : 'newest_first',
      ...(referenceTimezone !== null ? { timezone: referenceTimezone } : {}),
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
    case 'unaccepted':
      return PAID_STATUSES;
    case 'accepted':
      return ACCEPTED_STATUSES;
    case 'preparing':
      return PREPARING_STATUSES;
    case 'ready':
      return READY_STATUSES;
  }
}

export function resolveWindow(
  input: { readonly from?: string; readonly to?: string; readonly datePreset?: OrderDatePreset },
  timezone: string | null,
): { from: Date; to: Date } {
  if (input.from !== undefined && input.to !== undefined) {
    const tz = timezone ?? 'UTC';
    // Noon, not midnight: the instant only has to land inside the requested calendar day for
    // any timezone, and midnight UTC does not on a negative offset.
    const from = zonedMidnightUtc(new Date(`${input.from}T12:00:00.000Z`), tz);
    const to = addDays(zonedMidnightUtc(new Date(`${input.to}T12:00:00.000Z`), tz), 1);
    return { from, to };
  }
  return resolveDateRange(input.datePreset ?? 'today', timezone);
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
