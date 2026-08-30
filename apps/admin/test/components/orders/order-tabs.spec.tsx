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

const { OrderStatusTabs, OrderTypeTabs } = await import('@/components/orders/order-tabs');

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
    render(<OrderStatusTabs value="unaccepted" onChange={vi.fn()} counts={COUNTS} />);

    expect(screen.getByRole('tab', { name: /orders\.tabs\.unaccepted 3/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /orders\.tabs\.completed 12/ })).toBeInTheDocument();
  });

  it('reports the tab the operator picked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OrderStatusTabs value="unaccepted" onChange={onChange} counts={null} />);

    await user.click(screen.getByRole('tab', { name: /orders\.tabs\.ready/ }));

    expect(onChange).toHaveBeenCalledWith('ready');
  });
});

describe('OrderTypeTabs', () => {
  it('reports the type the operator picked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OrderTypeTabs value="all" onChange={onChange} />);

    await user.click(screen.getByRole('tab', { name: 'orders.tabs.delivery' }));

    expect(onChange).toHaveBeenCalledWith('delivery');
  });

  it('offers the in-house tab, since a QR order is neither delivery nor pickup', () => {
    render(<OrderTypeTabs value="all" onChange={vi.fn()} />);

    expect(screen.getByRole('tab', { name: 'orders.tabs.dine_in' })).toBeInTheDocument();
  });
});
