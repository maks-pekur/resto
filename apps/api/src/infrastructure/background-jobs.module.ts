import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TenancyModule } from '../contexts/tenancy/tenancy.module';
import { IdentityCoreModule } from '../contexts/identity/identity-core.module';
import { InboxRetentionService } from './inbox-retention.service';
import { InvitationRetentionSchedulerService } from './jobs/invitation-retention-scheduler.service';
import { TenantErasureSchedulerService } from './tenant-erasure-scheduler.service';
import { VerificationRetentionSchedulerService } from './jobs/verification-retention-scheduler.service';

@Module({
  imports: [ScheduleModule.forRoot(), TenancyModule, IdentityCoreModule],
  providers: [
    TenantErasureSchedulerService,
    InboxRetentionService,
    InvitationRetentionSchedulerService,
    VerificationRetentionSchedulerService,
  ],
})
export class BackgroundJobsModule {}
