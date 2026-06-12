import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createCheckoutSchema } from '@/lib/checkout-schema';
import { AddressInput } from '@/components/checkout/address-input';
import { OrderTimeSelector, type OrderTime } from '@/components/checkout/order-time-selector';

describe('checkout schema', () => {
  const valid = { name: 'Ann', phone: '+1 555 123 4567', orderTime: { kind: 'asap' as const } };

  it('requires a non-empty name', () => {
    expect(createCheckoutSchema('pickup').safeParse({ ...valid, name: '' }).success).toBe(false);
  });

  it('requires a valid phone', () => {
    expect(createCheckoutSchema('pickup').safeParse({ ...valid, phone: 'abc' }).success).toBe(
      false,
    );
    expect(createCheckoutSchema('pickup').safeParse(valid).success).toBe(true);
  });

  it('requires an address in delivery mode but not in pickup mode', () => {
    expect(createCheckoutSchema('delivery').safeParse(valid).success).toBe(false);
    expect(
      createCheckoutSchema('delivery').safeParse({ ...valid, address: '123 Main St' }).success,
    ).toBe(true);
    expect(createCheckoutSchema('pickup').safeParse(valid).success).toBe(true);
  });

  it('requires a time when order time is scheduled', () => {
    expect(
      createCheckoutSchema('pickup').safeParse({
        ...valid,
        orderTime: { kind: 'scheduled', at: '' },
      }).success,
    ).toBe(false);
    expect(
      createCheckoutSchema('pickup').safeParse({
        ...valid,
        orderTime: { kind: 'scheduled', at: '2026-01-01T10:00' },
      }).success,
    ).toBe(true);
  });
});

describe('AddressInput', () => {
  it('shows the green zone-valid badge on blur with a non-empty address', () => {
    render(<AddressInput value="123 Main St" onChange={() => undefined} />);
    fireEvent.blur(screen.getByLabelText('Delivery address'));
    expect(screen.getByText('We deliver to this area')).toBeDefined();
  });
});

describe('OrderTimeSelector', () => {
  function Harness() {
    const [value, setValue] = useState<OrderTime>({ kind: 'asap' });
    return <OrderTimeSelector value={value} onChange={setValue} />;
  }

  it('reveals the time input only when scheduled is chosen', () => {
    render(<Harness />);
    expect(screen.queryByLabelText('Scheduled time')).toBeNull();
    fireEvent.click(screen.getByLabelText('Schedule for later'));
    expect(screen.getByLabelText('Scheduled time')).toBeDefined();
  });
});
