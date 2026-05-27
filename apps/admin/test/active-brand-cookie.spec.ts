import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const cookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      get: (name: string) => {
        const value = cookieStore.get(name);
        return value === undefined ? undefined : { name, value };
      },
    }),
  ),
}));

vi.mock('../lib/env', () => ({
  activeBrandCookieSecret: () => 'test-secret-AAAAAAAAAAAAAAAAAAAAAAAA',
}));

const { signActiveBrand, readActiveBrand } = await import('../lib/active-brand-cookie');

const install = (value: string | undefined): void => {
  cookieStore.clear();
  if (value !== undefined) cookieStore.set('resto.active_brand', value);
};

describe('active-brand-cookie — signActiveBrand', () => {
  beforeEach(() => {
    cookieStore.clear();
  });

  it('returns slug.signature shape with a single separator and non-empty signature', () => {
    const out = signActiveBrand('demo-brand');
    const dot = out.indexOf('.');
    expect(dot).toBe('demo-brand'.length);
    expect(out.startsWith('demo-brand.')).toBe(true);
    const sig = out.slice(dot + 1);
    expect(sig.length).toBeGreaterThan(0);
    expect(sig).toMatch(/^[A-Za-z0-9_-]+$/u);
  });

  it('is deterministic for the same slug + secret', () => {
    expect(signActiveBrand('demo-brand')).toBe(signActiveBrand('demo-brand'));
  });

  it('produces different signatures for different slugs', () => {
    expect(signActiveBrand('a-b')).not.toBe(signActiveBrand('c-d'));
  });
});

describe('active-brand-cookie — readActiveBrand', () => {
  beforeEach(() => {
    cookieStore.clear();
  });

  it('returns the slug for a freshly-signed cookie roundtrip', async () => {
    install(signActiveBrand('demo-brand'));
    await expect(readActiveBrand()).resolves.toBe('demo-brand');
  });

  it('returns null when the cookie is absent', async () => {
    install(undefined);
    await expect(readActiveBrand()).resolves.toBeNull();
  });

  it('returns null for an empty cookie value', async () => {
    install('');
    await expect(readActiveBrand()).resolves.toBeNull();
  });

  it('returns null for a malformed cookie value with no separator', async () => {
    install('just-a-slug');
    await expect(readActiveBrand()).resolves.toBeNull();
  });

  it('returns null when the slug segment was tampered (signature now belongs to another slug)', async () => {
    const signed = signActiveBrand('demo-brand');
    const sig = signed.slice(signed.indexOf('.') + 1);
    install(`other-brand.${sig}`);
    await expect(readActiveBrand()).resolves.toBeNull();
  });

  it('returns null when the signature segment was tampered (appended char)', async () => {
    const signed = signActiveBrand('demo-brand');
    install(`${signed}x`);
    await expect(readActiveBrand()).resolves.toBeNull();
  });

  it('returns null when the signature segment is empty', async () => {
    install('demo-brand.');
    await expect(readActiveBrand()).resolves.toBeNull();
  });

  it('returns null for a valid HMAC over an underscore-containing slug (BrandSlug regex rejects)', async () => {
    install(signActiveBrand('invalid_slug_with_underscore'));
    await expect(readActiveBrand()).resolves.toBeNull();
  });

  it('returns null for a valid HMAC over a leading-hyphen slug', async () => {
    install(signActiveBrand('-bad-start'));
    await expect(readActiveBrand()).resolves.toBeNull();
  });

  it('returns null for a valid HMAC over a sub-3-char slug', async () => {
    install(signActiveBrand('ab'));
    await expect(readActiveBrand()).resolves.toBeNull();
  });
});
