import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { TenantAwareDb } from '@resto/db';
import type { EventPublisher } from '@resto/events';
import { EVENT_PUBLISHER } from '../infrastructure/nats.module';

interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail?: string;
}

@ApiTags('health')
@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly db: TenantAwareDb,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher | null,
  ) {}

  /**
   * Liveness — is the process up and able to serve HTTP? Used by the
   * orchestrator to decide whether to restart the container. Should
   * return 200 even when downstream dependencies are degraded; that is
   * what readiness is for.
   */
  @Get('healthz')
  @HttpCode(HttpStatus.OK)
  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * Readiness — should the load balancer route requests to this
   * instance right now? Fails 503 with the failing checks listed when
   * any dependency is down.
   */
  @Get('readyz')
  async readiness(): Promise<{ status: 'ok'; checks: CheckResult[] }> {
    const checks = await Promise.all([this.checkDatabase(), this.checkBroker()]);
    const failed = checks.filter((c) => !c.ok);
    if (failed.length > 0) {
      this.logger.warn({ failed }, 'Readiness check failed');
      throw new ServiceUnavailableException({ status: 'unavailable', checks });
    }
    return { status: 'ok', checks };
  }

  private async checkDatabase(): Promise<CheckResult> {
    try {
      await this.db.connection.db.execute(sql`SELECT 1`);
      return { name: 'database', ok: true };
    } catch (err) {
      return {
        name: 'database',
        ok: false,
        detail: err instanceof Error ? err.message : 'unknown error',
      };
    }
  }

  private checkBroker(): Promise<CheckResult> {
    if (!this.publisher) {
      return Promise.resolve({
        name: 'broker',
        ok: false,
        detail: 'NATS publisher not connected at boot',
      });
    }
    return Promise.resolve({ name: 'broker', ok: true });
  }
}
