import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { getLocationId, requireBrandContext, requireTenantContext } from '@resto/db';
import { BrandId, TenantId } from '@resto/domain';
import { LOCATION_REPOSITORY, type LocationRepository } from '../../tenancy/domain/ports';
import { PAYMENT_REPOSITORY, type PaymentRepository } from '../../payments/domain/ports';
import {
  ORDER_FEED_REPOSITORY,
  type OrderFeedRepository,
  type OrderFeedRow,
} from '../domain/ports';
import type { OrderStatus } from '../domain/order.aggregate';
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
    const brandId = BrandId.parse(requireBrandContext());
    const requestedLocationId = getLocationId();

    const allLocations = await this.locations.listForBrand(brandId, tenantId);
    const activeLocations = allLocations.filter((l) => l.status === 'active');

    let locationIds: string[];
    let referenceTimezone: string | null;
    if (requestedLocationId === undefined) {
      locationIds = activeLocations.map((l) => l.id);
      referenceTimezone = activeLocations[0]?.timezone ?? null;
    } else {
      const match = activeLocations.find((l) => l.id === requestedLocationId);
      if (!match) {
        throw new NotFoundException();
      }
      locationIds = [match.id];
      referenceTimezone = match.timezone;
    }

    const statusPreset = input.statusPreset ?? 'active';
    const statuses = resolveStatusPreset(statusPreset);
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.max(input.offset ?? 0, 0);
    const { from, to } = resolveDateRange(input.datePreset ?? 'today', referenceTimezone);
    const isRefundFailedPreset = statusPreset === 'refund_failed';

    const { rows, total } = await this.feedRepo.list({
      tenantId,
      brandId,
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

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function zonedMidnightUtc(reference: Date, timeZone: string): Date {
  const dateKey = formatDateKeyInTimeZone(reference, timeZone);
  const guess = new Date(`${dateKey}T00:00:00.000Z`);

  const wallClock = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(guess);
  const get = (type: string): number =>
    Number(wallClock.find((p) => p.type === type)?.value ?? '0');
  const hour = get('hour');

  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    hour === 24 ? 0 : hour,
    get('minute'),
    get('second'),
  );
  const offsetMs = asUtc - guess.getTime();
  return new Date(guess.getTime() - offsetMs);
}

function formatDateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (!year || !month || !day) {
    throw new Error(`resolveDateRange: could not format a date key for timeZone=${timeZone}.`);
  }
  return `${year}-${month}-${day}`;
}
