import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type * as AppModule from '../src/App';

const metaEnv = import.meta.env as Record<string, unknown>;

describe('qr-menu route parsing under the /qr base path', () => {
  let App: typeof AppModule;
  const savedBaseUrl = metaEnv.BASE_URL;

  beforeAll(async () => {
    metaEnv.BASE_URL = '/qr/';
    App = await import('../src/App');
  });

  afterAll(() => {
    metaEnv.BASE_URL = savedBaseUrl;
  });

  it('parses the token out of a base-prefixed sticker path', () => {
    expect(App.parseQrToken('/qr/t/abc123')).toBe('abc123');
  });

  it('parses the item id out of a base-prefixed item path', () => {
    expect(App.parseItemId('/qr/items/burger-1')).toBe('burger-1');
  });

  it('parses the document key out of a base-prefixed info path', () => {
    expect(App.parseDocumentKey('/qr/info/about')).toBe('about');
  });

  it('treats /qr/ and /qr as the menu root — no specific parser claims them', () => {
    for (const root of ['/qr/', '/qr']) {
      expect(App.parseItemId(root)).toBeNull();
      expect(App.parseDocumentKey(root)).toBeNull();
      expect(App.parseQrToken(root)).toBeNull();
    }
  });

  it('does not parse a sticker path missing the base prefix — the prefix is load-bearing', () => {
    expect(App.parseQrToken('/t/abc123')).toBeNull();
  });
});
