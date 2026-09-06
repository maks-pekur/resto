import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

// The worker suite runs under `@vitest-environment node` (native fetch/Request/AbortSignal
// collide with jsdom's own AbortController otherwise), where none of the DOM globals below exist.
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

  if (typeof Element.prototype.hasPointerCapture === 'undefined') {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (typeof Element.prototype.setPointerCapture === 'undefined') {
    Element.prototype.setPointerCapture = () => {};
  }
  if (typeof Element.prototype.releasePointerCapture === 'undefined') {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (typeof Element.prototype.scrollIntoView === 'undefined') {
    Element.prototype.scrollIntoView = () => {};
  }

  // JSDOM 25 has no window.scrollTo; TanStack Router's scroll restoration calls it on every
  // navigation and jsdom answers with a stack trace on stderr for each one.
  window.scrollTo = () => {};
}
