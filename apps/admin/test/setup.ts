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

// JSDOM 25 lacks ResizeObserver; Radix popper (Sheet / AlertDialog) throws without this stub.
if (typeof globalThis.ResizeObserver === 'undefined') {
  const noop = (): void => {};
  class ResizeObserverStub {
    readonly observe = noop;
    readonly unobserve = noop;
    readonly disconnect = noop;
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}
