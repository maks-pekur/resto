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

if (typeof globalThis.ResizeObserver === 'undefined') {
  const noop = (): void => {
    return;
  };
  class ResizeObserverStub {
    readonly observe = noop;
    readonly unobserve = noop;
    readonly disconnect = noop;
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}

vi.mock('next-intl', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('next-intl');
  return {
    ...actual,
    useTranslations: (_namespace?: string) => (key: string) => key,
    useLocale: () => 'en',
  };
});

vi.mock('next-intl/server', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('next-intl/server');
  return {
    ...actual,
    getTranslations: (_namespace?: string) => Promise.resolve((key: string) => key),
    getLocale: () => Promise.resolve('en'),
    getMessages: () => Promise.resolve({}),
  };
});
