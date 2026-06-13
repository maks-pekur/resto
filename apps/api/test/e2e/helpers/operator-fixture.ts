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

const SIGN_IN_MAX_ATTEMPTS = 3;
const SIGN_IN_BACKOFF_MS = 500;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const signIn = async (
  app: NestFastifyApplication,
  email: string,
  password: string,
  remoteAddress?: string,
): Promise<string> => {
  let lastStatus = 0;
  let lastBody = '';
  for (let attempt = 1; attempt <= SIGN_IN_MAX_ATTEMPTS; attempt++) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: { email, password },
      ...(remoteAddress !== undefined ? { remoteAddress } : {}),
    });
    if (res.statusCode === 200) {
      return extractCookies(res.headers['set-cookie']);
    }
    lastStatus = res.statusCode;
    lastBody = res.body;
    if (res.statusCode < 500) break;
    await sleep(SIGN_IN_BACKOFF_MS * attempt);
  }
  expect.fail(
    `signIn failed after ${String(SIGN_IN_MAX_ATTEMPTS)} attempts: ${String(lastStatus)} ${lastBody}`,
  );
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
  remoteAddress?: string,
): Promise<string> => {
  const cookie = await signIn(app, email, password, remoteAddress);

  let lastStatus = 0;
  let lastBody = '';
  for (let attempt = 1; attempt <= SIGN_IN_MAX_ATTEMPTS; attempt++) {
    const setActiveRes = await app.inject({
      method: 'POST',
      url: '/api/auth/organization/set-active',
      headers: { 'content-type': 'application/json', cookie },
      payload: { organizationId: tenantId },
      ...(remoteAddress !== undefined ? { remoteAddress } : {}),
    });
    if (setActiveRes.statusCode === 200) {
      return extractCookies(setActiveRes.headers['set-cookie']) || cookie;
    }
    lastStatus = setActiveRes.statusCode;
    lastBody = setActiveRes.body;
    if (setActiveRes.statusCode < 500) break;
    await sleep(SIGN_IN_BACKOFF_MS * attempt);
  }
  expect.fail(
    `set-active failed after ${String(SIGN_IN_MAX_ATTEMPTS)} attempts: ${String(lastStatus)} ${lastBody}`,
  );
};

export const addMemberWithRole = async (
  app: NestFastifyApplication,
  input: {
    ownerCookie: string;
    tenantId: string;
    email: string;
    password: string;
    name: string;
    role: 'admin' | 'staff';
  },
): Promise<string> => {
  const invite = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/invite-member',
    headers: { 'content-type': 'application/json', cookie: input.ownerCookie },
    payload: { email: input.email, role: input.role, organizationId: input.tenantId },
  });
  expect([200, 201]).toContain(invite.statusCode);
  const body = invite.json<{ id?: string; invitation?: { id: string } }>();
  const id = body.id ?? body.invitation?.id;
  expect(id, `invite-member response had no invitation id: ${invite.body}`).toBeTruthy();

  const signUp = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { 'content-type': 'application/json' },
    payload: { email: input.email, password: input.password, name: input.name },
  });
  expect([200, 201]).toContain(signUp.statusCode);
  const memberCookie = extractCookies(signUp.headers['set-cookie']);

  const accept = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/accept-invitation',
    headers: { 'content-type': 'application/json', cookie: memberCookie },
    payload: { invitationId: id },
  });
  expect([200, 201]).toContain(accept.statusCode);

  return signInAsOperator(app, input.email, input.password, input.tenantId);
};
