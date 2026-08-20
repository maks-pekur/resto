import { describe, expect, it } from 'vitest';
import { TenantTheme } from '../src/tenant-theme';

describe('TenantTheme', () => {
  it('parses an empty object as a fully-null theme', () => {
    const result = TenantTheme.parse({});
    expect(result).toEqual({ logoUrl: null, primaryColor: null, font: null });
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
    expect(result).toEqual({ logoUrl: null, primaryColor: '#000000', font: null });
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
