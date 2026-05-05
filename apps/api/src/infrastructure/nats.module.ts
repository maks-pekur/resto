import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  DrizzleInboxTracker,
  NatsJetStreamPublisher,
  type EventPublisher,
  type InboxTracker,
} from '@resto/events';
import { TenantAwareDb } from '@resto/db';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.schema';
import { EVENT_PUBLISHER } from './event-publisher.token';
import { OutboxDispatcherService } from './outbox-dispatcher.service';

export { EVENT_PUBLISHER } from './event-publisher.token';
export const INBOX_TRACKER = Symbol('INBOX_TRACKER');

const STREAM_SUBJECTS = ['tenancy.>', 'catalog.>', 'ordering.>', 'billing.>'];

const moduleLogger = new Logger('NatsModule');

@Injectable()
class NatsShutdownHook implements OnApplicationShutdown {
  constructor(@Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher | null) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.publisher && typeof this.publisher.close === 'function') {
      await this.publisher.close();
    }
  }
}

@Global()
@Module({
  providers: [
    {
      provide: EVENT_PUBLISHER,
      useFactory: async (env: Env): Promise<EventPublisher | null> => {
        if (process.env.NATS_DISABLED === 'true') {
          // Test/CI escape hatch — skip the connection attempt so booting
          // the app does not require a running broker.
          return null;
        }
        try {
          return await NatsJetStreamPublisher.connect({
            servers: env.NATS_URL,
            stream: env.NATS_STREAM,
            subjects: STREAM_SUBJECTS,
          });
        } catch (err) {
          // Soft-fail at boot so the api comes up for health checks even
          // if NATS is unreachable; readiness will report DOWN until the
          // connection succeeds.
          moduleLogger.warn({ err }, 'Failed to connect to NATS at boot — publisher disabled.');
          return null;
        }
      },
      inject: [ENV_TOKEN],
    },
    NatsShutdownHook,
    {
      provide: INBOX_TRACKER,
      useFactory: (db: TenantAwareDb): InboxTracker => new DrizzleInboxTracker(db),
      inject: [TenantAwareDb],
    },
    OutboxDispatcherService,
  ],
  exports: [EVENT_PUBLISHER, INBOX_TRACKER],
})
export class NatsModule {}
