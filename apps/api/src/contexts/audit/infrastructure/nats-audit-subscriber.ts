import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  withInboxDedup,
  type EventSubscriber,
  type EventSubscription,
  type InboxTracker,
} from '@resto/events';
import { EVENT_SUBSCRIBER, INBOX_TRACKER } from '../../../infrastructure/nats.module';
import { RecordAuditService } from '../application/record-audit.service';

const TENANCY_CONSUMER_NAME = 'audit-recorder-tenancy';
const TENANCY_SUBJECT = 'tenancy.>';

@Injectable()
export class NatsAuditSubscriber implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(NatsAuditSubscriber.name);
  private subscription: EventSubscription | null = null;

  constructor(
    @Inject(EVENT_SUBSCRIBER) private readonly subscriber: EventSubscriber | null,
    @Inject(INBOX_TRACKER) private readonly tracker: InboxTracker,
    @Inject(RecordAuditService) private readonly recorder: RecordAuditService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.subscriber) {
      this.logger.warn('NATS subscriber unavailable — audit pipeline disabled');
      return;
    }
    const handler = withInboxDedup(this.tracker, TENANCY_CONSUMER_NAME, (envelope) =>
      this.recorder.fromEnvelope(envelope),
    );
    this.subscription = await this.subscriber.subscribe({
      subject: TENANCY_SUBJECT,
      durableName: TENANCY_CONSUMER_NAME,
      maxInFlight: 1,
      handler,
    });
    this.logger.log(
      { subject: TENANCY_SUBJECT, durableName: TENANCY_CONSUMER_NAME },
      'Audit subscription started',
    );
  }

  async onApplicationShutdown(): Promise<void> {
    const sub = this.subscription;
    this.subscription = null;
    if (!sub) return;
    try {
      await sub.stop();
    } catch (err) {
      this.logger.warn({ err }, 'Audit subscription was already stopped');
    }
  }
}
