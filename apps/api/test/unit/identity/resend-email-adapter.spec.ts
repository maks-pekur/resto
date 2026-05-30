import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TenantId } from '@resto/domain';
import type { TenantAwareDb } from '@resto/db';
import type * as RestoEvents from '@resto/events';
import {
  ResendEmailAdapter,
  type ResendClientLike,
  type ResendDomainsResult,
  type ResendSendResult,
} from '../../../src/contexts/identity/infrastructure/email/resend.adapter';

const envFixture = {
  RESEND_FROM: 'RestOS <noreply@resto.app>',
  RESEND_REPLY_TO: 'support@resto.app',
};

const tid = TenantId.parse('33333333-3333-3333-3333-333333333333');

/**
 * Explicit, type-stable mock builders. Per the stall-trigger note in
 * <execution_recovery_context>: do NOT infer the union from a heterogeneous
 * array literal — the prior agent burned its budget on that. Spell out
 * the discriminated union per call and return a Promise of the union.
 */
const ok = (id = 'evt_123'): ResendSendResult => ({ data: { id }, error: null });
const err = (statusCode: number | null, message = 'fail'): ResendSendResult => ({
  data: null,
  error: { statusCode, message },
});
const domainsOk: ResendDomainsResult = { data: [], error: null };
const domainsErr = (statusCode: number, message = 'invalid_api_key'): ResendDomainsResult => ({
  data: null,
  error: { statusCode, message },
});

const buildMockClient = (
  responses: ResendSendResult[],
): {
  client: ResendClientLike;
  sendSpy: ReturnType<typeof vi.fn>;
  domainsListSpy: ReturnType<typeof vi.fn>;
} => {
  let i = 0;
  const sendSpy = vi.fn((): Promise<ResendSendResult> => {
    const r = responses[i++];
    if (!r) throw new Error('mock send exhausted');
    return Promise.resolve(r);
  });
  const domainsListSpy = vi.fn((): Promise<ResendDomainsResult> => Promise.resolve(domainsOk));
  const client: ResendClientLike = {
    emails: { send: sendSpy },
    domains: { list: domainsListSpy },
  };
  return { client, sendSpy, domainsListSpy };
};

const appendCalls: {
  envelope: { type: string; tenantId: string | null; payload: unknown };
}[] = [];
const withTenantIdSpy = vi.fn();
const withoutTenantSpy = vi.fn();
const captureAppend = (
  _tx: unknown,
  opts: { envelope: { type: string; tenantId: string | null; payload: unknown } },
): Promise<void> => {
  appendCalls.push(opts);
  return Promise.resolve();
};

vi.mock('@resto/events', async (importOriginal) => {
  const actual = await importOriginal<typeof RestoEvents>();
  return {
    ...actual,
    appendToOutbox: (tx: unknown, opts: { envelope: unknown }) =>
      captureAppend(
        tx,
        opts as { envelope: { type: string; tenantId: string | null; payload: unknown } },
      ),
  };
});

const mockDb = {
  withTenantId: async (id: string, op: (tx: unknown) => Promise<void>): Promise<void> => {
    withTenantIdSpy(id);
    await op({});
  },
  withoutTenant: async (reason: string, op: (tx: unknown) => Promise<void>): Promise<void> => {
    withoutTenantSpy(reason);
    await op({});
  },
} as unknown as TenantAwareDb;

describe('ResendEmailAdapter', () => {
  beforeEach(() => {
    appendCalls.length = 0;
    withTenantIdSpy.mockClear();
    withoutTenantSpy.mockClear();
  });

  it('adapterName is resend', () => {
    const { client } = buildMockClient([ok()]);
    const a = new ResendEmailAdapter(client, envFixture, mockDb);
    expect(a.adapterName).toBe('resend');
  });

  it('verifyTransport calls domains.list and resolves on 200', async () => {
    const { client, domainsListSpy } = buildMockClient([]);
    const a = new ResendEmailAdapter(client, envFixture, mockDb);
    await expect(a.verifyTransport()).resolves.toBeUndefined();
    expect(domainsListSpy).toHaveBeenCalledTimes(1);
  });

  it('verifyTransport throws on auth failure (401)', async () => {
    const { client } = buildMockClient([]);
    client.domains.list = vi.fn(
      (): Promise<ResendDomainsResult> => Promise.resolve(domainsErr(401)),
    );
    const a = new ResendEmailAdapter(client, envFixture, mockDb);
    await expect(a.verifyTransport()).rejects.toThrow(/invalid_api_key/);
  });

  it('sendInvitation: succeeds on first attempt → no outbox row', async () => {
    const { client, sendSpy } = buildMockClient([ok('e1')]);
    const a = new ResendEmailAdapter(client, envFixture, mockDb);
    await a.sendInvitation({
      to: 'i@x.com',
      locale: 'en',
      url: 'https://admin/accept/1',
      tenantSlug: 'acme',
      inviterName: 'Alice',
      tenantId: tid,
    });
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(appendCalls).toHaveLength(0);
    expect(withTenantIdSpy).not.toHaveBeenCalled();
  });

  it('sendInvitation: succeeds on attempt 2 after one 5xx → no terminal failure, no outbox row', async () => {
    const { client, sendSpy } = buildMockClient([err(503, 'gateway timeout'), ok('e2')]);
    const a = new ResendEmailAdapter(client, envFixture, mockDb);
    await a.sendInvitation({
      to: 'i@x.com',
      locale: 'en',
      url: 'https://admin/accept/2',
      tenantSlug: 'acme',
      inviterName: 'Alice',
      tenantId: tid,
    });
    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(appendCalls).toHaveLength(0);
  });

  it('sendInvitation: terminal on 5xx after all retries → emits identity.email_dispatch_failed.v1 via withTenantId, then rethrows', async () => {
    const { client, sendSpy } = buildMockClient([
      err(503, 'gw1'),
      err(503, 'gw2'),
      err(503, 'gw3'),
      err(503, 'gw4'),
    ]);
    const a = new ResendEmailAdapter(client, envFixture, mockDb);
    await expect(
      a.sendInvitation({
        to: 'i@x.com',
        locale: 'en',
        url: 'https://admin/accept/3',
        tenantSlug: 'acme',
        inviterName: 'Alice',
        tenantId: tid,
      }),
    ).rejects.toThrow(/exhausted retries/);
    expect(sendSpy).toHaveBeenCalledTimes(4);
    expect(appendCalls).toHaveLength(1);
    expect(appendCalls[0]?.envelope.type).toBe('identity.email_dispatch_failed.v1');
    expect(appendCalls[0]?.envelope.tenantId).toBe(tid);
    const payload = appendCalls[0]?.envelope.payload as {
      reason: string;
      originalSubject: string;
      tenantId?: string;
    };
    expect(payload.reason).toBe('resend_terminal_failure');
    expect(payload.originalSubject).toBe('invitation');
    expect(payload.tenantId).toBe(tid);
    expect(withTenantIdSpy).toHaveBeenCalledWith(tid);
    expect(withoutTenantSpy).not.toHaveBeenCalled();
  }, 20_000);

  it('sendInvitation: 429 treated as terminal (no retry) and outbox row written', async () => {
    const { client, sendSpy } = buildMockClient([err(429, 'rate_limited')]);
    const a = new ResendEmailAdapter(client, envFixture, mockDb);
    await expect(
      a.sendInvitation({
        to: 'i@x.com',
        locale: 'en',
        url: 'https://admin/accept/4',
        tenantSlug: 'acme',
        inviterName: 'Alice',
        tenantId: tid,
      }),
    ).rejects.toThrow(/terminal 429/);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(appendCalls).toHaveLength(1);
    const payload = appendCalls[0]?.envelope.payload as { reason: string };
    expect(payload.reason).toBe('resend_terminal_failure');
  });

  it('sendInvitation: any 4xx (e.g. 422 validation) terminates without retry', async () => {
    const { client, sendSpy } = buildMockClient([err(422, 'invalid_from_address')]);
    const a = new ResendEmailAdapter(client, envFixture, mockDb);
    await expect(
      a.sendInvitation({
        to: 'i@x.com',
        locale: 'en',
        url: 'https://admin/accept/5',
        tenantSlug: 'acme',
        inviterName: 'Alice',
        tenantId: tid,
      }),
    ).rejects.toThrow(/terminal 422/);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(appendCalls).toHaveLength(1);
  });

  it('total elapsed time on 4 attempts (3 retries) stays under 6 seconds', async () => {
    const { client } = buildMockClient([err(503), err(503), err(503), err(503)]);
    const a = new ResendEmailAdapter(client, envFixture, mockDb);
    const start = Date.now();
    await expect(
      a.sendInvitation({
        to: 'i@x.com',
        locale: 'en',
        url: 'https://admin/accept/6',
        tenantSlug: 'acme',
        inviterName: 'Alice',
        tenantId: tid,
      }),
    ).rejects.toThrow();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(6_000);
  }, 20_000);

  it('sendResetPassword with tenantId emits via withTenantId on terminal failure', async () => {
    const { client } = buildMockClient([err(404, 'not_found')]);
    const a = new ResendEmailAdapter(client, envFixture, mockDb);
    await expect(
      a.sendResetPassword({
        to: 'u@x.com',
        locale: 'en',
        url: 'https://admin/reset/q',
        userId: '44444444-4444-4444-4444-444444444444',
        tenantId: tid,
      }),
    ).rejects.toThrow(/terminal 404/);
    expect(appendCalls).toHaveLength(1);
    const payload = appendCalls[0]?.envelope.payload as {
      tenantId?: string;
      userId?: string;
      originalSubject: string;
    };
    expect(payload.tenantId).toBe(tid);
    expect(payload.userId).toBe('44444444-4444-4444-4444-444444444444');
    expect(payload.originalSubject).toBe('password_reset');
    expect(withTenantIdSpy).toHaveBeenCalledWith(tid);
    expect(withoutTenantSpy).not.toHaveBeenCalled();
  });

  it('sendVerification with tenantId=undefined emits via withoutTenant on terminal failure (BA pre-org-bind path)', async () => {
    const { client } = buildMockClient([err(422, 'invalid_to')]);
    const a = new ResendEmailAdapter(client, envFixture, mockDb);
    await expect(
      a.sendVerification({
        to: 'u@x.com',
        locale: 'en',
        url: 'https://admin/verify/q',
        userId: '55555555-5555-5555-5555-555555555555',
        tenantId: undefined,
      }),
    ).rejects.toThrow();
    expect(appendCalls).toHaveLength(1);
    expect(appendCalls[0]?.envelope.tenantId).toBeNull();
    const payload = appendCalls[0]?.envelope.payload as { tenantId?: string };
    expect(payload.tenantId).toBeUndefined();
    expect(withTenantIdSpy).not.toHaveBeenCalled();
    expect(withoutTenantSpy).toHaveBeenCalledWith(
      expect.stringContaining('email dispatch failure'),
    );
  });

  it('passes idempotencyKey to Resend SDK (per-flow scoped)', async () => {
    const { client, sendSpy } = buildMockClient([ok('id'), ok('id2'), ok('id3')]);
    const a = new ResendEmailAdapter(client, envFixture, mockDb);
    await a.sendInvitation({
      to: 'i@x.com',
      locale: 'en',
      url: 'https://x',
      tenantSlug: 'acme',
      inviterName: 'A',
      tenantId: tid,
    });
    await a.sendResetPassword({
      to: 'u@x.com',
      locale: 'en',
      url: 'https://x',
      userId: 'user-1',
      tenantId: tid,
    });
    await a.sendVerification({
      to: 'u@x.com',
      locale: 'en',
      url: 'https://x',
      userId: 'user-1',
      tenantId: undefined,
    });
    expect(sendSpy.mock.calls[0]?.[1]).toMatchObject({
      idempotencyKey: expect.stringContaining('invitation:'),
    });
    expect(sendSpy.mock.calls[1]?.[1]).toMatchObject({
      idempotencyKey: 'reset:user-1',
    });
    expect(sendSpy.mock.calls[2]?.[1]).toMatchObject({
      idempotencyKey: 'verification:user-1',
    });
  });

  it('network error (thrown Promise) is retried then emits terminal failure', async () => {
    const { client } = buildMockClient([]);
    const send = vi.fn((): Promise<ResendSendResult> => Promise.reject(new Error('ECONNRESET')));
    client.emails.send = send;
    const a = new ResendEmailAdapter(client, envFixture, mockDb);
    await expect(
      a.sendInvitation({
        to: 'i@x.com',
        locale: 'en',
        url: 'https://x',
        tenantSlug: 'acme',
        inviterName: 'A',
        tenantId: tid,
      }),
    ).rejects.toThrow(/ECONNRESET/);
    expect(send).toHaveBeenCalledTimes(4);
    expect(appendCalls).toHaveLength(1);
  }, 20_000);
});
