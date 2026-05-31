import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

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

// Plan 04b-05 Task 3: tests that exercise Radix Sheet / AlertDialog mount
// `<PopperContent>` which uses `useSize` → `ResizeObserver`. JSDOM 25 does
// not implement ResizeObserver, so popper effects throw inside other test
// files' setup phase when this constructor is referenced. Stub it.
if (typeof globalThis.ResizeObserver === 'undefined') {
  const noop = (): void => {
    /* JSDOM ResizeObserver stub — see comment above */
  };
  class ResizeObserverStub {
    readonly observe = noop;
    readonly unobserve = noop;
    readonly disconnect = noop;
  }
  // Assigning to the global is the simplest way to make it visible to
  // both `window` and module-scope references in Radix.
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}
