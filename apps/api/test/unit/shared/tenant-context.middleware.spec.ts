import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { Currency, TenantSlug } from '@resto/domain';
import type { Env } from '../../../src/config/env.schema';
import { Tenant } from '../../../src/contexts/tenancy/domain/tenant.aggregate';
import { TenantResolverService } from '../../../src/contexts/tenancy/application/tenant-resolver.service';
import { TenantContextMiddleware } from '../../../src/shared/tenant-context.middleware';
import type { TenantRepository } from '../../../src/contexts/tenancy/domain/ports';

const tenantFor = (slug: string) =>
  Tenant.provision({
    slug: TenantSlug.parse(slug),
    displayName: slug,
    defaultCurrency: Currency.parse('USD'),
    primaryDomainHostname: `${slug}.menu.resto.app`,
  });

const baseEnv = (overrides: Partial<Env> = {}): Env => ({
  NODE_ENV: 'production',
  DEPLOYMENT_ENVIRONMENT: 'production',
  LOG_LEVEL: 'info',
  API_PORT: 3000,
  DATABASE_URL: 'postgres://app@localhost/db',
  NATS_URL: 'nats://localhost:4222',
  NATS_STREAM: 'RESTO_EVENTS',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'resto',
  S3_ACCESS_KEY: 'minio',
  S3_SECRET_KEY: 'minio',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
  OTEL_SERVICE_NAME: 'resto-api',
  ...overrides,
});

const buildRepo = (): TenantRepository => ({
  findById: vi.fn(),
  findBySlug: vi.fn().mockResolvedValue(null),
  findByDomainHost: vi.fn().mockResolvedValue(null),
  save: vi.fn(),
  listDomains: vi.fn(),
});

const setup = (env: Env, repoOverride?: TenantRepository) => {
  const repo = repoOverride ?? buildRepo();
  const resolver = new TenantResolverService(repo);
  const resolveBySlug = vi.spyOn(resolver, 'resolveBySlug');
  const resolveByHost = vi.spyOn(resolver, 'resolveByHost');
  const middleware = new TenantContextMiddleware(env, resolver);
  return { middleware, resolver, resolveBySlug, resolveByHost };
};

const reqWith = (headers: Record<string, string>): FastifyRequest['raw'] =>
  ({ headers }) as unknown as FastifyRequest['raw'];

describe('TenantContextMiddleware — x-tenant-slug header gating', () => {
  let next: () => void;

  beforeEach(() => {
    next = vi.fn();
  });

  it('honours the x-tenant-slug header in development', async () => {
    const repo = buildRepo();
    const cafe = tenantFor('cafe-a');
    repo.findBySlug = vi
      .fn()
      .mockImplementation((slug) => Promise.resolve(slug === 'cafe-a' ? cafe : null));
    const { middleware, resolveBySlug } = setup(baseEnv({ NODE_ENV: 'development' }), repo);

    await middleware.use(reqWith({ 'x-tenant-slug': 'cafe-a' }), {} as never, next);

    expect(resolveBySlug).toHaveBeenCalledWith('cafe-a');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('honours the x-tenant-slug header in test env', async () => {
    const repo = buildRepo();
    const cafe = tenantFor('cafe-a');
    repo.findBySlug = vi.fn().mockResolvedValue(cafe);
    const { middleware, resolveBySlug } = setup(baseEnv({ NODE_ENV: 'test' }), repo);

    await middleware.use(reqWith({ 'x-tenant-slug': 'cafe-a' }), {} as never, next);

    expect(resolveBySlug).toHaveBeenCalledWith('cafe-a');
  });

  it('IGNORES the x-tenant-slug header in production (header path skipped, falls through to host)', async () => {
    const { middleware, resolveBySlug, resolveByHost } = setup(baseEnv({ NODE_ENV: 'production' }));

    await middleware.use(
      reqWith({ 'x-tenant-slug': 'cafe-a', host: 'cafe-b.menu.resto.app' }),
      {} as never,
      next,
    );

    expect(resolveBySlug).not.toHaveBeenCalled();
    expect(resolveByHost).toHaveBeenCalledWith('cafe-b.menu.resto.app');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('IGNORES the x-tenant-slug header in staging', async () => {
    const { middleware, resolveBySlug, resolveByHost } = setup(baseEnv({ NODE_ENV: 'staging' }));

    await middleware.use(
      reqWith({ 'x-tenant-slug': 'cafe-a', host: 'cafe-b.menu.resto.app' }),
      {} as never,
      next,
    );

    expect(resolveBySlug).not.toHaveBeenCalled();
    expect(resolveByHost).toHaveBeenCalledWith('cafe-b.menu.resto.app');
  });

  it('still resolves via host when no header is present', async () => {
    const repo = buildRepo();
    const cafe = tenantFor('cafe-a');
    repo.findByDomainHost = vi.fn().mockResolvedValue(cafe);
    const { middleware, resolveByHost } = setup(baseEnv({ NODE_ENV: 'production' }), repo);

    await middleware.use(reqWith({ host: 'cafe-a.menu.resto.app' }), {} as never, next);

    expect(resolveByHost).toHaveBeenCalledWith('cafe-a.menu.resto.app');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('uses the dev fallback slug only when NODE_ENV=development', async () => {
    const repo = buildRepo();
    const cafe = tenantFor('cafe-a');
    repo.findBySlug = vi.fn().mockResolvedValue(cafe);
    const { middleware, resolveBySlug } = setup(
      baseEnv({ NODE_ENV: 'development', TENANT_DEV_FALLBACK_SLUG: 'cafe-a' }),
      repo,
    );

    await middleware.use(reqWith({ host: 'localhost' }), {} as never, next);

    expect(resolveBySlug).toHaveBeenCalledWith('cafe-a');
  });

  it('does not consult the dev fallback in production even if (somehow) set', async () => {
    const { middleware, resolveBySlug } = setup(
      baseEnv({ NODE_ENV: 'production', TENANT_DEV_FALLBACK_SLUG: 'cafe-a' }),
    );

    await middleware.use(reqWith({ host: 'unknown.example.com' }), {} as never, next);

    expect(resolveBySlug).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
