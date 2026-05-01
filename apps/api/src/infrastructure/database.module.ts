import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDb, TenantAwareDb } from '@resto/db';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.schema';

/**
 * Owns the lifecycle of the runtime DB pool. Lives as a separate
 * `Injectable` (not as a method on the module class) because NestJS
 * resolves provider overrides per-injection — putting the hook on a
 * provider rather than the module makes it cleanly mockable in tests.
 */
@Injectable()
class DatabaseShutdownHook implements OnApplicationShutdown {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async onApplicationShutdown(): Promise<void> {
    // Guard explicitly: in test setups where TenantAwareDb is replaced
    // via `overrideProvider().useValue()`, NestJS occasionally hands the
    // shutdown hook a not-yet-resolved binding. The runtime check is
    // narrower than what the type system declares — keep both.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (this.db && typeof this.db.close === 'function') {
      await this.db.close();
    }
  }
}

@Global()
@Module({
  providers: [
    {
      provide: TenantAwareDb,
      useFactory: (env: Env): TenantAwareDb => createDb({ url: env.DATABASE_URL }),
      inject: [ENV_TOKEN],
    },
    DatabaseShutdownHook,
  ],
  exports: [TenantAwareDb],
})
export class DatabaseModule {}
