import { describe, expect, it } from 'vitest';
import { isLocationScopedPath } from '../src/lib/location-scoped-paths';

describe('isLocationScopedPath', () => {
  // These read `?location=` and change what they show because of it.
  it.each(['/', '/dashboard', '/orders', '/menu/stop-list', '/menu/items', '/menu/items/abc'])(
    'treats %s as location-scoped',
    (path) => {
      expect(isLocationScopedPath(path)).toBe(true);
    },
  );

  // These are tenant-grain. The regression: the sidebar switcher used to write `?location=<uuid>`
  // onto them, so `/locations` looked like a filtered list of every location.
  it.each([
    '/locations',
    '/locations/new',
    '/locations/voskresenka',
    '/team',
    '/roles',
    '/settings',
    '/tenant',
    '/onboarding',
  ])('treats %s as tenant-grain', (path) => {
    expect(isLocationScopedPath(path)).toBe(false);
  });

  it('does not match a path that merely starts with the same letters', () => {
    expect(isLocationScopedPath('/ordersomething')).toBe(false);
    expect(isLocationScopedPath('/menu/itemsy')).toBe(false);
  });
});
