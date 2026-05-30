import { describe, expect, it, vi } from 'vitest';
import { NatsJetStreamPublisher } from '../../src/infrastructure/nats-publisher';

describe('NatsJetStreamPublisher.publishRaw (AUTH-10 DLQ branch)', () => {
  it('forwards subject + raw bytes to the underlying JetStream client without EventEnvelope.parse', async () => {
    const publish = vi.fn(
      async (_subject: string, _data: Uint8Array): Promise<{ stream: string; seq: number }> =>
        Promise.resolve({ stream: 'x', seq: 1 }),
    );
    const subject = 'dlq.identity.signed_in.v1';
    const bytes = new TextEncoder().encode('this is NOT a valid envelope at all');
    const publisher = Object.create(NatsJetStreamPublisher.prototype) as NatsJetStreamPublisher;
    // Inject minimal stub of the JS client into the private field.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (publisher as any).js = { publish };

    await publisher.publishRaw(subject, bytes);

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(subject, bytes);
  });
});
