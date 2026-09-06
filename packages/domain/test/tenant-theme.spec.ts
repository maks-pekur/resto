import { describe, expect, it } from 'vitest';
import { TenantTheme, resolveThemeMedia } from '../src/tenant-theme';

describe('TenantTheme', () => {
  it('parses an empty object as a fully-null theme', () => {
    const result = TenantTheme.parse({});
    expect(result).toEqual({ logoUrl: null, primaryColor: null, font: null, coverUrls: [] });
  });

  it('accepts a fully-populated theme', () => {
    const result = TenantTheme.parse({
      logoUrl: 'https://cdn.example/logo.png',
      primaryColor: '#FF5733',
      font: 'Inter',
    });
    expect(result.logoUrl).toBe('https://cdn.example/logo.png');
    expect(result.primaryColor).toBe('#FF5733');
    expect(result.font).toBe('Inter');
  });

  it('coerces missing fields to null (not undefined)', () => {
    const result = TenantTheme.parse({ primaryColor: '#000000' });
    expect(result).toEqual({ logoUrl: null, primaryColor: '#000000', font: null, coverUrls: [] });
  });

  it('rejects a non-string logoUrl', () => {
    expect(() => TenantTheme.parse({ logoUrl: 42 })).toThrow();
  });

  it('rejects a primaryColor that is not a 7-char hex (#RRGGBB)', () => {
    expect(() => TenantTheme.parse({ primaryColor: 'red' })).toThrow();
    expect(() => TenantTheme.parse({ primaryColor: '#abc' })).toThrow();
    expect(() => TenantTheme.parse({ primaryColor: '#GGGGGG' })).toThrow();
  });

  it('strips unknown keys (forward-compatible)', () => {
    const result = TenantTheme.parse({ primaryColor: '#000000', extra: 'ignored' });
    expect(result).not.toHaveProperty('extra');
  });
});

describe('resolveThemeMedia', () => {
  const base = 'https://cdn.example.com/bucket';
  const key = 'public/tenant/c5f07f94-8739-4cbb-afbf-1757e4e6f722/brand/logo.svg';

  it('prefixes a stored media key with the current media host', () => {
    expect(resolveThemeMedia(key, base)).toBe(`${base}/${key}`);
  });

  it('follows the host when it changes, which a stored URL cannot', () => {
    expect(resolveThemeMedia(key, 'https://other.example')).toBe(`https://other.example/${key}`);
  });

  it('leaves a historic absolute URL untouched', () => {
    const legacy = 'https://old-host.example/media/bucket/public/tenant/x/brand/logo.svg';
    expect(resolveThemeMedia(legacy, base)).toBe(legacy);
  });

  it('tolerates a trailing slash on the base', () => {
    expect(resolveThemeMedia(key, `${base}/`)).toBe(`${base}/${key}`);
  });
});
