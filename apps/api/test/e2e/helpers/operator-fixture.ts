/**
 * Shared helpers for E2E tests that provision a tenant + bootstrap an owner
 * and need to exercise operator-facing HTTP routes.
 *
 * All helpers operate against an already-started NestFastifyApplication
 * (`app`) — callers own app lifecycle in beforeAll / afterAll.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { expect } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { BootstrapModule } from '../../../src/contexts/identity/bootstrap.module';
import { BootstrapOwnerService } from '../../../src/contexts/identity/application/bootstrap-owner.service';

export interface TenantFixture {
  id: string;
  slug: string;
}

export interface BootstrapResult {
  tenantId: string;
  userId: string;
}

/**
 * Provision a tenant via the internal HTTP endpoint.
 */
export const provisionTenant = async (
  app: NestFastifyApplication,
  slug: string,
  internalToken: string,
): Promise<TenantFixture> => {
  const res = await app.inject({
    method: 'POST',
    url: '/internal/v1/tenants',
    headers: { 'x-internal-token': internalToken },
    payload: {
      slug,
      displayName: `E2E Tenant ${slug}`,
      defaultCurrency: 'USD',
      locale: 'en',
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json<TenantFixture>();
};

/**
 * Spin up a standalone BootstrapModule context, run the service, close the
 * context. The context shares process.env DATABASE URLs with the main app —
 * same physical DB, no dual-write concerns.
 */
export const runBootstrap = async (input: {
  tenantSlug: string;
  email: string;
  password: string;
  name: string;
}): Promise<BootstrapResult> => {
  const ctx = await NestFactory.createApplicationContext(BootstrapModule, {
    logger: false,
    abortOnError: false,
  });
  try {
    const svc = ctx.get(BootstrapOwnerService);
    const result = await svc.execute(input);
    return { tenantId: result.tenantId, userId: result.userId };
  } finally {
    await ctx.close();
  }
};

/**
 * Extract the cookie value (name=value pairs only, no attributes) from a
 * Set-Cookie header value or array of values. Suitable for use as a Cookie
 * request header.
 */
export const extractCookies = (setCookie: string | string[] | undefined): string => {
  if (!setCookie) return '';
  const values = Array.isArray(setCookie) ? setCookie : [setCookie];
  return values
    .map((h) => h.split(';')[0]?.trim() ?? '')
    .filter(Boolean)
    .join('; ');
};

/**
 * Sign in via the BA HTTP endpoint, returning the session cookie header value.
 */
export const signIn = async (
  app: NestFastifyApplication,
  email: string,
  password: string,
): Promise<string> => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { 'content-type': 'application/json' },
    payload: { email, password },
  });
  expect(res.statusCode).toBe(200);
  return extractCookies(res.headers['set-cookie']);
};

/**
 * Full operator sign-in: sign in + set active org on the session.
 * Returns the session cookie with the org context active (required for
 * tenant-scoped endpoints like GET /v1/tenants/me).
 */
export const signInAsOperator = async (
  app: NestFastifyApplication,
  email: string,
  password: string,
  tenantId: string,
): Promise<string> => {
  const cookie = await signIn(app, email, password);

  const setActiveRes = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/set-active',
    headers: { 'content-type': 'application/json', cookie },
    payload: { organizationId: tenantId },
  });
  expect(setActiveRes.statusCode).toBe(200);

  // BA refreshes the session cookie after setActive; use the updated one if
  // present, otherwise fall back to the original.
  return extractCookies(setActiveRes.headers['set-cookie']) || cookie;
};
