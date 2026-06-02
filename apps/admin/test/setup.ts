import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import messages from '@/lib/i18n/messages/ru.json';

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
  const noop = (): void => {
    /* stub */
  };
  class ResizeObserverStub {
    readonly observe = noop;
    readonly unobserve = noop;
    readonly disconnect = noop;
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}

type MessageNode = string | { readonly [k: string]: MessageNode };

const resolvePath = (root: MessageNode, path: string): MessageNode | undefined => {
  let node: MessageNode | undefined = root;
  for (const segment of path.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined;
    node = node[segment];
  }
  return node;
};

const findMatchingBrace = (s: string, from: number): number => {
  let depth = 0;
  for (let i = from; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
};

const resolvePlural = (
  template: string,
  varName: string,
  category: string,
  count: number,
): string | null => {
  const pluralOpen = template.indexOf(`{${varName}, plural,`);
  if (pluralOpen === -1) return null;
  const close = findMatchingBrace(template, pluralOpen);
  if (close === -1) return null;
  const body = template.slice(pluralOpen + `{${varName}, plural,`.length, close);
  const fallbackKey = '=' + count.toString();
  const keys = [fallbackKey, category, 'other'];
  for (const key of keys) {
    const re = new RegExp(`(?:^|\\s)${key}\\s*\\{`, 'g');
    const match = re.exec(body);
    if (!match) continue;
    const braceStart = body.indexOf('{', match.index);
    const braceEnd = findMatchingBrace(body, braceStart);
    if (braceEnd === -1) continue;
    const branch = body.slice(braceStart + 1, braceEnd).replace(/#/g, String(count));
    return template.slice(0, pluralOpen) + branch + template.slice(close + 1);
  }
  return null;
};

const applyVars = (template: string, vars?: Record<string, unknown>): string => {
  if (!vars) return template;
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    if (typeof v === 'number' && out.includes(`{${k}, plural,`)) {
      const pr = new Intl.PluralRules('ru');
      const category = pr.select(v);
      const resolved = resolvePlural(out, k, category, v);
      if (resolved !== null) out = resolved;
    }
    out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return out;
};

const buildTranslator = (namespace?: string) => {
  const root = messages as MessageNode;
  const scope = namespace ? resolvePath(root, namespace) : root;
  return (key: string, vars?: Record<string, unknown>): string => {
    const node = scope && typeof scope !== 'string' ? resolvePath(scope, key) : undefined;
    if (typeof node === 'string') return applyVars(node, vars);
    return namespace ? `${namespace}.${key}` : key;
  };
};

vi.mock('next-intl', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('next-intl');
  return {
    ...actual,
    useTranslations: (namespace?: string) => buildTranslator(namespace),
    useLocale: () => 'ru',
  };
});

vi.mock('next-intl/server', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('next-intl/server');
  return {
    ...actual,
    getTranslations: (namespace?: string) => Promise.resolve(buildTranslator(namespace)),
    getLocale: () => Promise.resolve('ru'),
    getMessages: () => Promise.resolve(messages),
  };
});
