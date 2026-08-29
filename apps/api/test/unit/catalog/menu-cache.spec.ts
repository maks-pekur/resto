import { describe, expect, it } from 'vitest';
import {
  MENU_AVAILABILITY_CACHE_CONTROL,
  MENU_CACHE_CONTROL,
  MENU_AVAILABILITY_S_MAXAGE_SECONDS,
  MENU_CACHE_S_MAXAGE_SECONDS,
} from '../../../src/contexts/catalog/domain/menu-cache';

describe('menu cache contract', () => {
  it('keeps the menu publicly cacheable', () => {
    expect(MENU_CACHE_CONTROL).toContain('public');
    expect(MENU_CACHE_CONTROL).not.toContain('no-store');
    expect(MENU_CACHE_CONTROL).not.toContain('private');
  });

  it('caches availability far more briefly than the menu — a stop must surface fast', () => {
    expect(MENU_AVAILABILITY_S_MAXAGE_SECONDS).toBeLessThan(MENU_CACHE_S_MAXAGE_SECONDS);
    expect(MENU_AVAILABILITY_CACHE_CONTROL).toContain('public');
  });
});
