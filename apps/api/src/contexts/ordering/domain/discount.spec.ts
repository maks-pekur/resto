import { describe, expect, it } from 'vitest';
import { applyDiscount } from './discount';
import type { OrderLineDraft } from './discount';

const line = (itemId: string, categoryId: string, lineTotal: number): OrderLineDraft => ({
  itemId,
  categoryId,
  lineTotal,
});

const lines = [
  line('item-a', 'cat-x', 5000),
  line('item-b', 'cat-y', 3000),
  line('item-c', 'cat-x', 2000),
];

describe('applyDiscount — null spec', () => {
  it('returns 0 when spec is null', () => {
    expect(applyDiscount(lines, null)).toBe(0);
  });
});

describe('applyDiscount — percentage/cart', () => {
  it('computes 10% off the whole cart', () => {
    expect(applyDiscount(lines, { kind: 'percentage', scope: 'cart', pct: 10 })).toBe(1000);
  });

  it('returns an integer (no floats)', () => {
    const result = applyDiscount([line('a', 'c', 1001)], {
      kind: 'percentage',
      scope: 'cart',
      pct: 10,
    });
    expect(Number.isInteger(result)).toBe(true);
  });
});

describe('applyDiscount — percentage/item', () => {
  it('applies only to matching itemId', () => {
    expect(
      applyDiscount(lines, { kind: 'percentage', scope: 'item', itemId: 'item-a', pct: 20 }),
    ).toBe(1000);
  });

  it('returns 0 when no line matches', () => {
    expect(
      applyDiscount(lines, { kind: 'percentage', scope: 'item', itemId: 'item-z', pct: 20 }),
    ).toBe(0);
  });
});

describe('applyDiscount — percentage/category', () => {
  it('applies only to lines in matching category', () => {
    expect(
      applyDiscount(lines, {
        kind: 'percentage',
        scope: 'category',
        categoryId: 'cat-x',
        pct: 15,
      }),
    ).toBe(1050);
  });
});

describe('applyDiscount — fixed/cart', () => {
  it('returns the fixed amount when below cart total', () => {
    expect(applyDiscount(lines, { kind: 'fixed', scope: 'cart', amountMinorUnits: 500 })).toBe(500);
  });

  it('clamps to cart total when fixed amount exceeds it', () => {
    expect(applyDiscount(lines, { kind: 'fixed', scope: 'cart', amountMinorUnits: 20000 })).toBe(
      10000,
    );
  });
});

describe('applyDiscount — fixed/item', () => {
  it('applies to the matching item line and clamps to its total', () => {
    expect(
      applyDiscount(lines, {
        kind: 'fixed',
        scope: 'item',
        itemId: 'item-b',
        amountMinorUnits: 500,
      }),
    ).toBe(500);
  });

  it('clamps to item line total when fixed amount exceeds it', () => {
    expect(
      applyDiscount(lines, {
        kind: 'fixed',
        scope: 'item',
        itemId: 'item-b',
        amountMinorUnits: 99999,
      }),
    ).toBe(3000);
  });
});

describe('applyDiscount — fixed/category', () => {
  it('applies to lines in matching category', () => {
    expect(
      applyDiscount(lines, {
        kind: 'fixed',
        scope: 'category',
        categoryId: 'cat-y',
        amountMinorUnits: 500,
      }),
    ).toBe(500);
  });

  it('clamps to category eligible total when fixed amount exceeds it', () => {
    expect(
      applyDiscount(lines, {
        kind: 'fixed',
        scope: 'category',
        categoryId: 'cat-y',
        amountMinorUnits: 9999,
      }),
    ).toBe(3000);
  });
});

describe('applyDiscount — clamp guards', () => {
  it('never returns a negative value (percentage > 100)', () => {
    const result = applyDiscount([line('x', 'c', 1000)], {
      kind: 'percentage',
      scope: 'cart',
      pct: 200,
    });
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBe(1000);
  });

  it('never returns more than the eligible base', () => {
    const result = applyDiscount([line('x', 'c', 500)], {
      kind: 'fixed',
      scope: 'cart',
      amountMinorUnits: 999999,
    });
    expect(result).toBe(500);
  });
});
