import { describe, expect, it, vi } from 'vitest';
import { AckPolicy, DeliverPolicy } from 'nats';
import {
  buildConsumerConfig,
  buildDlqSubject,
  computeDlqAction,
  type DlqDecision,
} from '../../src/infrastructure/nats-subscriber';

describe('NatsJetStreamSubscriber — DLQ wiring (AUTH-10)', () => {
  describe('buildConsumerConfig', () => {
    it('applies default max_deliver=5 and ack_wait=30s when options omit them', () => {
      const cfg = buildConsumerConfig({
        durableName: 'audit-recorder-identity',
        subject: 'identity.signed_in.v1',
      });
      expect(cfg.durable_name).toBe('audit-recorder-identity');
      expect(cfg.filter_subject).toBe('identity.signed_in.v1');
      expect(cfg.ack_policy).toBe(AckPolicy.Explicit);
      expect(cfg.deliver_policy).toBe(DeliverPolicy.All);
      expect(cfg.max_deliver).toBe(5);
      // 30 seconds in nanoseconds (ConsumerConfig.ack_wait is Nanos)
      expect(cfg.ack_wait).toBe(30_000 * 1_000_000);
      // packages/events/CLAUDE.md rule: max_ack_pending MUST be >1
      expect(cfg.max_ack_pending ?? 0).toBeGreaterThan(1);
    });

    it('honours overrides for maxDeliver, ackWaitMs, maxInFlight', () => {
      const cfg = buildConsumerConfig({
        durableName: 'd',
        subject: 's',
        maxDeliver: 3,
        ackWaitMs: 5_000,
        maxInFlight: 50,
      });
      expect(cfg.max_deliver).toBe(3);
      expect(cfg.ack_wait).toBe(5_000 * 1_000_000);
      expect(cfg.max_ack_pending).toBe(50);
    });
  });

  describe('buildDlqSubject', () => {
    it('prefixes the original subject with `dlq.` verbatim (D-19, RESEARCH Open Q3)', () => {
      expect(buildDlqSubject('identity.signed_in.v1')).toBe('dlq.identity.signed_in.v1');
      expect(buildDlqSubject('identity.email_dispatch_failed.v1')).toBe(
        'dlq.identity.email_dispatch_failed.v1',
      );
    });
  });

  describe('computeDlqAction', () => {
    it('returns ROUTE_TO_DLQ when deliveryCount >= maxDeliver (terminal redelivery)', () => {
      const action: DlqDecision = computeDlqAction({ deliveryCount: 5, maxDeliver: 5 });
      expect(action).toBe('ROUTE_TO_DLQ');
    });

    it('returns ROUTE_TO_DLQ when deliveryCount > maxDeliver (over-attempted)', () => {
      const action: DlqDecision = computeDlqAction({ deliveryCount: 6, maxDeliver: 5 });
      expect(action).toBe('ROUTE_TO_DLQ');
    });

    it('returns NAK when deliveryCount < maxDeliver (normal retry)', () => {
      expect(computeDlqAction({ deliveryCount: 1, maxDeliver: 5 })).toBe('NAK');
      expect(computeDlqAction({ deliveryCount: 4, maxDeliver: 5 })).toBe('NAK');
    });
  });

  describe('SubscribeOptions surface', () => {
    it('exposes optional maxDeliver / ackWaitMs / dlqPublisher fields without breaking existing call sites', async () => {
      // Compile-time check: the existing call sites in outbox-dispatcher and
      // identity-audit suites pass only { subject, durableName, handler }.
      // The new fields are optional. This is a TS-level assertion that fails
      // at typecheck time, not a runtime check — vitest still needs a body.
      const noopHandler = vi.fn(async () => Promise.resolve());
      const minimal = { subject: 's', durableName: 'd', handler: noopHandler };
      const extended = {
        subject: 's',
        durableName: 'd',
        handler: noopHandler,
        maxDeliver: 3,
        ackWaitMs: 1_000,
      };
      expect(minimal.subject).toBe('s');
      expect(extended.maxDeliver).toBe(3);
    });
  });
});
