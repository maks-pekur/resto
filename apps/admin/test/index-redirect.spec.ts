import { describe, expect, it } from 'vitest';
import { resolveIndexRedirectSlug } from '../src/routes/index';
import type { MeBrandsResponse, MeResponse } from '../src/lib/queries/identity';

const brand = (id: string, slug: string): MeBrandsResponse['brands'][number] => ({
  id,
  slug,
  displayName: slug,
});

const op = (activeBrandId?: string | null): MeResponse => ({
  kind: 'operator',
  activeBrandId,
});

describe('resolveIndexRedirectSlug', () => {
  it('returns null when there are no brands', () => {
    expect(resolveIndexRedirectSlug(op('brand-1'), [])).toBeNull();
  });

  it('redirects to the active brand when activeBrandId matches', () => {
    const brands = [brand('b-1', 'first'), brand('b-2', 'second')];
    expect(resolveIndexRedirectSlug(op('b-2'), brands)).toBe('second');
  });

  it('falls back to brands[0] when activeBrandId does not match any brand', () => {
    const brands = [brand('b-1', 'first'), brand('b-2', 'second')];
    expect(resolveIndexRedirectSlug(op('unknown-id'), brands)).toBe('first');
  });

  it('falls back to brands[0] when activeBrandId is null', () => {
    const brands = [brand('b-1', 'first'), brand('b-2', 'second')];
    expect(resolveIndexRedirectSlug(op(null), brands)).toBe('first');
  });

  it('falls back to brands[0] when activeBrandId is undefined', () => {
    const brands = [brand('b-1', 'first'), brand('b-2', 'second')];
    expect(resolveIndexRedirectSlug(op(undefined), brands)).toBe('first');
  });

  it('falls back to brands[0] when me is null', () => {
    const brands = [brand('b-1', 'first')];
    expect(resolveIndexRedirectSlug(null, brands)).toBe('first');
  });
});
