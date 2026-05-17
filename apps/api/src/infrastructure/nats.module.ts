import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  NatsJetStreamPublisher,
  NatsJetStreamSubscriber,
  type EventPublisher,
  type EventSubscriber,
} from '@resto/events';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.schema';
import { EVENT_PUBLISHER } from './event-publisher.token';
import { OutboxDispatcherService } from './outbox-dispatcher.service';

export { EVENT_PUBLISHER } from './event-publisher.token';
export const EVENT_SUBSCRIBER = Symbol('EVENT_SUBSCRIBER');

const STREAM_SUBJECTS = ['tenancy.>', 'identity.>', 'catalog.>', 'ordering.>', 'billing.>'];

const moduleLogger = new Logger('NatsModule');

const buildNatsAuthOptions = (env: Env): { user: string; pass: string } | undefined => {
  if (env.NATS_USERNAME && env.NATS_PASSWORD) {
    return { user: env.NATS_USERNAME, pass: env.NATS_PASSWORD };
  }
  return undefined;
};

@Injectable()
class NatsShutdownHook implements OnApplicationShutdown {
  constructor(
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher | null,
    @Inject(EVENT_SUBSCRIBER) private readonly subscriber: EventSubscriber | null,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.publisher && typeof this.publisher.close === 'function') {
      await this.publisher.close();
    }
    if (this.subscriber && typeof this.subscriber.close === 'function') {
      await this.subscriber.close();
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
          const auth = buildNatsAuthOptions(env);
          return await NatsJetStreamPublisher.connect({
            servers: env.NATS_URL,
            stream: env.NATS_STREAM,
            subjects: STREAM_SUBJECTS,
            ...(auth ? { connectionOptions: auth } : {}),
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
    {
      provide: EVENT_SUBSCRIBER,
      useFactory: async (env: Env): Promise<EventSubscriber | null> => {
        if (process.env.NATS_DISABLED === 'true') {
          return null;
        }
        try {
          const auth = buildNatsAuthOptions(env);
          return await NatsJetStreamSubscriber.connect({
            servers: env.NATS_URL,
            stream: env.NATS_STREAM,
            ...(auth ? { connectionOptions: auth } : {}),
          });
        } catch (err) {
          moduleLogger.warn(
            { err },
            'Failed to connect NATS subscriber at boot — subscriber disabled.',
          );
          return null;
        }
      },
      inject: [ENV_TOKEN],
    },
    NatsShutdownHook,
    OutboxDispatcherService,
  ],
  exports: [EVENT_PUBLISHER, EVENT_SUBSCRIBER],
})
export class NatsModule {}
