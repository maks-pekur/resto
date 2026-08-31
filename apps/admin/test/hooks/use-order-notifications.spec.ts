import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useOrderNotifications } from '@/hooks/use-order-notifications';
import type { OrderFeedRowApi } from '@/lib/queries/orders';

const makeRow = (id: string): OrderFeedRowApi => ({
  id,
  shortNumber: 7,
  status: 'placed',
  locationId: 'loc-1',
  locationName: 'Central',
  orderType: 'dine_in',
  tableIdentifier: null,
  tableZoneName: null,
  tableNumber: null,
  customerName: null,
  customerPhone: null,
  paymentType: 'online',
  paymentState: 'paid',
  total: '1200.00',
  currency: 'UAH',
  itemCount: 1,
  channel: 'site',
  createdAt: new Date().toISOString(),
  acceptedAt: null,
  preparingAt: null,
  readyAt: null,
  completedAt: null,
  canceledAt: null,
  etaAt: null,
  cancelReason: null,
  canceledFromStatus: null,
  hasFailedRefund: false,
});

const message = () => ({ title: 'New order', body: '1200 UAH' });

const constructed: { title: string; options?: NotificationOptions }[] = [];

const installNotification = (permission: NotificationPermission, requested = permission) => {
  class FakeNotification {
    static permission: NotificationPermission = permission;
    static requestPermission = vi.fn(() => Promise.resolve(requested));
    readonly title: string;
    constructor(title: string, options?: NotificationOptions) {
      this.title = title;
      constructed.push({ title, ...(options ? { options } : {}) });
    }
  }
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    writable: true,
    value: FakeNotification,
  });
  return FakeNotification;
};

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
};

beforeEach(() => {
  constructed.length = 0;
  setVisibility('hidden');
});

afterEach(() => {
  Reflect.deleteProperty(window, 'Notification');
  setVisibility('visible');
  vi.restoreAllMocks();
});

describe('useOrderNotifications', () => {
  it('reports a browser without the API as unsupported', () => {
    Reflect.deleteProperty(window, 'Notification');

    const { result } = renderHook(() => useOrderNotifications([], message));

    expect(result.current.permission).toBe('unsupported');
  });

  it('says nothing about orders that were already on screen', () => {
    installNotification('granted');

    renderHook(() => useOrderNotifications([makeRow('order-1')], message));

    expect(constructed).toHaveLength(0);
  });

  it('raises one notification for an order that arrives while the tab is hidden', () => {
    installNotification('granted');

    const { rerender } = renderHook(({ rows }) => useOrderNotifications(rows, message), {
      initialProps: { rows: [] as readonly OrderFeedRowApi[] },
    });
    rerender({ rows: [makeRow('order-1')] });

    expect(constructed).toHaveLength(1);
    expect(constructed[0]?.title).toBe('New order');
  });

  it('stays quiet while the operator is looking at the feed', () => {
    installNotification('granted');
    setVisibility('visible');

    const { rerender } = renderHook(({ rows }) => useOrderNotifications(rows, message), {
      initialProps: { rows: [] as readonly OrderFeedRowApi[] },
    });
    rerender({ rows: [makeRow('order-1')] });

    expect(constructed).toHaveLength(0);
  });

  it('stays quiet until permission is actually granted', () => {
    installNotification('default');

    const { rerender } = renderHook(({ rows }) => useOrderNotifications(rows, message), {
      initialProps: { rows: [] as readonly OrderFeedRowApi[] },
    });
    rerender({ rows: [makeRow('order-1')] });

    expect(constructed).toHaveLength(0);
  });

  it('asks the browser once and keeps the answer', async () => {
    const Fake = installNotification('default', 'granted');

    const { result } = renderHook(() => useOrderNotifications([], message));
    result.current.request();
    await vi.waitFor(() => {
      expect(result.current.permission).toBe('granted');
    });

    expect(Fake.requestPermission).toHaveBeenCalledTimes(1);
  });
});
