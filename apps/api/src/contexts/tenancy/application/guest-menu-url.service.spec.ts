import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantId, TenantSlug } from '@resto/domain';
import type { Env } from '../../../config/env.schema';
import type { TenantRepository } from '../domain/ports';
import type { TenantDomain } from '../domain/tenant-domain';
import type { TenantSnapshot } from '../domain/tenant.aggregate';
import { GuestMenuUrlService } from './guest-menu-url.service';

const TENANT_ID = TenantId.parse('00000000-0000-0000-0000-000000000001');
const TABLE_ID = '00000000-0000-0000-0000-000000000099';

const makeTenant = (): TenantSnapshot =>
  ({
    id: TENANT_ID,
    slug: TenantSlug.parse('la-bella'),
  }) as unknown as TenantSnapshot;

const makeDomain = (overrides: Partial<TenantDomain>): TenantDomain => ({
  id: '00000000-0000-0000-0000-000000000010',
  tenantId: TENANT_ID,
  domain: 'placeholder.example',
  kind: 'subdomain',
  isPrimary: false,
  verifiedAt: null,
  createdAt: new Date(),
  ...overrides,
});

describe('GuestMenuUrlService', () => {
  let tenantRepo: { [K in keyof TenantRepository]: ReturnType<typeof vi.fn> };
  let env: Env;
  let service: GuestMenuUrlService;

  beforeEach(() => {
    tenantRepo = {
      findById: vi.fn(),
      findBySlug: vi.fn(),
      findByDomainHost: vi.fn(),
      findByStripeAccountId: vi.fn(),
      save: vi.fn(),
      listDomains: vi.fn(),
      findCurrentTenant: vi.fn(),
      listCurrentTenantDomains: vi.fn(),
      eraseTenant: vi.fn(),
      listScheduledForErasure: vi.fn(),
    };
    env = { PUBLIC_APEX_DOMAIN: 'resto.app' } as unknown as Env;
    service = new GuestMenuUrlService(tenantRepo, env);
  });

  it('returns the primary verified custom domain host', async () => {
    tenantRepo.listDomains.mockResolvedValue([
      makeDomain({
        kind: 'custom',
        domain: 'labella.example.com',
        isPrimary: true,
        verifiedAt: new Date(),
      }),
    ]);

    const url = await service.execute({ tenant: makeTenant(), tableId: TABLE_ID });

    expect(url).toBe(`https://labella.example.com/?t=${TABLE_ID}`);
  });

  it('falls back to the slug formula when the custom domain is not primary or not verified', async () => {
    tenantRepo.listDomains.mockResolvedValue([
      makeDomain({
        kind: 'custom',
        domain: 'not-primary.example.com',
        isPrimary: false,
        verifiedAt: new Date(),
      }),
      makeDomain({
        kind: 'custom',
        domain: 'unverified.example.com',
        isPrimary: true,
        verifiedAt: null,
      }),
    ]);

    const url = await service.execute({ tenant: makeTenant(), tableId: TABLE_ID });

    expect(url).toBe(`https://la-bella.menu.resto.app/?t=${TABLE_ID}`);
  });

  it('falls back to the slug formula for a tenant with only a subdomain row', async () => {
    tenantRepo.listDomains.mockResolvedValue([
      makeDomain({
        kind: 'subdomain',
        domain: 'la-bella.menu.resto.app',
        isPrimary: true,
        verifiedAt: new Date(),
      }),
    ]);

    const url = await service.execute({ tenant: makeTenant(), tableId: TABLE_ID });

    expect(url).toBe(`https://la-bella.menu.resto.app/?t=${TABLE_ID}`);
  });

  it('builds the path and query as exactly /?t=<id>', async () => {
    tenantRepo.listDomains.mockResolvedValue([]);

    const url = await service.execute({ tenant: makeTenant(), tableId: TABLE_ID });
    const parsed = new URL(url);

    expect(parsed.pathname).toBe('/');
    expect(parsed.search).toBe(`?t=${TABLE_ID}`);
  });

  it('throws when PUBLIC_APEX_DOMAIN is missing and there is no custom domain', async () => {
    env.PUBLIC_APEX_DOMAIN = undefined;
    tenantRepo.listDomains.mockResolvedValue([]);

    await expect(service.execute({ tenant: makeTenant(), tableId: TABLE_ID })).rejects.toThrow();
  });
});
