import { describe, expect, it } from 'vitest';
import { TenantId } from '@resto/domain';
import { CapturedEmailAdapter } from '../../../src/contexts/identity/infrastructure/email/captured.adapter';

const tid = TenantId.parse('11111111-1111-1111-1111-111111111111');

describe('CapturedEmailAdapter', () => {
  it('adapterName is captured', () => {
    expect(new CapturedEmailAdapter().adapterName).toBe('captured');
  });

  it('verifyTransport is a no-op (resolves immediately)', async () => {
    await expect(new CapturedEmailAdapter().verifyTransport()).resolves.toBeUndefined();
  });

  it('captures invitations with their full payload', async () => {
    const a = new CapturedEmailAdapter();
    await a.sendInvitation({
      to: 'invitee@example.com',
      locale: 'en',
      url: 'https://admin.resto.app/accept/abc',
      tenantSlug: 'acme',
      inviterName: 'Alice',
      tenantId: tid,
    });
    const captured = a.getCaptured();
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      kind: 'invitation',
      to: 'invitee@example.com',
      tenantSlug: 'acme',
      inviterName: 'Alice',
      tenantId: tid,
    });
  });

  it('captures reset-password with optional tenantId omitted', async () => {
    const a = new CapturedEmailAdapter();
    await a.sendResetPassword({
      to: 'u@example.com',
      locale: 'ru',
      url: 'https://admin.resto.app/reset/xyz',
      userId: 'user-1',
    });
    const c = a.getCaptured()[0];
    expect(c?.kind).toBe('reset-password');
    expect((c as { tenantId?: string }).tenantId).toBeUndefined();
  });

  it('captures verification', async () => {
    const a = new CapturedEmailAdapter();
    await a.sendVerification({
      to: 'u@example.com',
      locale: 'en',
      url: 'https://admin.resto.app/verify/qq',
      userId: 'user-2',
    });
    expect(a.getCaptured()[0]?.kind).toBe('verification');
  });

  it('clear() drains the queue', async () => {
    const a = new CapturedEmailAdapter();
    await a.sendVerification({
      to: 'u@example.com',
      locale: 'en',
      url: 'https://x',
      userId: 'user-2',
    });
    expect(a.getCaptured()).toHaveLength(1);
    a.clear();
    expect(a.getCaptured()).toHaveLength(0);
  });

  it('getCaptured returns a snapshot — mutating it does not affect internal state', async () => {
    const a = new CapturedEmailAdapter();
    await a.sendVerification({
      to: 'u@example.com',
      locale: 'en',
      url: 'https://x',
      userId: 'u',
    });
    const snap = a.getCaptured() as unknown[];
    snap.length = 0;
    expect(a.getCaptured()).toHaveLength(1);
  });
});
