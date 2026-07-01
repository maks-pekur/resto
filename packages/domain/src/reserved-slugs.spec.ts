import { describe, it, expect } from 'vitest';
import { ADMIN_ROOT_ROUTE_SEGMENTS, RESERVED_SLUG_SET } from './reserved-slugs';
import { BrandSlugValue } from './brand-slug';

describe('ADMIN_ROOT_ROUTE_SEGMENTS drift gate', () => {
  it('every admin root segment is in RESERVED_SLUG_SET', () => {
    for (const seg of ADMIN_ROOT_ROUTE_SEGMENTS) {
      expect(RESERVED_SLUG_SET.has(seg), `"${seg}" must be in RESERVED_SLUG_SET`).toBe(true);
    }
  });
});

describe('newly reserved admin route words are rejected by BrandSlugValue', () => {
  it.each(['onboarding', 'forgot-password', 'reset-password', 'accept-invitation'])(
    '"%s" is rejected',
    (word) => {
      expect(BrandSlugValue.safeParse(word).success).toBe(false);
    },
  );

  it('a normal slug still passes', () => {
    expect(BrandSlugValue.safeParse('my-cafe').success).toBe(true);
  });
});
