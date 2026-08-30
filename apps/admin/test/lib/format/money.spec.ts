import { describe, expect, it } from 'vitest';
import { formatMoney } from '@/lib/format/money';

describe('formatMoney', () => {
  it('reads a decimal string as money, not as a float', () => {
    expect(formatMoney('1200.00', 'EUR', 'en-US')).toBe('€1,200.00');
  });

  it('groups digits the way the operator expects, currency unchanged', () => {
    expect(formatMoney('1200.00', 'EUR', 'de-DE')).toContain('1.200,00');
  });

  it('drops the fraction for currencies that have none', () => {
    expect(formatMoney('1200', 'JPY', 'en-US')).toBe('¥1,200');
  });

  it('still shows the number when the currency code is not one Intl knows', () => {
    expect(formatMoney('10.00', 'XYZZY', 'en-US')).toBe('10.00 XYZZY');
  });

  it('says nothing rather than NaN when the amount is not a number', () => {
    expect(formatMoney('not-money', 'EUR', 'en-US')).toBe('—');
  });
});
