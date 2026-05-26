import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TenancyModule } from '../contexts/tenancy/tenancy.module';
import { InboxRetentionService } from './inbox-retention.service';
import { TenantErasureSchedulerService } from './tenant-erasure-scheduler.service';

@Module({
  imports: [ScheduleModule.forRoot(), TenancyModule],
  providers: [TenantErasureSchedulerService, InboxRetentionService],
})
export class BackgroundJobsModule {}
