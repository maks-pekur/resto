import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { TenantAwareDb } from '@resto/db';
import type { DlqPublisher, EventSubscriber, SubscribeOptions } from '@resto/events';
import { NatsAuditSubscriber } from '../../../src/contexts/audit/infrastructure/nats-audit-subscriber';
import type { RecordAuditService } from '../../../src/contexts/audit/application/record-audit.service';

describe('NatsAuditSubscriber DLQ wiring (AUDIT #12)', () => {
  const buildSubscriber = (calls: SubscribeOptions[]): EventSubscriber => ({
    subscribe: (options) => {
      calls.push(options);
      return Promise.resolve({ stop: () => Promise.resolve() });
    },
    close: () => Promise.resolve(),
  });

  it('passes the DLQ publisher to every audit subscription so poison events route to dlq.<subject>', async () => {
    const calls: SubscribeOptions[] = [];
    const dlqPublisher: DlqPublisher = { publishRaw: vi.fn(() => Promise.resolve()) };

    const audit = new NatsAuditSubscriber(
      buildSubscriber(calls),
      dlqPublisher,
      {} as TenantAwareDb,
      {} as RecordAuditService,
    );
    await audit.onApplicationBootstrap();

    expect(calls).toHaveLength(3);
    for (const options of calls) {
      expect(options.dlqPublisher).toBe(dlqPublisher);
    }
  });

  it('omits dlqPublisher when no publisher is available (broker disabled) without crashing', async () => {
    const calls: SubscribeOptions[] = [];

    const audit = new NatsAuditSubscriber(
      buildSubscriber(calls),
      null,
      {} as TenantAwareDb,
      {} as RecordAuditService,
    );
    await audit.onApplicationBootstrap();

    expect(calls).toHaveLength(3);
    for (const options of calls) {
      expect(options.dlqPublisher).toBeUndefined();
    }
  });
});
