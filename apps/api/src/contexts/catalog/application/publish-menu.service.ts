import { Inject, Injectable, Logger } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { TenantId } from '@resto/domain';
import {
  CATALOG_REPOSITORY,
  MENU_VERSION_PORT,
  type CatalogRepository,
  type MenuVersionPort,
} from '../domain/ports';

/**
 * Bumps the per-tenant menu version + emits the appropriate outbox event
 * (`MenuFirstPublishedV1` or `MenuRepublishedV1`). Cache keys depend on
 * the version, so the next read for this tenant misses cache and
 * re-loads from DB.
 *
 * The HTTP path enters via `DelayedPublishService.schedule(tenantId)` —
 * the 5-second timer's callback calls `doPublish(tenantId)` directly,
 * NOT `execute()`. `execute()` is retained as a thin ALS-bound wrapper
 * for the legacy controller path; plan 07 rewires the controller to call
 * `DelayedPublishService.schedule`.
 */
@Injectable()
export class PublishMenuService {
  private readonly logger = new Logger(PublishMenuService.name);

  constructor(
    @Inject(MENU_VERSION_PORT) private readonly versions: MenuVersionPort,
    @Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository,
  ) {}

  /**
   * Called from the HTTP request path (ALS-bound). Delegates to
   * `doPublish(tenantId)` so the version+outbox emission path is one
   * codepath regardless of caller.
   */
  async execute(): Promise<{ tenantId: string; version: number }> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);
    const { version } = await this.doPublish(tenantId);
    return { tenantId, version };
  }

  /**
   * Called from `DelayedPublishService.schedule`'s setTimeout callback
   * (NO ALS frame — ADR-0020 I-6). The actual same-tx orchestration
   * (read `menu_first_published_at`, conditionally stamp it, emit the
   * appropriate outbox event) lives in the repository's
   * `finalizeMenuPublish` so the application layer stays free of direct
   * `tx.*` calls (ESLint enforcement).
   */
  async doPublish(tenantId: TenantId | string): Promise<{ version: number }> {
    const id = TenantId.parse(tenantId);
    const version = await this.versions.bump(id);
    const result = await this.repo.finalizeMenuPublish({ tenantId: id, version });
    this.logger.log(
      { tenantId: id, version, isFirstPublish: result.isFirstPublish },
      result.isFirstPublish ? 'Menu first publish committed.' : 'Menu republish committed.',
    );
    return { version };
  }
}
