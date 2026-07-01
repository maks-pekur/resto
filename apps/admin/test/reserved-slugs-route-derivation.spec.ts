/**
 * D-06 real route↔reserved coupling.
 *
 * Enumerates the ACTUAL assembled root-route segments from the live router
 * (apps/admin/src/main.tsx) and asserts each static first-path-segment is in
 * RESERVED_SLUG_SET from @resto/domain.
 *
 * Failure mode this catches: a developer adds a new root route (e.g.
 * /billing) and wires it into main.tsx WITHOUT adding "billing" to
 * RESERVED_SLUGS — this spec turns RED even though the domain constant was
 * never touched.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { RESERVED_SLUG_SET } from '@resto/domain';

vi.mock('react-dom/client', () => ({
  createRoot: () => ({ render: vi.fn() }),
}));

vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({})),
}));

beforeAll(() => {
  if (!document.getElementById('root')) {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
  }
});

type RouteEntry = { fullPath?: string };

describe('D-06 admin route tree — every static root segment is reserved', () => {
  it('all static first-path-segments of the assembled router are in RESERVED_SLUG_SET', async () => {
    const { router } = await import('../src/main');

    const routes = Object.values(router.routesById as Record<string, RouteEntry>);

    const staticRootSegments = new Set<string>();

    for (const route of routes) {
      const fullPath = route?.fullPath ?? '';

      if (!fullPath || fullPath === '/') continue;

      const stripped = fullPath.replace(/^\//, '');
      const firstSegment = stripped.split('/')[0];

      if (!firstSegment) continue;
      if (firstSegment.startsWith('$')) continue;
      if (firstSegment.startsWith('(')) continue;
      if (firstSegment.startsWith('_')) continue;

      const normalized = firstSegment.toLowerCase();
      staticRootSegments.add(normalized);
    }

    expect(
      staticRootSegments.size,
      'router must expose at least one static root segment',
    ).toBeGreaterThan(0);

    for (const segment of staticRootSegments) {
      expect(
        RESERVED_SLUG_SET.has(segment),
        `route first-segment "${segment}" (from assembled router fullPath) must be in RESERVED_SLUG_SET`,
      ).toBe(true);
    }
  });
});
