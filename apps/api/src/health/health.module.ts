import { Module } from '@nestjs/common';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.schema';
import { OUTBOX_STALL_THRESHOLD_MS, HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  providers: [
    {
      provide: OUTBOX_STALL_THRESHOLD_MS,
      useFactory: (env: Env): number => env.OUTBOX_STALL_THRESHOLD_MS,
      inject: [ENV_TOKEN],
    },
  ],
})
export class HealthModule {}
