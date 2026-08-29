import { describe, expect, it } from 'vitest';
import {
  MENU_CACHE_CONTROL,
  MENU_CACHE_S_MAXAGE_SECONDS,
  MENU_CACHE_STALE_WHILE_REVALIDATE_SECONDS,
  MENU_IMAGE_URL_TTL_SECONDS,
} from '../../../src/contexts/catalog/domain/menu-cache';

describe('menu cache contract', () => {
  it('signs photo URLs to outlive the oldest servable copy of the menu', () => {
    const oldestServableDocument =
      MENU_CACHE_S_MAXAGE_SECONDS + MENU_CACHE_STALE_WHILE_REVALIDATE_SECONDS;
    expect(MENU_IMAGE_URL_TTL_SECONDS).toBeGreaterThan(oldestServableDocument);
  });

  it('leaves a guest at least half an hour of reading before the photos expire', () => {
    const oldestServableDocument =
      MENU_CACHE_S_MAXAGE_SECONDS + MENU_CACHE_STALE_WHILE_REVALIDATE_SECONDS;
    expect(MENU_IMAGE_URL_TTL_SECONDS - oldestServableDocument).toBeGreaterThanOrEqual(1800);
  });

  it('keeps the menu publicly cacheable', () => {
    expect(MENU_CACHE_CONTROL).toContain('public');
    expect(MENU_CACHE_CONTROL).not.toContain('no-store');
    expect(MENU_CACHE_CONTROL).not.toContain('private');
  });
});
