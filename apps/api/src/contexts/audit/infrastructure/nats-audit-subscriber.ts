import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { TenantAwareDb } from '@resto/db';
import {
  runDeduped,
  type EventEnvelope,
  type EventSubscriber,
  type EventSubscription,
} from '@resto/events';
import { EVENT_SUBSCRIBER } from '../../../infrastructure/nats.module';
import { RecordAuditService } from '../application/record-audit.service';

const TENANCY_CONSUMER_NAME = 'audit-recorder-tenancy';
const TENANCY_SUBJECT = 'tenancy.>';

const IDENTITY_CONSUMER_NAME = 'audit-recorder-identity';
const IDENTITY_SUBJECT = 'identity.>';

@Injectable()
export class NatsAuditSubscriber implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(NatsAuditSubscriber.name);
  private subscriptions: EventSubscription[] = [];

  constructor(
    @Inject(EVENT_SUBSCRIBER) private readonly subscriber: EventSubscriber | null,
    @Inject(TenantAwareDb) private readonly db: TenantAwareDb,
    @Inject(RecordAuditService) private readonly recorder: RecordAuditService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.subscriber) {
      this.logger.warn('NATS subscriber unavailable — audit pipeline disabled');
      return;
    }
    for (const cfg of [
      { subject: TENANCY_SUBJECT, durableName: TENANCY_CONSUMER_NAME },
      { subject: IDENTITY_SUBJECT, durableName: IDENTITY_CONSUMER_NAME },
    ]) {
      const handler = async (envelope: EventEnvelope): Promise<void> => {
        await runDeduped(this.db, envelope, cfg.durableName, async (tx) => {
          await this.recorder.fromEnvelopeWithTx(envelope, tx);
        });
      };
      const subscription = await this.subscriber.subscribe({
        subject: cfg.subject,
        durableName: cfg.durableName,
        maxInFlight: 1,
        handler,
      });
      this.subscriptions.push(subscription);
      this.logger.log(
        { subject: cfg.subject, durableName: cfg.durableName },
        'Audit subscription started',
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    const subs = this.subscriptions;
    this.subscriptions = [];
    for (const sub of subs) {
      try {
        await sub.stop();
      } catch (err) {
        this.logger.warn({ err }, 'Audit subscription was already stopped');
      }
    }
  }
}
