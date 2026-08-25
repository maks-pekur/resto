import { describe, expect, it } from 'vitest';
import {
  ALL_LOCATIONS_SUB_PATH,
  locationHref,
  locationSubPath,
  resolveLocationRoute,
} from '../src/lib/location-path';
import type { PinnableLocation } from '../src/lib/queries/locations';

const voskresenka: PinnableLocation = { id: 'loc-v', name: 'Воскресенка', slug: 'voskresenka' };
const podil: PinnableLocation = { id: 'loc-p', name: 'Podil', slug: 'podil' };
const locations = [voskresenka, podil];

describe('resolveLocationRoute', () => {
  it('resolves a slug the operator holds', () => {
    expect(resolveLocationRoute(locations, 'podil', '/podil/orders')).toEqual({
      kind: 'resolved',
      location: podil,
    });
  });

  it('keeps the page when the slug is unknown, only swapping in the default location', () => {
    // The regression this guards: sending a mistyped address to the dashboard, so the operator
    // loses the screen they asked for as well as the location.
    expect(resolveLocationRoute(locations, 'nowhere', '/nowhere/orders')).toEqual({
      kind: 'redirect',
      href: '/podil/orders',
    });
  });

  it("treats another member's location as unknown — /v1/me/locations is the whole world", () => {
    expect(resolveLocationRoute([voskresenka], 'podil', '/podil/stop-list')).toEqual({
      kind: 'redirect',
      href: '/voskresenka/stop-list',
    });
  });

  it('falls back to the dashboard when the slug alone was the whole address', () => {
    expect(resolveLocationRoute(locations, 'nowhere', '/nowhere')).toEqual({
      kind: 'redirect',
      href: `/podil${ALL_LOCATIONS_SUB_PATH}`,
    });
  });

  it('reports no-locations rather than inventing a redirect target', () => {
    expect(resolveLocationRoute([], 'voskresenka', '/voskresenka/orders')).toEqual({
      kind: 'no-locations',
    });
  });

  it('picks the alphabetically first location as the default (D-03)', () => {
    const result = resolveLocationRoute(locations, 'nowhere', '/nowhere/orders');
    expect(result).toEqual({ kind: 'redirect', href: '/podil/orders' });
  });
});

describe('locationSubPath', () => {
  it('strips the current slug so the page survives a switch', () => {
    expect(locationSubPath('/voskresenka/orders', 'voskresenka')).toBe('/orders');
    expect(locationSubPath('/voskresenka/stop-list', 'voskresenka')).toBe('/stop-list');
  });

  it('sends a slugless address to the dashboard — the only page with an every-location view', () => {
    expect(locationSubPath('/dashboard', undefined)).toBe('/dashboard');
  });

  it('does not strip a slug that merely prefixes the path', () => {
    expect(locationSubPath('/voskresenka-2/orders', 'voskresenka-2')).toBe('/orders');
  });
});

describe('locationHref', () => {
  it('prefixes the chosen slug', () => {
    expect(locationHref('podil', '/orders')).toBe('/podil/orders');
  });

  it('drops the slug entirely for the every-location view', () => {
    expect(locationHref(null, '/dashboard')).toBe('/dashboard');
  });
});
