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
import { TenantAwareDb } from '@resto/db';
import type { EventPublisher } from '@resto/events';
import { EVENT_PUBLISHER } from '../infrastructure/nats.module';
import { OutboxDispatcherService } from '../infrastructure/outbox-dispatcher.service';
import { LocationNeutral, Public } from '../shared/auth';

export const OUTBOX_STALL_THRESHOLD_MS = 'OUTBOX_STALL_THRESHOLD_MS';

interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail?: string;
}

@ApiTags('health')
@Public()
@LocationNeutral()
@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @Inject(TenantAwareDb) private readonly db: TenantAwareDb,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher | null,
    @Inject(OutboxDispatcherService) private readonly outboxDispatcher: OutboxDispatcherService,
    @Inject(OUTBOX_STALL_THRESHOLD_MS) private readonly stallThresholdMs: number,
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
    const checks = await Promise.all([
      this.checkDatabase(),
      this.checkBroker(),
      this.checkOutboxLeader(),
    ]);
    const failed = checks.filter((c) => !c.ok);
    if (failed.length > 0) {
      this.logger.warn({ failed }, 'Readiness check failed');
      throw new ServiceUnavailableException({ status: 'unavailable', checks });
    }
    return { status: 'ok', checks };
  }

  private async checkDatabase(): Promise<CheckResult> {
    try {
      await this.db.ping();
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

  private async checkOutboxLeader(): Promise<CheckResult> {
    const { isLeader, staleMs } = this.outboxDispatcher.getOutboxLeaderHealth();
    if (!isLeader) {
      return { name: 'outbox_leader', ok: true };
    }
    if (staleMs !== null && staleMs > this.stallThresholdMs) {
      const backlogAgeMs = await this.outboxDispatcher.getOldestUndeliveredOutboxAgeMs();
      if (backlogAgeMs === null) {
        return { name: 'outbox_leader', ok: true };
      }
      return {
        name: 'outbox_leader',
        ok: false,
        detail: `outbox leader stalled: last dispatch ${staleMs}ms ago, oldest undelivered row ${backlogAgeMs}ms old (threshold ${this.stallThresholdMs}ms)`,
      };
    }
    return { name: 'outbox_leader', ok: true };
  }
}
