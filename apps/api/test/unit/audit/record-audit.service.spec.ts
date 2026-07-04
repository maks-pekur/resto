import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RestoTx } from '@resto/db';
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

const buildTx = (insert: ReturnType<typeof vi.fn>): RestoTx =>
  ({ insert: () => ({ values: insert }) }) as unknown as RestoTx;

describe('RecordAuditService.fromEnvelopeWithTx', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('inserts a projected row from a tenant_provisioned envelope', async () => {
    const insert = vi.fn();
    const service = new RecordAuditService();
    const envelope = buildEnvelope();
    await service.fromEnvelopeWithTx(envelope, buildTx(insert));

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
    const service = new RecordAuditService();
    const envelope = buildEnvelope({
      type: 'identity.signed_in.v1',
      payload: {
        userId: '00000000-0000-4000-8000-0000000000aa',
        actorSubject: '00000000-0000-4000-8000-0000000000aa',
      },
    });
    await service.fromEnvelopeWithTx(envelope, buildTx(insert));

    const inserted = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.actorSubject).toBe('00000000-0000-4000-8000-0000000000aa');
    expect(inserted.targetType).toBe('user');
    expect(inserted.targetId).toBe('00000000-0000-4000-8000-0000000000aa');
  });

  it('projects a null-tenant platform envelope with a null tenantId', async () => {
    const insert = vi.fn();
    const service = new RecordAuditService();
    const envelope = buildEnvelope({ tenantId: null });
    await service.fromEnvelopeWithTx(envelope, buildTx(insert));

    const inserted = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.tenantId).toBeNull();
  });

  it('threads ipAddress and userAgent from payload into the row', async () => {
    const insert = vi.fn();
    const service = new RecordAuditService();
    const envelope = buildEnvelope({
      type: 'identity.signed_in.v1',
      payload: {
        userId: '00000000-0000-4000-8000-0000000000aa',
        tenantId: '00000000-0000-4000-8000-000000000010',
        ipAddress: '203.0.113.7',
        userAgent: 'Mozilla/5.0 (Test)',
      },
    });
    await service.fromEnvelopeWithTx(envelope, buildTx(insert));

    const inserted = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.ipAddress).toBe('203.0.113.7');
    expect(inserted.userAgent).toBe('Mozilla/5.0 (Test)');
    expect(inserted.targetType).toBe('user');
    expect(inserted.targetId).toBe('00000000-0000-4000-8000-0000000000aa');
  });

  it('projects identity.email_dispatch_failed.v1 with targetType=platform (AUTH-10 / D-05)', async () => {
    const insert = vi.fn();
    const service = new RecordAuditService();
    const envelope = buildEnvelope({
      type: 'identity.email_dispatch_failed.v1',
      tenantId: null,
      payload: {
        reason: 'dlq_routed',
        originalSubject: 'identity.signed_in.v1',
        redeliveryCount: 4,
        errorMessage: 'malformed envelope',
      },
    });
    await service.fromEnvelopeWithTx(envelope, buildTx(insert));

    const inserted = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.action).toBe('identity.email_dispatch_failed.v1');
    expect(inserted.targetType).toBe('platform');
    expect(inserted.targetId).toBeNull();
    expect(inserted.tenantId).toBeNull();
  });

  it('projects identity.role_created.v1 with targetType=role and targetId=roleSlug (D-16 08.3)', async () => {
    const insert = vi.fn();
    const service = new RecordAuditService();
    const envelope = buildEnvelope({
      type: 'identity.role_created.v1',
      payload: {
        tenantId: TENANT_UUID,
        roleSlug: 'manager',
        permission: { menu: ['read'] },
        actorUserId: '00000000-0000-4000-8000-0000000000bb',
      },
    });
    await service.fromEnvelopeWithTx(envelope, buildTx(insert));

    const inserted = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.targetType).toBe('role');
    expect(inserted.targetId).toBe('manager');
    expect(inserted.actorSubject).toBe('00000000-0000-4000-8000-0000000000bb');
  });

  it('projects identity.role_permissions_changed.v1 with targetType=role (D-16 08.3)', async () => {
    const insert = vi.fn();
    const service = new RecordAuditService();
    const envelope = buildEnvelope({
      type: 'identity.role_permissions_changed.v1',
      payload: {
        tenantId: TENANT_UUID,
        roleSlug: 'cashier',
        previousPermission: { menu: ['read'] },
        newPermission: { menu: ['read', 'update'] },
        actorUserId: '00000000-0000-4000-8000-0000000000bb',
      },
    });
    await service.fromEnvelopeWithTx(envelope, buildTx(insert));

    const inserted = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.targetType).toBe('role');
    expect(inserted.targetId).toBe('cashier');
  });

  it('projects identity.role_deleted.v1 with targetType=role (D-16 08.3)', async () => {
    const insert = vi.fn();
    const service = new RecordAuditService();
    const envelope = buildEnvelope({
      type: 'identity.role_deleted.v1',
      payload: {
        tenantId: TENANT_UUID,
        roleSlug: 'kitchen',
        actorUserId: '00000000-0000-4000-8000-0000000000bb',
      },
    });
    await service.fromEnvelopeWithTx(envelope, buildTx(insert));

    const inserted = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.targetType).toBe('role');
    expect(inserted.targetId).toBe('kitchen');
  });
});
