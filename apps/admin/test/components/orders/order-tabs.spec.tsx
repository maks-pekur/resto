import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-i18next');
  return {
    ...actual,
    useTranslation: (_ns?: string, opts?: { keyPrefix?: string }) => ({
      t: (key: string) => (opts?.keyPrefix ? `${opts.keyPrefix}.${key}` : key),
      i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
  };
});

const { OrderStatusTabs, OrderFulfillmentTabs } = await import('@/components/orders/order-tabs');

const COUNTS = {
  unaccepted: 3,
  accepted: 1,
  preparing: 0,
  ready: 2,
  completed: 12,
  canceled: 0,
};

describe('OrderStatusTabs', () => {
  it('carries the count of every tab, not just the one in view', () => {
    render(
      <OrderStatusTabs
        value="unaccepted"
        onChange={vi.fn()}
        counts={COUNTS}
        refundFailedCount={0}
      />,
    );

    expect(screen.getByRole('tab', { name: /orders\.tabs\.unaccepted 3/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /orders\.tabs\.completed 12/ })).toBeInTheDocument();
  });

  it('hides the failed-refund tab while nothing is stuck', () => {
    render(
      <OrderStatusTabs
        value="unaccepted"
        onChange={vi.fn()}
        counts={COUNTS}
        refundFailedCount={0}
      />,
    );

    expect(screen.queryByRole('tab', { name: /refundFailed/ })).not.toBeInTheDocument();
  });

  it('offers the failed-refund tab as soon as one is', () => {
    render(
      <OrderStatusTabs
        value="unaccepted"
        onChange={vi.fn()}
        counts={COUNTS}
        refundFailedCount={2}
      />,
    );

    expect(screen.getByRole('tab', { name: /refundFailed 2/ })).toBeInTheDocument();
  });

  it('reports the tab the operator picked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <OrderStatusTabs
        value="unaccepted"
        onChange={onChange}
        counts={null}
        refundFailedCount={0}
      />,
    );

    await user.click(screen.getByRole('tab', { name: /orders\.tabs\.ready/ }));

    expect(onChange).toHaveBeenCalledWith('ready');
  });
});

describe('OrderFulfillmentTabs', () => {
  it('reports the type the operator picked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OrderFulfillmentTabs value="all" onChange={onChange} />);

    await user.click(screen.getByRole('tab', { name: 'orders.tabs.delivery' }));

    expect(onChange).toHaveBeenCalledWith('delivery');
  });
});
