import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { schema } from '@resto/db';
import { Currency, TenantId, TenantSlug } from '@resto/domain';
import { Tenant } from '../../src/contexts/tenancy/domain/tenant.aggregate';
import { HandleStripeEventService } from '../../src/contexts/payments/application/handle-stripe-event.service';
import { isDockerAvailable, startDbStack, stopDbStack } from './helpers/with-db-stack';
import type { DbStack } from './helpers/with-db-stack';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[stripe-webhook-inbox-dedup] Docker not available — skipping.');
}

const STRIPE_ACCOUNT_ID = 'acct_1TestInboxDedup0056';

const makeFakeTenant = (tenantId: string): Tenant =>
  Tenant.fromSnapshot({
    id: TenantId.parse(tenantId),
    slug: TenantSlug.parse(`inbox-dedup-${tenantId.slice(0, 8)}`),
    displayName: 'Inbox Dedup Test Tenant',
    status: 'active',
    locale: 'en',
    country: 'ES',
    defaultCurrency: Currency.parse('EUR'),
    theme: null,
    legalName: null,
    legalForm: null,
    taxId: null,
    stripeAccountId: STRIPE_ACCOUNT_ID,
    paymentProvider: 'stripe',
    accountType: null,
    stripeChargesEnabled: false,
    stripePayoutsEnabled: false,
    stripeOnboardingStatus: 'not_started',
    stripeRequirementsDue: null,
    fiscalizationConfig: null,
    primaryDomain: {
      id: randomUUID(),
      tenantId: TenantId.parse(tenantId),
      domain: `inbox-dedup-${tenantId.slice(0, 8)}.menu.resto.app`,
      kind: 'subdomain',
      isPrimary: true,
      verifiedAt: new Date(),
      createdAt: new Date(),
    },
    customDomains: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
    offboardingScheduledAt: null,
    offboardingExecutedAt: null,
    offboardingRequestedBy: null,
  });

const makeAccountUpdatedEvent = (eventId: string) =>
  ({
    id: eventId,
    type: 'account.updated' as const,
    account: STRIPE_ACCOUNT_ID,
    data: {
      object: {
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        requirements: { currently_due: [] },
      },
    },
  }) as never;

suite('stripe webhook inbox dedup — evt_ id accepted after 0056 migration (PAY-13)', () => {
  let stack: DbStack;
  let tenantId: string;

  beforeAll(async () => {
    stack = await startDbStack();
    tenantId = randomUUID();

    await stack.db.withoutTenant('seed tenant for inbox dedup e2e', async (tx) => {
      await tx.insert(schema.tenants).values({
        id: tenantId,
        slug: `inbox-dedup-${tenantId.slice(0, 8)}`,
        displayName: 'Inbox Dedup Test Tenant',
        locale: 'en',
        country: 'ES',
        defaultCurrency: 'EUR',
      });
    });
  }, 120_000);

  afterAll(async () => {
    if (stack) await stopDbStack(stack);
  });

  it('runDeduped with a Stripe evt_ id inserts inbox_processed row without 22P02', async () => {
    const stripeEventId = `evt_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const saveMock = vi.fn().mockResolvedValue(undefined);

    const tenantRepo = {
      findByStripeAccountId: vi.fn().mockResolvedValue(makeFakeTenant(tenantId)),
      save: saveMock,
    };

    const service = new HandleStripeEventService(
      stack.db,
      tenantRepo as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.handle(makeAccountUpdatedEvent(stripeEventId))).resolves.toBeUndefined();
    expect(saveMock).toHaveBeenCalledOnce();

    const rows = await stack.db.withoutTenant('verify inbox row', async (tx) => {
      return tx
        .select({ eventId: schema.inboxProcessed.eventId })
        .from(schema.inboxProcessed)
        .where(
          sql`${schema.inboxProcessed.eventId} = ${stripeEventId} AND ${schema.inboxProcessed.consumer} = 'payments-webhook'`,
        );
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.eventId).toBe(stripeEventId);
  });

  it('second delivery of same evt_ id is skipped (idempotency)', async () => {
    const stripeEventId = `evt_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const saveMock = vi.fn().mockResolvedValue(undefined);

    const tenantRepo = {
      findByStripeAccountId: vi.fn().mockResolvedValue(makeFakeTenant(tenantId)),
      save: saveMock,
    };

    const service = new HandleStripeEventService(
      stack.db,
      tenantRepo as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const event = makeAccountUpdatedEvent(stripeEventId);

    await service.handle(event);
    expect(saveMock).toHaveBeenCalledOnce();

    saveMock.mockClear();
    await service.handle(event);
    expect(saveMock).not.toHaveBeenCalled();
  });
});
