import { describe, it, expect } from 'vitest';
import { deriveOrderCardState, UNACCEPTED_ESCALATION_MS } from './order-card';
import type { OrderFeedRowApi } from '@/lib/queries/orders';

const baseRow: OrderFeedRowApi = {
  id: 'order-1',
  shortNumber: 42,
  status: 'paid',
  locationId: 'loc-1',
  locationName: 'Центр',
  fulfillmentMode: 'dine_in',
  tableIdentifier: null,
  tableZoneName: null,
  tableNumber: null,
  total: '1200.00',
  currency: 'RUB',
  itemCount: 3,
  channel: 'site',
  createdAt: new Date(0).toISOString(),
  acceptedAt: null,
  preparingAt: null,
  readyAt: null,
  completedAt: null,
  canceledAt: null,
  etaAt: null,
  cancelReason: null,
  canceledFromStatus: null,
  hasFailedRefund: false,
};

describe('deriveOrderCardState', () => {
  it('returns new for a just-paid, unaccepted order', () => {
    const now = UNACCEPTED_ESCALATION_MS - 1_000;
    expect(deriveOrderCardState(baseRow, now)).toBe('new');
  });

  it('escalates at the 5-minute threshold', () => {
    const now = UNACCEPTED_ESCALATION_MS;
    expect(deriveOrderCardState(baseRow, now)).toBe('escalated');
  });

  it('maps accepted/preparing/ready statuses directly', () => {
    expect(deriveOrderCardState({ ...baseRow, status: 'accepted' }, 0)).toBe('accepted');
    expect(deriveOrderCardState({ ...baseRow, status: 'preparing' }, 0)).toBe('preparing');
    expect(deriveOrderCardState({ ...baseRow, status: 'ready' }, 0)).toBe('ready');
  });

  it('buckets canceled/refunded/failed as canceled', () => {
    expect(deriveOrderCardState({ ...baseRow, status: 'canceled' }, 0)).toBe('canceled');
    expect(deriveOrderCardState({ ...baseRow, status: 'refunded' }, 0)).toBe('canceled');
    expect(deriveOrderCardState({ ...baseRow, status: 'failed' }, 0)).toBe('canceled');
  });

  it('defaults unrecognized statuses to completed', () => {
    expect(deriveOrderCardState({ ...baseRow, status: 'completed' }, 0)).toBe('completed');
    expect(deriveOrderCardState({ ...baseRow, status: 'created' }, 0)).toBe('completed');
  });

  it('never escalates once accepted, even past the threshold', () => {
    const row = { ...baseRow, status: 'accepted' as const, acceptedAt: new Date(0).toISOString() };
    expect(deriveOrderCardState(row, UNACCEPTED_ESCALATION_MS * 10)).toBe('accepted');
  });
});
