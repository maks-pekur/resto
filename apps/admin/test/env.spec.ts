import { describe, expect, it, afterEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const PROD_VARS = {
  NODE_ENV: 'production',
  NEXT_PUBLIC_API_ORIGIN: 'https://api.example.com',
  ADMIN_WEB_URL: 'https://admin.example.com',
  INTERNAL_API_TOKEN: 'prod-internal-token-with-enough-chars',
  ACTIVE_BRAND_COOKIE_SECRET: 'prod-active-brand-secret-32chars!!',
} as const;

const snapshot = { ...process.env };

const resetEnv = (next: Record<string, string | undefined>): void => {
  for (const k of Object.keys(process.env)) {
    Reflect.deleteProperty(process.env, k);
  }
  for (const [k, v] of Object.entries(next)) {
    if (v !== undefined) process.env[k] = v;
  }
};

interface EnvModule {
  readonly apiOrigin: () => string;
  readonly adminOrigin: () => string;
  readonly internalApiToken: () => string;
  readonly activeBrandCookieSecret: () => string;
}

const loadFresh = async (): Promise<EnvModule> => {
  vi.resetModules();
  const mod = (await import('../lib/env')) as unknown as EnvModule;
  return mod;
};

afterEach(() => {
  resetEnv(snapshot);
  vi.resetModules();
});

describe('apps/admin lib/env', () => {
  it('throws in production when NEXT_PUBLIC_API_ORIGIN is missing', async () => {
    resetEnv({ ...PROD_VARS, NEXT_PUBLIC_API_ORIGIN: undefined });
    await expect(loadFresh()).rejects.toThrow(/NEXT_PUBLIC_API_ORIGIN/);
  });

  it('throws in production when ADMIN_WEB_URL is missing', async () => {
    resetEnv({ ...PROD_VARS, ADMIN_WEB_URL: undefined });
    await expect(loadFresh()).rejects.toThrow(/ADMIN_WEB_URL/);
  });

  it('throws in production when INTERNAL_API_TOKEN is missing', async () => {
    resetEnv({ ...PROD_VARS, INTERNAL_API_TOKEN: undefined });
    await expect(loadFresh()).rejects.toThrow(/INTERNAL_API_TOKEN/);
  });

  it('throws in production when ACTIVE_BRAND_COOKIE_SECRET is missing', async () => {
    resetEnv({ ...PROD_VARS, ACTIVE_BRAND_COOKIE_SECRET: undefined });
    await expect(loadFresh()).rejects.toThrow(/ACTIVE_BRAND_COOKIE_SECRET/);
  });

  it('throws in production when ACTIVE_BRAND_COOKIE_SECRET is shorter than 32 chars', async () => {
    resetEnv({ ...PROD_VARS, ACTIVE_BRAND_COOKIE_SECRET: 'short' });
    await expect(loadFresh()).rejects.toThrow(/ACTIVE_BRAND_COOKIE_SECRET/);
  });

  it('throws in production when NEXT_PUBLIC_API_ORIGIN is not a URL', async () => {
    resetEnv({ ...PROD_VARS, NEXT_PUBLIC_API_ORIGIN: 'not-a-url' });
    await expect(loadFresh()).rejects.toThrow(/NEXT_PUBLIC_API_ORIGIN/);
  });

  it('uses dev defaults in development when vars are missing', async () => {
    resetEnv({ NODE_ENV: 'development' });
    const env = await loadFresh();
    expect(env.apiOrigin()).toMatch(/^http:\/\/localhost:3000/);
    expect(env.adminOrigin()).toMatch(/^http:\/\/localhost:3001/);
    expect(env.internalApiToken().length).toBeGreaterThanOrEqual(16);
    expect(env.activeBrandCookieSecret().length).toBeGreaterThanOrEqual(32);
  });

  it('uses test defaults when NODE_ENV=test and vars are missing', async () => {
    resetEnv({ NODE_ENV: 'test' });
    const env = await loadFresh();
    expect(env.apiOrigin()).toMatch(/^http:\/\/localhost:3000/);
    expect(env.adminOrigin()).toMatch(/^http:\/\/localhost:3001/);
    expect(env.internalApiToken().length).toBeGreaterThanOrEqual(16);
    expect(env.activeBrandCookieSecret().length).toBeGreaterThanOrEqual(32);
  });

  it('honors explicit values over dev defaults in development', async () => {
    resetEnv({
      NODE_ENV: 'development',
      NEXT_PUBLIC_API_ORIGIN: 'http://api.dev.local',
      ADMIN_WEB_URL: 'http://admin.dev.local',
    });
    const env = await loadFresh();
    expect(env.apiOrigin()).toBe('http://api.dev.local');
    expect(env.adminOrigin()).toBe('http://admin.dev.local');
  });

  it('loads cleanly in production when all required vars are present', async () => {
    resetEnv(PROD_VARS);
    const env = await loadFresh();
    expect(env.apiOrigin()).toBe(PROD_VARS.NEXT_PUBLIC_API_ORIGIN);
    expect(env.adminOrigin()).toBe(PROD_VARS.ADMIN_WEB_URL);
    expect(env.internalApiToken()).toBe(PROD_VARS.INTERNAL_API_TOKEN);
    expect(env.activeBrandCookieSecret()).toBe(PROD_VARS.ACTIVE_BRAND_COOKIE_SECRET);
  });
});
