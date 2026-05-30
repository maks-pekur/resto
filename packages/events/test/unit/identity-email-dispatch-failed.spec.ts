import { describe, expect, it } from 'vitest';
import {
  IdentityEmailDispatchFailedV1,
  IdentityEmailDispatchFailedV1Payload,
} from '../../src/contracts/identity';

const EVENT_UUID = '44444444-4444-4444-8444-444444444444';
const TENANT_UUID = '11111111-1111-4111-8111-111111111111';
const CORRELATION_UUID = '33333333-3333-4333-8333-333333333333';
const ORIGINAL_ENVELOPE_UUID = '55555555-5555-4555-8555-555555555555';
const USER_UUID = '66666666-6666-4666-8666-666666666666';

describe('IdentityEmailDispatchFailedV1 contract (AUTH-10 + D-05)', () => {
  it('parses a minimal payload with only required fields (reason + originalSubject)', () => {
    const payload = IdentityEmailDispatchFailedV1Payload.parse({
      reason: 'dlq_routed',
      originalSubject: 'identity.signed_in.v1',
    });
    expect(payload.reason).toBe('dlq_routed');
    expect(payload.originalSubject).toBe('identity.signed_in.v1');
    expect(payload.tenantId).toBeUndefined();
    expect(payload.userId).toBeUndefined();
    expect(payload.originalEnvelopeId).toBeUndefined();
    expect(payload.redeliveryCount).toBeUndefined();
    expect(payload.errorMessage).toBeUndefined();
  });

  it('parses a payload with all optional fields populated', () => {
    const payload = IdentityEmailDispatchFailedV1Payload.parse({
      reason: 'resend_terminal_failure',
      originalSubject: 'identity.password_reset_completed.v1',
      originalEnvelopeId: ORIGINAL_ENVELOPE_UUID,
      redeliveryCount: 5,
      errorMessage: 'Resend SDK returned 502 after 3 retries',
      userId: USER_UUID,
      tenantId: TENANT_UUID,
    });
    expect(payload.reason).toBe('resend_terminal_failure');
    expect(payload.redeliveryCount).toBe(5);
    expect(payload.errorMessage).toBe('Resend SDK returned 502 after 3 retries');
    expect(payload.userId).toBe(USER_UUID);
    expect(payload.tenantId).toBe(TENANT_UUID);
  });

  it('rejects an unknown reason (enum constraint enforced)', () => {
    expect(() =>
      IdentityEmailDispatchFailedV1Payload.parse({
        reason: 'invalid_reason' as never,
        originalSubject: 'x',
      }),
    ).toThrow();
  });

  it('rejects an empty originalSubject', () => {
    expect(() =>
      IdentityEmailDispatchFailedV1Payload.parse({
        reason: 'dlq_routed',
        originalSubject: '',
      }),
    ).toThrow();
  });

  it('rejects an oversized errorMessage (DoS guard)', () => {
    expect(() =>
      IdentityEmailDispatchFailedV1Payload.parse({
        reason: 'dlq_routed',
        originalSubject: 'identity.signed_in.v1',
        errorMessage: 'x'.repeat(2049),
      }),
    ).toThrow();
  });

  it('rejects a negative redeliveryCount', () => {
    expect(() =>
      IdentityEmailDispatchFailedV1Payload.parse({
        reason: 'dlq_routed',
        originalSubject: 'identity.signed_in.v1',
        redeliveryCount: -1,
      }),
    ).toThrow();
  });

  it('IdentityEmailDispatchFailedV1.parse narrows envelope payload to the contract shape', () => {
    const envelope = IdentityEmailDispatchFailedV1.parse({
      id: EVENT_UUID,
      type: 'identity.email_dispatch_failed.v1',
      version: 1,
      tenantId: TENANT_UUID,
      correlationId: CORRELATION_UUID,
      causationId: null,
      occurredAt: new Date('2026-05-30T00:00:00.000Z'),
      payload: {
        reason: 'dlq_routed',
        originalSubject: 'identity.signed_in.v1',
      },
    });
    expect(envelope.type).toBe('identity.email_dispatch_failed.v1');
    expect(envelope.payload.reason).toBe('dlq_routed');
  });
});
