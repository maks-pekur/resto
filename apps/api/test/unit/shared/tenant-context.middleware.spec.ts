import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { BrandId, Currency, TenantId, TenantSlug } from '@resto/domain';
import { getTenantContext } from '@resto/db';
import type { Env } from '../../../src/config/env.schema';
import { Tenant } from '../../../src/contexts/tenancy/domain/tenant.aggregate';
import { TenantAndBrandResolverService } from '../../../src/contexts/tenancy/application/tenant-and-brand-resolver.service';
import { TenantResolverService } from '../../../src/contexts/tenancy/application/tenant-resolver.service';
import { TenantContextMiddleware } from '../../../src/shared/tenant-context.middleware';
import type { BrandRepository, TenantRepository } from '../../../src/contexts/tenancy/domain/ports';

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
  CORS_ALLOWED_ORIGINS: [],
  RATE_LIMIT_PUBLIC_PER_MIN: 60,
  RATE_LIMIT_INTERNAL_PER_MIN: 10,
  RATE_LIMIT_AUTH_SIGNUP_PER_MIN: 5,
  RATE_LIMIT_TENANT_SLUG_CHECK_PER_MIN: 30,
  RATE_LIMIT_AUTH_RESET_PER_MIN: 5,
  RATE_LIMIT_AUTH_SIGNIN_PER_MIN: 10,
  RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN: 10,
  RATE_LIMIT_AUTH_RESET_PER_EMAIL_PER_MIN: 5,
  REQUIRE_EMAIL_VERIFICATION: false,
  PASSWORD_MIN_LENGTH: 12,
  PASSWORD_MAX_LENGTH: 128,
  RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN: 60,
  RESEND_FROM: 'RestOS <noreply@resto.app>',
  RESEND_REPLY_TO: 'support@resto.app',
  MAILHOG_HOST: 'localhost',
  MAILHOG_PORT: 1025,
  STRIPE_APPLICATION_FEE_AMOUNT: 0,
  STRIPE_CONNECT_RETURN_URL: 'http://localhost:3001/stripe/return',
  STRIPE_CONNECT_REFRESH_URL: 'http://localhost:3001/stripe/refresh',
  AUDIT_ERASURE_SALT: undefined,
  OUTBOX_STALL_THRESHOLD_MS: 60_000,
  ...overrides,
});

const buildRepo = (): TenantRepository => ({
  findById: vi.fn(),
  findBySlug: vi.fn().mockResolvedValue(null),
  findByDomainHost: vi.fn().mockResolvedValue(null),
  save: vi.fn(),
  listDomains: vi.fn(),
  eraseTenant: vi.fn(),
  listScheduledForErasure: vi.fn().mockResolvedValue([]),
  findCurrentTenant: vi.fn(),
  listCurrentTenantDomains: vi.fn().mockResolvedValue([]),
});

const buildBrandRepo = (): BrandRepository => ({
  findByDomainHost: vi.fn().mockResolvedValue(null),
  findBySlug: vi.fn().mockResolvedValue(null),
  findByTenantAndSlug: vi.fn().mockResolvedValue(null),
  findById: vi.fn().mockResolvedValue(null),
  listForTenant: vi.fn().mockResolvedValue([]),
  save: vi.fn(),
  findActiveSlugsByPrefix: vi.fn().mockResolvedValue([]),
  findByStripeAccountId: vi.fn().mockResolvedValue(null),
  updatePaymentConnection: vi.fn().mockResolvedValue(undefined),
});

const setup = (env: Env, repoOverride?: TenantRepository) => {
  const repo = repoOverride ?? buildRepo();
  const resolver = new TenantResolverService(repo);
  const brandResolver = new TenantAndBrandResolverService(buildBrandRepo());
  const resolveBySlug = vi.spyOn(resolver, 'resolveBySlug');
  const resolveByHost = vi.spyOn(resolver, 'resolveByHost');
  const middleware = new TenantContextMiddleware(env, resolver, brandResolver);
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

describe('TenantContextMiddleware — x-tenant-id header (operator routes)', () => {
  let next: () => void;

  beforeEach(() => {
    next = vi.fn();
  });

  it('(a) binds tenant context from x-tenant-id UUID on /v1/* in production', async () => {
    const tid = TenantId.parse(randomUUID());
    const cafe = tenantFor('cafe-a');
    const repo = buildRepo();
    repo.findById = vi.fn().mockResolvedValue(cafe);
    const { middleware, resolver } = setup(baseEnv({ NODE_ENV: 'production' }), repo);
    const resolveById = vi.spyOn(resolver, 'resolveById');

    let boundTenantId: string | undefined;
    next = vi.fn(() => {
      boundTenantId = getTenantContext()?.tenantId;
    });

    await middleware.use(
      reqWith({ 'x-tenant-id': tid, url: '/v1/catalog/items' }),
      {} as never,
      next,
    );

    expect(resolveById).toHaveBeenCalledWith(tid);
    expect(boundTenantId).toBe(cafe.toSnapshot().id);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('(b) ignores x-tenant-slug on /v1/* in production — context unbound', async () => {
    const { middleware, resolveBySlug } = setup(baseEnv({ NODE_ENV: 'production' }));

    let boundCtx: ReturnType<typeof getTenantContext>;
    next = vi.fn(() => {
      boundCtx = getTenantContext();
    });

    await middleware.use(
      reqWith({ 'x-tenant-slug': 'cafe-a', url: '/v1/catalog/items' }),
      {} as never,
      next,
    );

    expect(resolveBySlug).not.toHaveBeenCalled();
    expect(boundCtx).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('(c) customer-host resolution takes precedence over x-tenant-id', async () => {
    const customerTenantId = TenantId.parse(randomUUID());
    const customerBrandId = BrandId.parse(randomUUID());
    const otherTid = TenantId.parse(randomUUID());

    const brandRepo = buildBrandRepo();
    brandRepo.findByDomainHost = vi.fn().mockResolvedValue({
      id: customerBrandId,
      tenantId: customerTenantId,
      slug: 'cafe-a',
      displayName: 'Cafe A',
      status: 'active',
      theme: null,
    });

    const repo = buildRepo();
    repo.findById = vi.fn().mockResolvedValue(null);

    const resolver = new TenantResolverService(repo);
    const brandResolver = new TenantAndBrandResolverService(brandRepo);
    const resolveById = vi.spyOn(resolver, 'resolveById');
    const middleware = new TenantContextMiddleware(
      baseEnv({ NODE_ENV: 'production' }),
      resolver,
      brandResolver,
    );

    let boundCtx: ReturnType<typeof getTenantContext>;
    next = vi.fn(() => {
      boundCtx = getTenantContext();
    });

    await middleware.use(
      reqWith({
        host: 'cafe-a.menu.resto.app',
        'x-tenant-id': otherTid,
      }),
      {} as never,
      next,
    );

    expect(resolveById).not.toHaveBeenCalled();
    expect(boundCtx?.tenantId).toBe(customerTenantId);
    expect(boundCtx?.brandId).toBe(customerBrandId);
  });
});
