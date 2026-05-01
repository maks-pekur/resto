import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runInTenantContext } from '@resto/db';
import { InvalidTokenError } from '../../../src/contexts/identity/domain/errors';
import type { Principal } from '../../../src/contexts/identity/domain/principal';
import type { JwtVerifier } from '../../../src/contexts/identity/domain/ports';
import { AuthGuard } from '../../../src/contexts/identity/interfaces/http/auth.guard';
import { IS_PUBLIC_KEY } from '../../../src/contexts/identity/interfaces/http/public.decorator';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

const buildContext = (headers: Record<string, string | undefined>): ExecutionContext => {
  const request = { headers };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    getType: () => 'http',
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({}) as never,
    switchToWs: () => ({}) as never,
  } as unknown as ExecutionContext;
};

const stubReflector = (metadata: Record<string, unknown>): Reflector =>
  ({
    getAllAndOverride: (key: string): unknown => metadata[key],
  }) as unknown as Reflector;

const buildVerifier = (impl: (token: string) => Promise<Principal>): JwtVerifier => ({
  verify: vi.fn(impl),
});

describe('AuthGuard', () => {
  let principal: Principal;

  beforeEach(() => {
    principal = {
      subject: 'kc-sub-123',
      tenantId: TENANT_A,
      roles: ['owner'],
    };
  });

  it('skips authentication on @Public() routes', async () => {
    const verifier = buildVerifier(() => Promise.resolve(principal));
    const reflector = stubReflector({ [IS_PUBLIC_KEY]: true });
    const guard = new AuthGuard(reflector, verifier);

    await expect(guard.canActivate(buildContext({}))).resolves.toBe(true);
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const guard = new AuthGuard(
      stubReflector({}),
      buildVerifier(() => Promise.resolve(principal)),
    );
    await expect(guard.canActivate(buildContext({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns 401 when verifier rejects the token', async () => {
    const guard = new AuthGuard(
      stubReflector({}),
      buildVerifier(() => Promise.reject(new InvalidTokenError('expired'))),
    );
    await expect(
      guard.canActivate(buildContext({ authorization: 'Bearer expired-token' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches the principal to the request when the token verifies', async () => {
    const verifier = buildVerifier(() => Promise.resolve(principal));
    const guard = new AuthGuard(stubReflector({}), verifier);
    const ctx = buildContext({ authorization: 'Bearer good-token' });
    await guard.canActivate(ctx);
    const request = ctx.switchToHttp().getRequest<{ principal?: Principal }>();
    expect(request.principal).toEqual(principal);
  });

  it('returns 403 when the token tenant does not match the resolved tenant', async () => {
    const verifier = buildVerifier(() => Promise.resolve({ ...principal, tenantId: TENANT_A }));
    const guard = new AuthGuard(stubReflector({}), verifier);

    await expect(
      runInTenantContext({ tenantId: TENANT_B }, () =>
        guard.canActivate(buildContext({ authorization: 'Bearer cross-tenant-token' })),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
