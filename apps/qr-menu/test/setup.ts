import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Vitest does not auto-cleanup React Testing Library renders between
// tests; mount + unmount each test explicitly.
afterEach(cleanup);

const noop = (): void => undefined;

class ObserverStub {
  readonly observe = noop;
  readonly unobserve = noop;
  readonly disconnect = noop;
  readonly takeRecords = (): [] => [];
}

// The prod-bundle suite runs in the node environment, where none of this exists.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });

  const globals = globalThis as unknown as {
    IntersectionObserver: typeof IntersectionObserver;
    ResizeObserver: typeof ResizeObserver;
  };
  globals.IntersectionObserver = ObserverStub as unknown as typeof IntersectionObserver;
  globals.ResizeObserver = ObserverStub;
  Element.prototype.scrollIntoView = noop;
}
