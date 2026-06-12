'use client';

import { useCartStore, selectSubtotal, type CartLineItem } from '@resto/cart';

function parseMinorUnits(value: string): number {
  const [whole = '0', frac = ''] = value.split('.');
  const fracPadded = frac.padEnd(2, '0').slice(0, 2);
  return parseInt(whole, 10) * 100 + parseInt(fracPadded, 10);
}

function formatMinorUnits(minor: number): string {
  const whole = Math.floor(minor / 100);
  const frac = Math.abs(minor % 100)
    .toString()
    .padStart(2, '0');
  return `${whole.toString()}.${frac}`;
}

function lineTotal(item: CartLineItem): string {
  let cost = parseMinorUnits(item.unitPrice);
  for (const mod of item.modifiers) {
    cost += parseMinorUnits(mod.priceDelta);
  }
  return formatMinorUnits(cost * item.quantity);
}

export function OrderSummary() {
  const items = useCartStore((s) => s.items);
  const mode = useCartStore((s) => s.mode);
  const subtotal = useCartStore(selectSubtotal);
  const currency = items[0]?.currency ?? '';

  return (
    <div className="rounded-lg border p-4">
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={`${item.itemId}:${item.sizeId ?? 'base'}`}
            className="flex items-center justify-between text-[14px] leading-[1.4]"
          >
            <span className="min-w-0 truncate">
              {item.quantity} × {item.name}
            </span>
            <span className="tabular-nums">
              {lineTotal(item)} {currency}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center justify-between border-t pt-3 text-[16px] font-semibold">
        <span>Subtotal</span>
        <span className="tabular-nums">
          {subtotal} {currency}
        </span>
      </div>

      {mode === 'delivery' ? (
        <div className="mt-1 flex items-center justify-between text-[14px] text-[oklch(0.45_0_0)]">
          <span>Delivery fee</span>
          <span className="tabular-nums">Calculated at delivery</span>
        </div>
      ) : null}
    </div>
  );
}
