import { describe, expect, it } from 'vitest';
import { TenantSlug } from '@resto/domain';
import type { TenantAwareDb } from '@resto/db';
import { TenantDrizzleRepository } from '../../../src/contexts/tenancy/infrastructure/tenant-drizzle.repository';
import { TenantSlugTakenError } from '../../../src/contexts/tenancy/domain/errors';
import { Tenant } from '../../../src/contexts/tenancy/domain/tenant.aggregate';

const makeTenant = (): Tenant =>
  Tenant.provision({
    slug: TenantSlug.parse('cafe-roma'),
    displayName: 'Cafe Roma',
    country: 'GB',
    locale: 'en',
    primaryDomainHostname: 'cafe-roma.menu.resto.app',
  });

const pgError = (props: Record<string, unknown>): Error =>
  Object.assign(new Error('pg error'), props);

const repoRejectingWith = (err: Error): TenantDrizzleRepository =>
  new TenantDrizzleRepository({
    withoutTenant: () => Promise.reject(err),
  } as unknown as TenantAwareDb);

describe('TenantDrizzleRepository.save — slug-conflict translation (AUDIT #10)', () => {
  it('translates a 23505 on tenants_slug_uq into TenantSlugTakenError', async () => {
    const repo = repoRejectingWith(pgError({ code: '23505', constraint_name: 'tenants_slug_uq' }));
    await expect(repo.save(makeTenant())).rejects.toBeInstanceOf(TenantSlugTakenError);
  });

  it('unwraps a DrizzleQueryError .cause to find the slug 23505', async () => {
    const repo = repoRejectingWith(
      pgError({ cause: pgError({ code: '23505', constraint_name: 'tenants_slug_uq' }) }),
    );
    await expect(repo.save(makeTenant())).rejects.toBeInstanceOf(TenantSlugTakenError);
  });

  it('propagates a 23505 on a different constraint unchanged', async () => {
    const other = pgError({ code: '23505', constraint_name: 'tenant_domains_domain_uq' });
    const repo = repoRejectingWith(other);
    await expect(repo.save(makeTenant())).rejects.toBe(other);
  });

  it('propagates a non-unique-violation error unchanged', async () => {
    const boom = new Error('boom');
    const repo = repoRejectingWith(boom);
    await expect(repo.save(makeTenant())).rejects.toBe(boom);
  });
});
