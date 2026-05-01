import { describe, expect, it } from 'vitest';
import { InMemoryInboxTracker, withInboxDedup } from '../../src/inbox/tracker';
import type { EventEnvelope } from '../../src/envelope';

const ENVELOPE_BASE: Omit<EventEnvelope, 'id'> = {
  type: 'demo.x.v1',
  version: 1,
  tenantId: '11111111-1111-4111-8111-111111111111' as EventEnvelope['tenantId'],
  correlationId: '22222222-2222-4222-8222-222222222222',
  causationId: null,
  occurredAt: new Date('2026-05-01T00:00:00.000Z'),
  payload: {},
};

const envelopeWithId = (id: string): EventEnvelope => ({ ...ENVELOPE_BASE, id });

describe('InMemoryInboxTracker', () => {
  it('reports unseen events as unseen', async () => {
    const tracker = new InMemoryInboxTracker();
    expect(await tracker.hasSeen('consumer-a', 'evt-1')).toBe(false);
  });

  it('records seen events per (consumer, eventId)', async () => {
    const tracker = new InMemoryInboxTracker();
    await tracker.markSeen('consumer-a', 'evt-1');
    expect(await tracker.hasSeen('consumer-a', 'evt-1')).toBe(true);
    expect(await tracker.hasSeen('consumer-b', 'evt-1')).toBe(false);
    expect(await tracker.hasSeen('consumer-a', 'evt-2')).toBe(false);
  });
});

describe('withInboxDedup', () => {
  it('runs the inner handler the first time and skips on redelivery', async () => {
    const tracker = new InMemoryInboxTracker();
    let calls = 0;
    const handler = withInboxDedup(tracker, 'consumer-a', () => {
      calls += 1;
      return Promise.resolve();
    });
    const envelope = envelopeWithId('44444444-4444-4444-8444-444444444444');

    await handler(envelope);
    await handler(envelope);
    await handler(envelope);

    expect(calls).toBe(1);
  });

  it('does not mark seen if the inner handler throws', async () => {
    const tracker = new InMemoryInboxTracker();
    let calls = 0;
    const handler = withInboxDedup(tracker, 'consumer-a', () => {
      calls += 1;
      throw new Error('boom');
    });
    const envelope = envelopeWithId('55555555-5555-4555-8555-555555555555');

    await expect(handler(envelope)).rejects.toThrow('boom');
    await expect(handler(envelope)).rejects.toThrow('boom');

    expect(calls).toBe(2);
  });
});
