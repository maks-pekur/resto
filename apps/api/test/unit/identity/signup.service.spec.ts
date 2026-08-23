import { describe, expect, it, vi, beforeEach } from 'vitest';
import type * as NodeCrypto from 'node:crypto';
import { SignUpService } from '../../../src/contexts/identity/application/signup/signup.service';
import {
  SignupBetterAuthFailureError,
  SignupEmailAlreadyExistsError,
  SlugUnavailableError,
} from '../../../src/contexts/identity/domain/signup-errors';
import {
  BetterAuthBootstrapFailureError,
  OwnerAlreadyExistsError,
} from '../../../src/contexts/identity/domain/bootstrap-errors';

// D-27 (10.2 plan 13): the provisional slug is `slugify(name)-<random6>`.
// Stub `randomUUID` so the random suffix is deterministic and the existing
// exact-slug assertions below stay meaningful.
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeCrypto>();
  return { ...actual, randomUUID: () => 'abcdef12-3456-7890-abcd-ef1234567890' };
});

const TENANT_ID_DEFAULT = '11111111-1111-4111-8111-111111111111';
const TENANT_ID_ALT = '22222222-2222-4222-8222-222222222222';
const RANDOM_SUFFIX = 'abcdef';

const tenantView = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: TENANT_ID_DEFAULT,
  slug: `cafe-roma-${RANDOM_SUFFIX}`,
  displayName: `cafe-roma-${RANDOM_SUFFIX}`,
  status: 'pending_setup',
  primaryDomainHostname: `cafe-roma-${RANDOM_SUFFIX}.menu.resto.app`,
  ...overrides,
});

const buildAuthMock = () => ({
  api: {
    signInEmail: vi.fn().mockResolvedValue({
      response: { user: { id: 'u-1' } },
      headers: new Headers({ 'set-cookie': 'better-auth.session_token=abc; Path=/; HttpOnly' }),
    }),
  },
});

const buildTenantActivatorMock = () => ({
  activateTenant: vi.fn().mockResolvedValue({
    headers: new Headers({
      'set-cookie': 'better-auth.session_token=abc-active; Path=/; HttpOnly',
    }),
  }),
});

interface BaUserReaderMock {
  findUserByEmail: ReturnType<typeof vi.fn>;
  findOwnerByTenant: ReturnType<typeof vi.fn>;
}

const buildUsersMock = (
  existingUser: { id: string; email: string } | null = null,
): BaUserReaderMock => ({
  findUserByEmail: vi.fn().mockResolvedValue(existingUser),
  findOwnerByTenant: vi.fn().mockResolvedValue(null),
});

describe('SignUpService', () => {
  let tenantProvisioningMock: {
    provision: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    finalizeSetup: ReturnType<typeof vi.fn>;
  };
  let bootstrapMock: { execute: ReturnType<typeof vi.fn> };
  let tenantLookupMock: {
    findBySlug: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
  };
  let authMock: ReturnType<typeof buildAuthMock>;
  let usersMock: BaUserReaderMock;
  let tenantActivatorMock: ReturnType<typeof buildTenantActivatorMock>;

  const buildService = (): SignUpService =>
    new SignUpService(
      tenantProvisioningMock,
      bootstrapMock as never,
      tenantLookupMock,
      authMock as never,
      usersMock,
      tenantActivatorMock,
    );

  const baseInput = {
    name: 'Cafe Roma',
    email: 'owner@example.com',
    password: 'a-strong-password-12',
    country: 'GB' as const,
  };

  beforeEach(() => {
    tenantProvisioningMock = { provision: vi.fn(), findById: vi.fn(), finalizeSetup: vi.fn() };
    bootstrapMock = { execute: vi.fn() };
    tenantLookupMock = { findBySlug: vi.fn(), findById: vi.fn() };
    authMock = buildAuthMock();
    usersMock = buildUsersMock();
    tenantActivatorMock = buildTenantActivatorMock();
  });

  it('uses base slug when free', async () => {
    tenantLookupMock.findBySlug.mockResolvedValue(null);
    tenantProvisioningMock.provision.mockResolvedValue(tenantView());
    bootstrapMock.execute.mockResolvedValue({});

    const result = await buildService().execute(baseInput);

    expect(tenantLookupMock.findBySlug).toHaveBeenCalledTimes(1);
    expect(tenantProvisioningMock.provision).toHaveBeenCalledWith(
      expect.objectContaining({ slug: `cafe-roma-${RANDOM_SUFFIX}`, status: 'pending_setup' }),
    );
    expect(result.userId).toBe('u-1');
    expect(result.setCookie).toHaveLength(1);
  });

  it('uses set-active cookies when set-active succeeds', async () => {
    tenantLookupMock.findBySlug.mockResolvedValue(null);
    tenantProvisioningMock.provision.mockResolvedValue(tenantView());
    bootstrapMock.execute.mockResolvedValue({});
    const result = await buildService().execute(baseInput);
    expect(result.setCookie[0]).toMatch(/abc-active/);
  });

  it('rejects duplicate email pre-flight (no provision call)', async () => {
    usersMock = buildUsersMock({ id: 'existing-user', email: baseInput.email });
    await expect(buildService().execute(baseInput)).rejects.toThrow(SignupEmailAlreadyExistsError);
    expect(tenantProvisioningMock.provision).not.toHaveBeenCalled();
    expect(tenantLookupMock.findBySlug).not.toHaveBeenCalled();
  });

  it('falls back to sign-in cookies if set-active throws', async () => {
    tenantLookupMock.findBySlug.mockResolvedValue(null);
    tenantProvisioningMock.provision.mockResolvedValue(tenantView());
    bootstrapMock.execute.mockResolvedValue({});
    tenantActivatorMock.activateTenant.mockRejectedValueOnce(new Error('no-tenant-membership'));
    const result = await buildService().execute(baseInput);
    expect(result.setCookie[0]).toMatch(/=abc;/);
  });

  it('appends -2, -3 suffix on slug collision', async () => {
    tenantLookupMock.findBySlug
      .mockResolvedValueOnce({ id: 't-existing-1' })
      .mockResolvedValueOnce({ id: 't-existing-2' })
      .mockResolvedValueOnce(null);
    const bumpedSlug = `cafe-roma-${RANDOM_SUFFIX}-3`;
    tenantProvisioningMock.provision.mockResolvedValue(tenantView({ slug: bumpedSlug }));
    bootstrapMock.execute.mockResolvedValue({});

    const result = await buildService().execute(baseInput);

    expect(tenantLookupMock.findBySlug).toHaveBeenCalledTimes(3);
    expect(tenantProvisioningMock.provision).toHaveBeenCalledWith(
      expect.objectContaining({ slug: bumpedSlug }),
    );
    expect(result.tenant.slug).toBe(bumpedSlug);
  });

  it('throws SlugUnavailableError after 100 attempts', async () => {
    tenantLookupMock.findBySlug.mockResolvedValue({ id: 't-x' });
    await expect(buildService().execute(baseInput)).rejects.toThrow(SlugUnavailableError);
    expect(tenantProvisioningMock.provision).not.toHaveBeenCalled();
  });

  it('maps OwnerAlreadyExistsError to SignupEmailAlreadyExistsError', async () => {
    tenantLookupMock.findBySlug.mockResolvedValue(null);
    tenantProvisioningMock.provision.mockResolvedValue(tenantView());
    bootstrapMock.execute.mockRejectedValue(
      new OwnerAlreadyExistsError(TENANT_ID_DEFAULT, 'someone-else@example.com'),
    );
    await expect(buildService().execute(baseInput)).rejects.toThrow(SignupEmailAlreadyExistsError);
  });

  it('slugifies non-ASCII name', async () => {
    tenantLookupMock.findBySlug.mockResolvedValue(null);
    tenantProvisioningMock.provision.mockResolvedValue(tenantView());
    bootstrapMock.execute.mockResolvedValue({});
    await buildService().execute({ ...baseInput, name: 'Café Mañana' });
    expect(tenantProvisioningMock.provision).toHaveBeenCalledWith(
      expect.objectContaining({ slug: expect.stringMatching(/^cafe-manana-/) }),
    );
  });

  it('wraps BA sign-up failure as SignupBetterAuthFailureError(signUpEmail)', async () => {
    tenantLookupMock.findBySlug.mockResolvedValue(null);
    tenantProvisioningMock.provision.mockResolvedValue(tenantView());
    bootstrapMock.execute.mockRejectedValue(
      new BetterAuthBootstrapFailureError('signUpEmail', new Error('boom')),
    );
    await expect(buildService().execute(baseInput)).rejects.toMatchObject({
      name: 'SignupBetterAuthFailureError',
      stage: 'signUpEmail',
    });
  });

  it('wraps BA addMember failure as SignupBetterAuthFailureError(addMember)', async () => {
    tenantLookupMock.findBySlug.mockResolvedValue(null);
    tenantProvisioningMock.provision.mockResolvedValue(tenantView());
    bootstrapMock.execute.mockRejectedValue(
      new BetterAuthBootstrapFailureError('addMember', new Error('boom')),
    );
    await expect(buildService().execute(baseInput)).rejects.toMatchObject({
      name: 'SignupBetterAuthFailureError',
      stage: 'addMember',
    });
  });

  it('wraps BA signInEmail failure as SignupBetterAuthFailureError(signInEmail)', async () => {
    tenantLookupMock.findBySlug.mockResolvedValue(null);
    tenantProvisioningMock.provision.mockResolvedValue(tenantView());
    bootstrapMock.execute.mockResolvedValue({});
    authMock.api.signInEmail.mockRejectedValueOnce(new Error('email-not-verified'));
    const err = await buildService()
      .execute(baseInput)
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(SignupBetterAuthFailureError);
    expect((err as SignupBetterAuthFailureError).stage).toBe('signInEmail');
  });

  it('passes tenantId to the tenant activator port', async () => {
    tenantLookupMock.findBySlug.mockResolvedValue(null);
    tenantProvisioningMock.provision.mockResolvedValue(tenantView({ id: TENANT_ID_ALT }));
    bootstrapMock.execute.mockResolvedValue({});
    await buildService().execute(baseInput);
    expect(tenantActivatorMock.activateTenant).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID_ALT }),
    );
  });
});
