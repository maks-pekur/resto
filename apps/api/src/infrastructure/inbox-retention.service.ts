import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { deleteInboxProcessedOlderThan, TenantAwareDb } from '@resto/db';

const RETENTION_DAYS = 30;

@Injectable()
export class InboxRetentionService {
  private readonly logger = new Logger(InboxRetentionService.name);

  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  @Cron('15 2 * * *', { name: 'inbox-retention', timeZone: 'UTC' })
  async run(): Promise<void> {
    try {
      const { deleted } = await deleteInboxProcessedOlderThan(this.db, RETENTION_DAYS);
      this.logger.log({ deleted, retentionDays: RETENTION_DAYS }, 'Inbox retention sweep complete');
    } catch (err) {
      this.logger.warn({ err }, 'Inbox retention sweep failed; will retry next run');
    }
  }
}
