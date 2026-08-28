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

const noop = (): void => {
  return;
};

class ObserverStub {
  readonly observe = noop;
  readonly unobserve = noop;
  readonly disconnect = noop;
  readonly takeRecords = (): [] => [];
}

(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ObserverStub;
(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = ObserverStub;
Element.prototype.scrollIntoView = noop;

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('next/navigation');
  return {
    ...actual,
    useRouter: () => ({
      refresh: vi.fn(),
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
    }),
  };
});

vi.mock('next-intl', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('next-intl');
  const messages = (await import('../messages/en.json')).default;
  return {
    ...actual,
    useTranslations: (_namespace?: string) => (key: string) => key,
    useLocale: () => 'en',
    useMessages: () => messages,
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
