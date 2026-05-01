import { describe, expect, it } from 'vitest';
import {
  Currency,
  LocalizedText,
  Money,
  MoneyAmount,
  PriceDelta,
  Slug,
  TENANT_RESERVED_SLUGS,
  TenantSlug,
} from '../src';

describe('MoneyAmount', () => {
  it.each(['0', '0.0', '0.00', '12', '12.3', '12.34', '1234567890.99'])('accepts %s', (v) => {
    expect(MoneyAmount.parse(v)).toBe(v);
  });

  it.each(['-1', '0.123', '01', '.5', '1.', '', 'abc', '1,5'])('rejects %s', (v) => {
    expect(() => MoneyAmount.parse(v)).toThrow();
  });
});

describe('PriceDelta', () => {
  it.each(['0', '12.50', '-12.50', '-1'])('accepts %s', (v) => {
    expect(PriceDelta.parse(v)).toBe(v);
  });

  it.each(['-0', '-0.0', '-0.00', '--1', 'abc', ''])('rejects %s', (v) => {
    expect(() => PriceDelta.parse(v)).toThrow();
  });
});

describe('Currency', () => {
  it.each(['USD', 'EUR', 'UAH'])('accepts %s', (v) => {
    expect(Currency.parse(v)).toBe(v);
  });

  it.each(['usd', 'US', 'USDX', 'U$D', ''])('rejects %s', (v) => {
    expect(() => Currency.parse(v)).toThrow();
  });
});

describe('Money', () => {
  it('accepts a well-formed amount + currency pair', () => {
    const v = Money.parse({ amount: '12.34', currency: 'USD' });
    expect(v).toEqual({ amount: '12.34', currency: 'USD' });
  });

  it('rejects mismatched amount format', () => {
    expect(() => Money.parse({ amount: '12.345', currency: 'USD' })).toThrow();
  });

  it('rejects mismatched currency format', () => {
    expect(() => Money.parse({ amount: '12.34', currency: 'usd' })).toThrow();
  });
});

describe('LocalizedText', () => {
  it('accepts a valid record', () => {
    const v = LocalizedText.parse({ en: 'Pizza', 'pt-BR': 'Pizza' });
    expect(v).toEqual({ en: 'Pizza', 'pt-BR': 'Pizza' });
  });

  it.each([
    {},
    { EN: 'Pizza' },
    { 'en-us': 'Pizza' },
    { en: '' },
    { en: 'Pizza', english: 'Pizza' },
  ])('rejects %j', (v) => {
    expect(() => LocalizedText.parse(v)).toThrow();
  });
});

describe('Slug', () => {
  it.each(['pizza', 'pizza-margherita', 'a1', '0', 'a'])('accepts %s', (v) => {
    expect(Slug.parse(v)).toBe(v);
  });

  it.each(['', '-pizza', 'Pizza', 'pizza margherita', 'piz_za', 'пицца'])('rejects %s', (v) => {
    expect(() => Slug.parse(v)).toThrow();
  });
});

describe('TenantSlug', () => {
  it.each(['acme', 'acme-pizza', 'a1b', 'a'.repeat(64)])('accepts %s', (v) => {
    expect(TenantSlug.parse(v)).toBe(v);
  });

  it.each(['ab', 'a-', '-a', 'Acme', 'acme--pizza' + '-'.repeat(70), 'piz za'])(
    'rejects %s by format',
    (v) => {
      expect(() => TenantSlug.parse(v)).toThrow();
    },
  );

  it('rejects reserved slugs', () => {
    for (const reserved of TENANT_RESERVED_SLUGS) {
      expect(() => TenantSlug.parse(reserved)).toThrow();
    }
  });
});
