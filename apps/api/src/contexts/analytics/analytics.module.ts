import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { RequireActiveTenantGuard } from '../../shared/auth/require-active-tenant.guard';
import { MEMBER_LOCATION_SCOPE_READER } from '../identity/application/ports/member-location-scope-reader.port';
import { MemberLocationScopeDrizzleReader } from '../identity/infrastructure/member-location-scope-drizzle.reader';
import { ANALYTICS_READER } from './domain/ports';
import { AnalyticsDrizzleReader } from './infrastructure/analytics-drizzle.reader';
import { GetDashboardKpisService } from './application/get-dashboard-kpis.service';
import { AnalyticsController } from './interfaces/http/analytics.controller';

@Module({
  imports: [TenancyModule],
  controllers: [AnalyticsController],
  providers: [
    { provide: ANALYTICS_READER, useClass: AnalyticsDrizzleReader },
    { provide: MEMBER_LOCATION_SCOPE_READER, useClass: MemberLocationScopeDrizzleReader },
    GetDashboardKpisService,
    RequireActiveTenantGuard,
  ],
})
export class AnalyticsModule {}
