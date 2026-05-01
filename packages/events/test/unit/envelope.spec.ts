import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineEventContract, EventEnvelope } from '../../src/envelope';

const TENANT_UUID = '11111111-1111-4111-8111-111111111111';
const EVENT_UUID = '22222222-2222-4222-8222-222222222222';
const CORRELATION_UUID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-05-01T00:00:00.000Z');

const validEnvelope = {
  id: EVENT_UUID,
  type: 'tenancy.tenant_provisioned.v1',
  version: 1,
  tenantId: TENANT_UUID,
  correlationId: CORRELATION_UUID,
  causationId: null,
  occurredAt: NOW,
  payload: { foo: 'bar' },
};

describe('EventEnvelope', () => {
  it('parses a well-formed envelope', () => {
    expect(EventEnvelope.parse(validEnvelope)).toEqual(validEnvelope);
  });

  it('rejects a malformed type', () => {
    expect(() =>
      EventEnvelope.parse({ ...validEnvelope, type: 'TenancyTenantProvisioned' }),
    ).toThrow();
  });

  it('rejects a missing version suffix', () => {
    expect(() =>
      EventEnvelope.parse({ ...validEnvelope, type: 'tenancy.tenant_provisioned' }),
    ).toThrow();
  });

  it('rejects when version field disagrees with the type suffix', () => {
    expect(() =>
      EventEnvelope.parse({ ...validEnvelope, type: 'tenancy.tenant_provisioned.v2', version: 1 }),
    ).toThrow(/version 1 does not match/);
  });

  it('accepts a null tenantId for platform-level events', () => {
    const env = EventEnvelope.parse({ ...validEnvelope, tenantId: null });
    expect(env.tenantId).toBeNull();
  });

  it('rejects a non-uuid id', () => {
    expect(() => EventEnvelope.parse({ ...validEnvelope, id: 'not-a-uuid' })).toThrow();
  });

  it('coerces an ISO string occurredAt into a Date', () => {
    const env = EventEnvelope.parse({ ...validEnvelope, occurredAt: '2026-05-01T00:00:00Z' });
    expect(env.occurredAt).toBeInstanceOf(Date);
  });
});

describe('defineEventContract', () => {
  const TestEvent = defineEventContract({
    type: 'demo.test_event.v3',
    payload: z.object({ kind: z.literal('demo'), n: z.number().int() }),
  });

  it('derives version from the type suffix', () => {
    expect(TestEvent.version).toBe(3);
  });

  it('parses an envelope and narrows the payload', () => {
    const env = TestEvent.parse({
      id: EVENT_UUID,
      type: 'demo.test_event.v3',
      version: 3,
      tenantId: TENANT_UUID,
      correlationId: CORRELATION_UUID,
      causationId: null,
      occurredAt: NOW,
      payload: { kind: 'demo', n: 42 },
    });
    expect(env.payload.n).toBe(42);
  });

  it('rejects a payload that does not match the contract', () => {
    expect(() =>
      TestEvent.parse({
        id: EVENT_UUID,
        type: 'demo.test_event.v3',
        version: 3,
        tenantId: TENANT_UUID,
        correlationId: CORRELATION_UUID,
        causationId: null,
        occurredAt: NOW,
        payload: { kind: 'demo', n: 'not-a-number' },
      }),
    ).toThrow();
  });

  it('rejects an envelope whose type does not match the contract', () => {
    expect(() =>
      TestEvent.parse({
        id: EVENT_UUID,
        type: 'demo.other_event.v3',
        version: 3,
        tenantId: TENANT_UUID,
        correlationId: CORRELATION_UUID,
        causationId: null,
        occurredAt: NOW,
        payload: { kind: 'demo', n: 1 },
      }),
    ).toThrow();
  });

  it('rejects a type string that does not encode a version', () => {
    expect(() =>
      defineEventContract({
        type: 'broken.event' as unknown as `x.y.v${number}`,
        payload: z.unknown(),
      }),
    ).toThrow(/invalid type/);
  });
});
