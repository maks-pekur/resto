#!/usr/bin/env tsx
import 'reflect-metadata';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../apps/api/src/app.module';
import { OffboardTenantService } from '../../../apps/api/src/contexts/tenancy/application/offboard-tenant.service';
import { TenantQueriesService } from '../../../apps/api/src/contexts/tenancy/application/tenant-queries.service';

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: pnpm resto:erase-tenant <slug>');
  process.exit(1);
}

const main = async (): Promise<void> => {
  const ctx = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const queries = ctx.get(TenantQueriesService);
    const service = ctx.get(OffboardTenantService);
    const tenant = await queries.findBySlug(slug);
    if (!tenant) {
      console.error(`Tenant "${slug}" not found.`);
      process.exit(2);
    }
    if (tenant.status === 'erased') {
      console.log(`Tenant "${slug}" is already erased — nothing to do.`);
      return;
    }
    if (tenant.status !== 'pending_offboarding') {
      console.error(
        `Tenant "${slug}" is in status "${tenant.status}"; expected "pending_offboarding". ` +
          `Schedule offboarding first via the HTTP endpoint or the admin UI.`,
      );
      process.exit(3);
    }
    console.warn(
      `WARNING: about to PERMANENTLY erase tenant "${slug}" (id ${tenant.id}). ` +
        `This is irreversible. Members, customer profiles, menu, outbox/inbox rows, and orphan users will be hard-deleted; ` +
        `audit_log rows will be anonymised; the tenants row will be tombstoned.`,
    );
    const rl = createInterface({ input: stdin, output: stdout });
    const answer = await rl.question(`Type the slug "${slug}" to confirm: `);
    rl.close();
    if (answer !== slug) {
      console.log('Confirmation did not match — aborting.');
      process.exit(4);
    }
    // PII column coverage (legal_name, legal_form, tax_id, stripe_account_id
    // on `tenants`, D-04) is anonymized inside the tenancy_erase_tenant() SQL
    // function (packages/db/migrations/0080_tenancy_erase_tenant_pii.sql),
    // not enumerated here — this CLI only drives OffboardTenantService.
    const result = await service.executeErasure({ tenantId: tenant.id });
    console.log(
      `Erased: tenant id ${result.id}, status ${result.status}, executedAt ${result.offboardingExecutedAt?.toISOString() ?? '(none)'}`,
    );
  } finally {
    await ctx.close();
  }
};

main().catch((err: unknown) => {
  console.error('Erasure CLI failed:', err);
  process.exit(99);
});
