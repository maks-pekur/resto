import { afterEach, describe, expect, it } from 'vitest';

// In Vitest, import.meta.env is a mutable object — we can set PROD/DEV/VITE_*
// directly to simulate different runtime modes.
const metaEnv = import.meta.env as Record<string, unknown>;

const saveEnv = () => ({ ...metaEnv });
const restoreEnv = (saved: Record<string, unknown>) => {
  for (const key of Object.keys(metaEnv)) Reflect.deleteProperty(metaEnv, key);
  Object.assign(metaEnv, saved);
};

describe('getEnv (G-05 fail-loud)', () => {
  let saved: Record<string, unknown>;

  afterEach(() => {
    restoreEnv(saved);
  });

  it('returns dev default when VITE_PUBLIC_APEX_DOMAIN is unset in DEV mode', async () => {
    saved = saveEnv();
    metaEnv.PROD = false;
    metaEnv.DEV = true;
    delete metaEnv.VITE_PUBLIC_APEX_DOMAIN;

    const { getEnv } = await import('@/env');
    expect(getEnv('VITE_PUBLIC_APEX_DOMAIN')).toBe('localhost:3002');
  });

  it('throws when a required var is empty in PROD mode', async () => {
    saved = saveEnv();
    metaEnv.PROD = true;
    metaEnv.DEV = false;
    metaEnv.VITE_STRIPE_PUBLISHABLE_KEY = '';

    const { getEnv } = await import('@/env');
    expect(() => getEnv('VITE_STRIPE_PUBLISHABLE_KEY')).toThrow(/Missing required env var/);
  });

  it('throws when a required var is a localhost URL in PROD mode (G-05)', async () => {
    saved = saveEnv();
    metaEnv.PROD = true;
    metaEnv.DEV = false;
    metaEnv.VITE_STRIPE_PUBLISHABLE_KEY = 'http://localhost:3000';

    const { getEnv } = await import('@/env');
    expect(() => getEnv('VITE_STRIPE_PUBLISHABLE_KEY')).toThrow(/localhost/);
  });

  it('returns the real value in PROD mode', async () => {
    saved = saveEnv();
    metaEnv.PROD = true;
    metaEnv.DEV = false;
    metaEnv.VITE_STRIPE_PUBLISHABLE_KEY = 'pk_live_abc123';

    const { getEnv } = await import('@/env');
    expect(getEnv('VITE_STRIPE_PUBLISHABLE_KEY')).toBe('pk_live_abc123');
  });
});
