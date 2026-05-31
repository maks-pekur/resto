import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { PublishMenuService } from './publish-menu.service';

/**
 * D-4a-05 / CAT-06: delayed-publish revert mechanism.
 *
 * `schedule(tenantId)` installs a 5-second in-memory timer per tenant.
 * A second `schedule` for the same tenant cancels the previous timer
 * (operator double-clicked Publish = reset). When the timer fires the
 * publisher runs the actual snapshot bump + outbox event. The caller
 * gets a `cancel()` function valid for the 5-second window — operator
 * Undo.
 *
 * RESEARCH.md Pitfall 1: timers are lost on process restart. A pending
 * timer at SIGTERM is silently dropped — operator must click Publish
 * again. Phase 4b can persist pending publishes if the failure mode
 * proves observable in production.
 *
 * RESEARCH.md Pitfall 7: the setTimeout callback escapes the
 * AsyncLocalStorage frame of the HTTP request, so the publisher uses
 * `db.withTenant(callback, tenantId)` with an explicit tenantId (ADR-0020
 * I-6) — `requireTenantContext()` would throw in the callback context.
 */
@Injectable()
export class DelayedPublishService implements OnModuleDestroy {
  private readonly logger = new Logger(DelayedPublishService.name);
  readonly #pending = new Map<string, { timerId: NodeJS.Timeout }>();
  readonly #DELAY_MS = 5_000;

  constructor(@Inject(PublishMenuService) private readonly publisher: PublishMenuService) {}

  /**
   * Queue a publish for `tenantId`. If one is already pending, cancel +
   * replace it. Returns a `cancel` function valid for the 5s window:
   * `true` if the timer was still pending (undo succeeded), `false` if
   * the publish already executed.
   */
  schedule(tenantId: string): { cancel: () => boolean } {
    this.#cancel(tenantId);
    let cancelled = false;
    const timerId = setTimeout(() => {
      if (cancelled) return;
      this.#pending.delete(tenantId);
      // Pitfall 7: setTimeout callback runs OUTSIDE the HTTP ALS frame.
      // `publisher.doPublish(tenantId)` uses `db.withTenant(cb, tenantId)`
      // with an explicit tenantId, NOT `requireTenantContext()`.
      void this.publisher.doPublish(tenantId).catch((err: unknown) => {
        this.logger.error({ tenantId, err }, 'Delayed publish failed.');
      });
    }, this.#DELAY_MS);
    this.#pending.set(tenantId, { timerId });
    return {
      cancel: (): boolean => {
        if (!this.#pending.has(tenantId)) return false;
        this.#cancel(tenantId);
        cancelled = true;
        return true;
      },
    };
  }

  onModuleDestroy(): void {
    // Pitfall 1: pending timers die with the process. Clear refs so the
    // Node event loop can exit cleanly during graceful shutdown.
    for (const { timerId } of this.#pending.values()) {
      clearTimeout(timerId);
    }
    this.#pending.clear();
  }

  #cancel(tenantId: string): void {
    const existing = this.#pending.get(tenantId);
    if (existing) {
      clearTimeout(existing.timerId);
      this.#pending.delete(tenantId);
    }
  }
}
