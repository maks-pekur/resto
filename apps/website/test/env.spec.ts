import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('env loader', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('applies DEV_DEFAULTS in test/development when vars are missing', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_API_ORIGIN', '');
    vi.stubEnv('WEBSITE_URL', '');
    vi.resetModules();

    const { apiOrigin, websiteUrl } = await import('@/lib/env');
    expect(apiOrigin()).toBe('http://localhost:5001');
    expect(websiteUrl()).toBe('http://localhost:3002');
  });

  it('throws WebsiteEnvValidationError in production when vars are missing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_ORIGIN', '');
    vi.stubEnv('WEBSITE_URL', '');
    vi.resetModules();

    await expect(import('@/lib/env')).rejects.toThrow();
  });

  it('throws WebsiteEnvValidationError in production when NEXT_PUBLIC_API_ORIGIN is the localhost dev-default (G-05)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_ORIGIN', 'http://localhost:3000');
    vi.stubEnv('WEBSITE_URL', 'https://resto.app');
    vi.resetModules();

    await expect(import('@/lib/env')).rejects.toThrow(/localhost/i);
  });

  it('throws WebsiteEnvValidationError in production when WEBSITE_URL is localhost (G-05)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_ORIGIN', 'https://api.resto.app');
    vi.stubEnv('WEBSITE_URL', 'http://localhost:3002');
    vi.resetModules();

    await expect(import('@/lib/env')).rejects.toThrow(/localhost/i);
  });

  it('accepts real HTTPS origins in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_ORIGIN', 'https://api.resto.app');
    vi.stubEnv('WEBSITE_URL', 'https://resto.app');
    vi.resetModules();

    const { apiOrigin, websiteUrl } = await import('@/lib/env');
    expect(apiOrigin()).toBe('https://api.resto.app');
    expect(websiteUrl()).toBe('https://resto.app');
  });

  it('does NOT expose INTERNAL_API_TOKEN', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.resetModules();

    const envModule = await import('@/lib/env');
    expect('internalApiToken' in envModule).toBe(false);
    expect('INTERNAL_API_TOKEN' in envModule).toBe(false);
  });

  it('internalApiOrigin() returns API_INTERNAL_ORIGIN when set (07.5-14)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_ORIGIN', 'https://api.resto.app');
    vi.stubEnv('WEBSITE_URL', 'https://resto.app');
    vi.stubEnv('API_INTERNAL_ORIGIN', 'http://api:3000');
    vi.resetModules();

    const { internalApiOrigin } = await import('@/lib/env');
    expect(internalApiOrigin()).toBe('http://api:3000');
  });

  it('internalApiOrigin() falls back to NEXT_PUBLIC_API_ORIGIN when unset (07.5-14)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_ORIGIN', 'https://api.resto.app');
    vi.stubEnv('WEBSITE_URL', 'https://resto.app');
    vi.stubEnv('API_INTERNAL_ORIGIN', '');
    vi.resetModules();

    const { internalApiOrigin } = await import('@/lib/env');
    expect(internalApiOrigin()).toBe('https://api.resto.app');
  });

  it('accepts a Compose service name for API_INTERNAL_ORIGIN — not localhost (07.5-14)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_ORIGIN', 'https://api.resto.app');
    vi.stubEnv('WEBSITE_URL', 'https://resto.app');
    vi.stubEnv('API_INTERNAL_ORIGIN', 'http://api:3000');
    vi.resetModules();

    await expect(import('@/lib/env')).resolves.toBeDefined();
  });

  it('throws WebsiteEnvValidationError in production when API_INTERNAL_ORIGIN is localhost (G-05, 07.5-14)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_ORIGIN', 'https://api.resto.app');
    vi.stubEnv('WEBSITE_URL', 'https://resto.app');
    vi.stubEnv('API_INTERNAL_ORIGIN', 'http://localhost:5001');
    vi.resetModules();

    await expect(import('@/lib/env')).rejects.toThrow(/localhost/i);
  });
});
