import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Currency } from '@resto/domain';
import { SignUpService } from '../../../src/contexts/identity/application/signup.service';
import {
  SlugUnavailableError,
  SignupEmailAlreadyExistsError,
} from '../../../src/contexts/identity/domain/signup-errors';
import { OwnerAlreadyExistsError } from '../../../src/contexts/identity/domain/bootstrap-errors';

const TENANT_ID_DEFAULT = '11111111-1111-4111-8111-111111111111';
const TENANT_ID_ALT = '22222222-2222-4222-8222-222222222222';

const tenantView = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: TENANT_ID_DEFAULT,
  slug: 'cafe-roma',
  displayName: 'Cafe Roma',
  status: 'active',
  primaryDomainHostname: 'cafe-roma.menu.resto.app',
  ...overrides,
});

const buildAuthMock = () => ({
  api: {
    signInEmail: vi.fn().mockResolvedValue({
      response: { user: { id: 'u-1' } },
      headers: new Headers({ 'set-cookie': 'better-auth.session_token=abc; Path=/; HttpOnly' }),
    }),
    setActiveOrganization: vi.fn().mockResolvedValue({
      headers: new Headers({
        'set-cookie': 'better-auth.session_token=abc-active; Path=/; HttpOnly',
      }),
    }),
  },
});

interface AuthDbMock {
  db: {
    select: ReturnType<typeof vi.fn>;
    from: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
  };
}

const buildAuthDbMock = (existingRows: readonly { id: string }[] = []): AuthDbMock => {
  const limit = vi.fn().mockResolvedValue(existingRows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where, limit });
  const select = vi.fn().mockReturnValue({ from, where, limit });
  return { db: { select, from, where, limit } };
};

describe('SignUpService', () => {
  let tenantProvisioningMock: { provision: ReturnType<typeof vi.fn> };
  let bootstrapMock: { execute: ReturnType<typeof vi.fn> };
  let tenantLookupMock: {
    findBySlug: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
  };
  let authMock: ReturnType<typeof buildAuthMock>;
  let authDbMock: AuthDbMock;

  const buildService = (): SignUpService =>
    new SignUpService(
      tenantProvisioningMock,
      bootstrapMock as never,
      tenantLookupMock,
      authMock as never,
      authDbMock as never,
    );

  const baseInput = {
    email: 'owner@example.com',
    password: 'a-strong-password-12',
    displayName: 'Cafe Roma',
    defaultCurrency: Currency.parse('USD'),
    locale: 'en',
  };

  beforeEach(() => {
    tenantProvisioningMock = { provision: vi.fn() };
    bootstrapMock = { execute: vi.fn() };
    tenantLookupMock = { findBySlug: vi.fn(), findById: vi.fn() };
    authMock = buildAuthMock();
    authDbMock = buildAuthDbMock();
  });

  it('uses base slug when free', async () => {
    tenantLookupMock.findBySlug.mockResolvedValue(null);
    tenantProvisioningMock.provision.mockResolvedValue(tenantView());
    bootstrapMock.execute.mockResolvedValue({});

    const result = await buildService().execute(baseInput);

    expect(tenantLookupMock.findBySlug).toHaveBeenCalledTimes(1);
    expect(tenantProvisioningMock.provision).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'cafe-roma' }),
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
    authDbMock = buildAuthDbMock([{ id: 'existing-user' }]);
    await expect(buildService().execute(baseInput)).rejects.toThrow(SignupEmailAlreadyExistsError);
    expect(tenantProvisioningMock.provision).not.toHaveBeenCalled();
    expect(tenantLookupMock.findBySlug).not.toHaveBeenCalled();
  });

  it('falls back to sign-in cookies if set-active throws', async () => {
    tenantLookupMock.findBySlug.mockResolvedValue(null);
    tenantProvisioningMock.provision.mockResolvedValue(tenantView());
    bootstrapMock.execute.mockResolvedValue({});
    authMock.api.setActiveOrganization.mockRejectedValueOnce(new Error('no-org-membership'));
    const result = await buildService().execute(baseInput);
    expect(result.setCookie[0]).toMatch(/=abc;/);
  });

  it('appends -2, -3 suffix on slug collision', async () => {
    tenantLookupMock.findBySlug
      .mockResolvedValueOnce({ id: 't-existing-1' })
      .mockResolvedValueOnce({ id: 't-existing-2' })
      .mockResolvedValueOnce(null);
    tenantProvisioningMock.provision.mockResolvedValue(tenantView({ slug: 'cafe-roma-3' }));
    bootstrapMock.execute.mockResolvedValue({});

    const result = await buildService().execute(baseInput);

    expect(tenantLookupMock.findBySlug).toHaveBeenCalledTimes(3);
    expect(tenantProvisioningMock.provision).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'cafe-roma-3' }),
    );
    expect(result.tenant.slug).toBe('cafe-roma-3');
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

  it('slugifies non-ASCII displayName', async () => {
    tenantLookupMock.findBySlug.mockResolvedValue(null);
    tenantProvisioningMock.provision.mockResolvedValue(tenantView());
    bootstrapMock.execute.mockResolvedValue({});
    await buildService().execute({ ...baseInput, displayName: 'Café Mañana' });
    expect(tenantProvisioningMock.provision).toHaveBeenCalledWith(
      expect.objectContaining({ slug: expect.stringMatching(/^cafe-/) }),
    );
  });

  it('passes tenantId to setActiveOrganization', async () => {
    tenantLookupMock.findBySlug.mockResolvedValue(null);
    tenantProvisioningMock.provision.mockResolvedValue(tenantView({ id: TENANT_ID_ALT }));
    bootstrapMock.execute.mockResolvedValue({});
    await buildService().execute(baseInput);
    expect(authMock.api.setActiveOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { organizationId: TENANT_ID_ALT },
        returnHeaders: true,
      }),
    );
  });
});
