import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TenantAwareDb } from '@resto/db';
import { TenantId } from '@resto/domain';
import { type EventEnvelope } from '@resto/events';
import { RecordAuditService } from '../../../src/contexts/audit/application/record-audit.service';

const TENANT_UUID = TenantId.parse('00000000-0000-4000-8000-000000000010');

const buildEnvelope = (overrides: Partial<EventEnvelope> = {}): EventEnvelope => ({
  id: '00000000-0000-4000-8000-000000000001',
  type: 'tenancy.tenant_provisioned.v1',
  version: 1,
  tenantId: TENANT_UUID,
  correlationId: '00000000-0000-4000-8000-000000000020',
  causationId: null,
  occurredAt: new Date('2026-05-08T00:00:00Z'),
  payload: {
    tenantId: TENANT_UUID,
    slug: 'cafe-roma',
    displayName: 'Cafe Roma',
    defaultCurrency: 'USD',
  },
  ...overrides,
});

describe('RecordAuditService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('inserts a projected row from a tenant_provisioned envelope', async () => {
    const insert = vi.fn();
    const db = {
      withoutTenant: vi.fn(async (_reason: string, fn: (tx: unknown) => Promise<unknown>) => {
        return fn({ insert: () => ({ values: insert }) });
      }),
    } as unknown as TenantAwareDb;

    const service = new RecordAuditService(db);
    const envelope = buildEnvelope();
    await service.fromEnvelope(envelope);

    expect(db.withoutTenant).toHaveBeenCalledTimes(1);
    expect(db.withoutTenant).toHaveBeenCalledWith(
      'audit consumer: tenancy.tenant_provisioned.v1',
      expect.any(Function),
    );
    expect(insert).toHaveBeenCalledTimes(1);
    const inserted = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.tenantId).toBe(envelope.tenantId);
    expect(inserted.action).toBe('tenancy.tenant_provisioned.v1');
    expect(inserted.actorKind).toBe('system');
    expect(inserted.actorSubject).toBe('system');
    expect(inserted.targetType).toBe('tenant');
    expect(inserted.targetId).toBe(envelope.tenantId);
    expect(inserted.correlationId).toBe(envelope.correlationId);
    expect(inserted.occurredAt).toEqual(envelope.occurredAt);
    expect(inserted.payload).toEqual(envelope.payload);
  });

  it('uses payload.actorSubject when present', async () => {
    const insert = vi.fn();
    const db = {
      withoutTenant: vi.fn(async (_reason: string, fn: (tx: unknown) => Promise<unknown>) => {
        return fn({ insert: () => ({ values: insert }) });
      }),
    } as unknown as TenantAwareDb;

    const service = new RecordAuditService(db);
    const envelope = buildEnvelope({
      type: 'identity.signed_in.v1',
      payload: {
        userId: '00000000-0000-4000-8000-0000000000aa',
        actorSubject: '00000000-0000-4000-8000-0000000000aa',
      },
    });
    await service.fromEnvelope(envelope);

    const inserted = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.actorSubject).toBe('00000000-0000-4000-8000-0000000000aa');
    expect(inserted.targetType).toBe('user');
    expect(inserted.targetId).toBe('00000000-0000-4000-8000-0000000000aa');
  });

  it('passes a null tenantId straight through (platform-level events)', async () => {
    const insert = vi.fn();
    const db = {
      withoutTenant: vi.fn(async (_reason: string, fn: (tx: unknown) => Promise<unknown>) => {
        return fn({ insert: () => ({ values: insert }) });
      }),
    } as unknown as TenantAwareDb;

    const service = new RecordAuditService(db);
    const envelope = buildEnvelope({ tenantId: null });
    await service.fromEnvelope(envelope);

    const inserted = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.tenantId).toBeNull();
  });

  it('threads ipAddress and userAgent from payload into the row', async () => {
    const insert = vi.fn();
    const db = {
      withoutTenant: vi.fn(async (_reason: string, fn: (tx: unknown) => Promise<unknown>) => {
        return fn({ insert: () => ({ values: insert }) });
      }),
    } as unknown as TenantAwareDb;

    const service = new RecordAuditService(db);
    const envelope = buildEnvelope({
      type: 'identity.signed_in.v1',
      payload: {
        userId: '00000000-0000-4000-8000-0000000000aa',
        tenantId: '00000000-0000-4000-8000-000000000010',
        ipAddress: '203.0.113.7',
        userAgent: 'Mozilla/5.0 (Test)',
      },
    });
    await service.fromEnvelope(envelope);

    const inserted = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.ipAddress).toBe('203.0.113.7');
    expect(inserted.userAgent).toBe('Mozilla/5.0 (Test)');
    expect(inserted.targetType).toBe('user');
    expect(inserted.targetId).toBe('00000000-0000-4000-8000-0000000000aa');
  });

  it('fromEnvelopeWithTx writes via the passed tx (skips withoutTenant)', async () => {
    const insert = vi.fn();
    const db = {
      // If fromEnvelopeWithTx accidentally calls withoutTenant, the test fails
      // because this mock returns void instead of running the callback.
      withoutTenant: vi.fn(),
    } as unknown as TenantAwareDb;
    const tx = { insert: () => ({ values: insert }) } as unknown as Parameters<
      Parameters<TenantAwareDb['withoutTenant']>[1]
    >[0];

    const service = new RecordAuditService(db);
    const envelope = buildEnvelope();
    await service.fromEnvelopeWithTx(envelope, tx);

    expect(db.withoutTenant).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledTimes(1);
    const inserted = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.action).toBe('tenancy.tenant_provisioned.v1');
  });
});
