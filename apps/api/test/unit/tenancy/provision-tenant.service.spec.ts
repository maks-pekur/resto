import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Currency, TenantSlug } from '@resto/domain';
import { ProvisionTenantService } from '../../../src/contexts/tenancy/application/provision-tenant.service';
import { TenantSlugArchivedError } from '../../../src/contexts/tenancy/domain/errors';
import type { TenantRepository } from '../../../src/contexts/tenancy/domain/ports';
import { Tenant } from '../../../src/contexts/tenancy/domain/tenant.aggregate';

const NOW = new Date('2026-05-01T00:00:00.000Z');

const buildRepo = (): TenantRepository => ({
  findById: vi.fn(),
  findBySlug: vi.fn().mockResolvedValue(null),
  findByDomainHost: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
  listDomains: vi.fn(),
  eraseTenant: vi.fn(),
  listScheduledForErasure: vi.fn().mockResolvedValue([]),
  findCurrentTenant: vi.fn(),
  listCurrentTenantDomains: vi.fn().mockResolvedValue([]),
});

const stripeNoop = {
  ensureExpressAccount: vi.fn().mockResolvedValue(null),
  createExpressAccount: vi.fn().mockResolvedValue({ accountId: 'acct_test' }),
  createAccountLink: vi.fn().mockResolvedValue({ url: 'https://connect.stripe.com', expiresAt: 0 }),
  createPaymentIntent: vi.fn().mockResolvedValue({
    paymentIntentId: 'pi_test',
    clientSecret: 'secret',
    status: 'requires_payment_method',
  }),
  cancelPaymentIntent: vi.fn().mockResolvedValue({ status: 'canceled' }),
  createRefund: vi.fn().mockResolvedValue({ stripeRefundId: 're_test', status: 'succeeded' }),
  retrieveAccount: vi
    .fn()
    .mockResolvedValue({ chargesEnabled: false, payoutsEnabled: false, requirementsDue: null }),
};

const baseInput = {
  slug: TenantSlug.parse('cafe-roma'),
  displayName: 'Cafe Roma',
  locale: 'en',
  defaultCurrency: Currency.parse('USD'),
};

describe('ProvisionTenantService', () => {
  let repo: TenantRepository;
  let service: ProvisionTenantService;

  beforeEach(() => {
    repo = buildRepo();
    service = new ProvisionTenantService(repo, stripeNoop);
  });

  it('saves a new aggregate with a TenantProvisioned event in the outbox', async () => {
    const snapshot = await service.execute(baseInput);

    expect(snapshot.slug).toBe('cafe-roma');
    expect(repo.findBySlug).toHaveBeenCalledWith('cafe-roma');
    expect(repo.save).toHaveBeenCalledTimes(1);

    const saveMock = vi.mocked(repo.save);
    const tenantArg = saveMock.mock.calls[0]?.[0];
    expect(tenantArg).toBeDefined();
    const events = tenantArg?.pullEvents() ?? [];
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('TenantProvisioned');
  });

  it('returns the existing snapshot without saving when the slug is already active', async () => {
    const existing = Tenant.provision({
      slug: baseInput.slug,
      displayName: baseInput.displayName,
      defaultCurrency: baseInput.defaultCurrency,
      primaryDomainHostname: 'cafe-roma.menu.resto.app',
      now: NOW,
    });
    repo.findBySlug = vi.fn().mockResolvedValue(existing);

    const snapshot = await service.execute(baseInput);

    expect(snapshot.id).toBe(existing.toSnapshot().id);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('refuses to re-provision an archived slug', async () => {
    const existing = Tenant.provision({
      slug: baseInput.slug,
      displayName: baseInput.displayName,
      defaultCurrency: baseInput.defaultCurrency,
      primaryDomainHostname: 'cafe-roma.menu.resto.app',
      now: NOW,
    });
    existing.archive();
    repo.findBySlug = vi.fn().mockResolvedValue(existing);

    await expect(service.execute(baseInput)).rejects.toBeInstanceOf(TenantSlugArchivedError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('invokes the Stripe Connect port (placeholder no-op for MVP-1)', async () => {
    await service.execute(baseInput);
    expect(stripeNoop.ensureExpressAccount).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'Cafe Roma' }),
    );
  });
});
