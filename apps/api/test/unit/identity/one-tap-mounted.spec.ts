import { describe, expect, it } from 'vitest';
import { buildAuth } from '../../../src/contexts/identity/infrastructure/better-auth/auth.config';

const routesOf = (google?: { clientId: string; clientSecret: string }): string[] => {
  const auth = buildAuth({
    authDb: { db: {} },
    secret: 'x'.repeat(32),
    baseUrl: 'https://resto.app',
    trustedOrigins: [],
    ...(google ? { google } : {}),
  } as never);
  return Object.keys((auth as { api: Record<string, unknown> }).api);
};

describe('one-tap is mounted with Google and absent without it', () => {
  it('exposes the one-tap callback when both credentials are configured', () => {
    expect(routesOf({ clientId: 'cid', clientSecret: 'sec' })).toContain('oneTapCallback');
  });

  it('exposes no one-tap route at all when Google is not configured', () => {
    expect(routesOf()).not.toContain('oneTapCallback');
  });

  it('still builds an auth instance without Google, so the app boots either way', () => {
    expect(routesOf().length).toBeGreaterThan(0);
  });
});
