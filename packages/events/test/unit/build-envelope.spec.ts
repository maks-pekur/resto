import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { buildEnvelope, logger } from '../../src/envelope';
import { defineEventContract, EventEnvelope } from '../../src/envelope';
import { withCorrelationId } from '../../src/correlation';

const TestPayload = z.object({ note: z.string() });
const TestContract = defineEventContract({
  type: 'tenancy.test_built.v1',
  payload: TestPayload,
});

const TENANT_UUID = '11111111-1111-4111-8111-111111111111';
const EXPLICIT_CORRELATION = '33333333-3333-4333-8333-333333333333';

describe('buildEnvelope', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('reads correlationId from active ALS frame', () => {
    const env = withCorrelationId(EXPLICIT_CORRELATION, () =>
      buildEnvelope(TestContract, { note: 'hi' }, { tenantId: TENANT_UUID }),
    );
    expect(env.correlationId).toBe(EXPLICIT_CORRELATION);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(() => EventEnvelope.parse(env)).not.toThrow();
  });

  it('falls back to randomUUID and emits WARN exactly once when no ALS frame', () => {
    const env = buildEnvelope(TestContract, { note: 'hi' }, { tenantId: TENANT_UUID });
    expect(env.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const callArgs = warnSpy.mock.calls[0];
    expect(callArgs?.[0]).toMatchObject({
      eventType: 'tenancy.test_built.v1',
      fallbackCorrelationId: env.correlationId,
    });
  });

  it('honors explicit correlationId override and emits no WARN', () => {
    const env = buildEnvelope(
      TestContract,
      { note: 'hi' },
      { tenantId: TENANT_UUID, correlationId: EXPLICIT_CORRELATION },
    );
    expect(env.correlationId).toBe(EXPLICIT_CORRELATION);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
