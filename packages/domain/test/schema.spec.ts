import { describe, expect, it } from 'vitest';
import { MenuCategory, MenuItem, MenuModifier, MenuVariant, Tenant, User } from '../src';

const UUID_A = '00000000-0000-4000-8000-000000000001';
const UUID_B = '00000000-0000-4000-8000-000000000002';
const UUID_C = '00000000-0000-4000-8000-000000000003';
const UUID_D = '00000000-0000-4000-8000-000000000004';
const NOW = new Date('2026-05-01T00:00:00.000Z');

const baseTimestamps = {
  createdAt: NOW,
  updatedAt: NOW,
  archivedAt: null,
};

describe('Tenant', () => {
  const valid = {
    id: UUID_A,
    slug: 'acme',
    displayName: 'Acme Pizza',
    status: 'active' as const,
    locale: 'en',
    defaultCurrency: 'USD',
    stripeAccountId: null,
    ...baseTimestamps,
  };

  it('parses a valid tenant', () => {
    expect(Tenant.parse(valid)).toEqual(valid);
  });

  it('rejects a reserved slug', () => {
    expect(() => Tenant.parse({ ...valid, slug: 'admin' })).toThrow();
  });

  it('rejects an unknown status', () => {
    expect(() => Tenant.parse({ ...valid, status: 'pending' })).toThrow();
  });

  it('rejects a non-uuid id', () => {
    expect(() => Tenant.parse({ ...valid, id: 'not-a-uuid' })).toThrow();
  });
});

describe('User', () => {
  const valid = {
    id: UUID_B,
    tenantId: UUID_A,
    keycloakSubject: 'kc-sub-123',
    email: 'manager@acme.test',
    displayName: 'Acme Manager',
    role: 'manager' as const,
    ...baseTimestamps,
  };

  it('parses a valid user', () => {
    expect(User.parse(valid)).toEqual(valid);
  });

  it('rejects an invalid email', () => {
    expect(() => User.parse({ ...valid, email: 'not-an-email' })).toThrow();
  });

  it('rejects an unknown role', () => {
    expect(() => User.parse({ ...valid, role: 'cashier' })).toThrow();
  });
});

describe('MenuCategory', () => {
  const valid = {
    id: UUID_B,
    tenantId: UUID_A,
    slug: 'pizza',
    name: { en: 'Pizza', ru: 'Пицца' },
    description: null,
    sortOrder: 0,
    ...baseTimestamps,
  };

  it('parses a valid category', () => {
    expect(MenuCategory.parse(valid)).toEqual(valid);
  });

  it('rejects an empty localized name', () => {
    expect(() => MenuCategory.parse({ ...valid, name: {} })).toThrow();
  });

  it('rejects a negative sort order', () => {
    expect(() => MenuCategory.parse({ ...valid, sortOrder: -1 })).toThrow();
  });
});

describe('MenuItem', () => {
  const valid = {
    id: UUID_C,
    tenantId: UUID_A,
    categoryId: UUID_B,
    slug: 'margherita',
    name: { en: 'Margherita' },
    description: null,
    basePrice: '12.50',
    currency: 'USD',
    imageS3Key: 'menu/margherita.webp',
    allergens: ['gluten', 'dairy'],
    status: 'published' as const,
    sortOrder: 1,
    ...baseTimestamps,
  };

  it('parses a valid item', () => {
    expect(MenuItem.parse(valid)).toEqual(valid);
  });

  it('rejects a non-decimal base price', () => {
    expect(() => MenuItem.parse({ ...valid, basePrice: '12.345' })).toThrow();
  });

  it('rejects a negative base price', () => {
    expect(() => MenuItem.parse({ ...valid, basePrice: '-1' })).toThrow();
  });

  it('rejects a lowercase currency', () => {
    expect(() => MenuItem.parse({ ...valid, currency: 'usd' })).toThrow();
  });
});

describe('MenuVariant', () => {
  const valid = {
    id: UUID_D,
    tenantId: UUID_A,
    menuItemId: UUID_C,
    name: { en: 'Large' },
    priceDelta: '2.50',
    isDefault: false,
    sortOrder: 0,
    ...baseTimestamps,
  };

  it('parses a valid variant', () => {
    expect(MenuVariant.parse(valid)).toEqual(valid);
  });

  it('accepts a signed price delta', () => {
    const v = { ...valid, priceDelta: '-1.00' };
    expect(MenuVariant.parse(v)).toEqual(v);
  });

  it('rejects "-0" as price delta', () => {
    expect(() => MenuVariant.parse({ ...valid, priceDelta: '-0' })).toThrow();
  });
});

describe('MenuModifier', () => {
  const valid = {
    id: UUID_C,
    tenantId: UUID_A,
    name: { en: 'Toppings' },
    minSelectable: 0,
    maxSelectable: 3,
    isRequired: false,
    ...baseTimestamps,
  };

  it('parses a valid modifier', () => {
    expect(MenuModifier.parse(valid)).toEqual(valid);
  });

  it('rejects max < min', () => {
    expect(() => MenuModifier.parse({ ...valid, minSelectable: 3, maxSelectable: 1 })).toThrow();
  });

  it('rejects negative selectable bounds', () => {
    expect(() => MenuModifier.parse({ ...valid, minSelectable: -1 })).toThrow();
  });
});
