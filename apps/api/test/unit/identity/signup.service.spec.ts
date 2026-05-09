import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Currency } from '@resto/domain';
import { SignUpService } from '../../../src/contexts/identity/application/signup.service';
import {
  SlugUnavailableError,
  SignupEmailAlreadyExistsError,
} from '../../../src/contexts/identity/domain/signup-errors';
import { OwnerAlreadyExistsError } from '../../../src/contexts/identity/domain/bootstrap-errors';

const tenantSnapshot = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 't-1',
  slug: 'cafe-roma',
  displayName: 'Cafe Roma',
  status: 'active',
  locale: 'en',
  defaultCurrency: 'USD',
  primaryDomain: { id: 'd-1', domain: 'cafe-roma.menu.resto.app', isPrimary: true },
  stripeAccountId: null,
  archivedAt: null,
  offboardingScheduledAt: null,
  offboardingExecutedAt: null,
  offboardingRequestedBy: null,
  customDomains: [],
  createdAt: new Date(),
  updatedAt: new Date(),
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

describe('SignUpService', () => {
  let provisionMock: { execute: ReturnType<typeof vi.fn> };
  let bootstrapMock: { execute: ReturnType<typeof vi.fn> };
  let tenantsMock: { findBySlug: ReturnType<typeof vi.fn> };
  let authMock: ReturnType<typeof buildAuthMock>;

  const buildService = (): SignUpService =>
    new SignUpService(
      provisionMock as never,
      bootstrapMock as never,
      tenantsMock as never,
      authMock as never,
    );

  const baseInput = {
    email: 'owner@example.com',
    password: 'a-strong-password-12',
    displayName: 'Cafe Roma',
    defaultCurrency: Currency.parse('USD'),
    locale: 'en',
  };

  beforeEach(() => {
    provisionMock = { execute: vi.fn() };
    bootstrapMock = { execute: vi.fn() };
    tenantsMock = { findBySlug: vi.fn() };
    authMock = buildAuthMock();
  });

  it('uses base slug when free', async () => {
    tenantsMock.findBySlug.mockResolvedValue(null);
    provisionMock.execute.mockResolvedValue(tenantSnapshot());
    bootstrapMock.execute.mockResolvedValue({});

    const result = await buildService().execute(baseInput);

    expect(tenantsMock.findBySlug).toHaveBeenCalledTimes(1);
    expect(provisionMock.execute).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'cafe-roma' }),
    );
    expect(result.userId).toBe('u-1');
    expect(result.setCookie).toHaveLength(1);
  });

  it('uses set-active cookies when set-active succeeds', async () => {
    tenantsMock.findBySlug.mockResolvedValue(null);
    provisionMock.execute.mockResolvedValue(tenantSnapshot());
    bootstrapMock.execute.mockResolvedValue({});
    const result = await buildService().execute(baseInput);
    expect(result.setCookie[0]).toMatch(/abc-active/);
  });

  it('falls back to sign-in cookies if set-active throws', async () => {
    tenantsMock.findBySlug.mockResolvedValue(null);
    provisionMock.execute.mockResolvedValue(tenantSnapshot());
    bootstrapMock.execute.mockResolvedValue({});
    authMock.api.setActiveOrganization.mockRejectedValueOnce(new Error('no-org-membership'));
    const result = await buildService().execute(baseInput);
    expect(result.setCookie[0]).toMatch(/=abc;/);
  });

  it('appends -2, -3 suffix on slug collision', async () => {
    tenantsMock.findBySlug
      .mockResolvedValueOnce({ id: 't-existing-1' })
      .mockResolvedValueOnce({ id: 't-existing-2' })
      .mockResolvedValueOnce(null);
    provisionMock.execute.mockResolvedValue(tenantSnapshot({ slug: 'cafe-roma-3' }));
    bootstrapMock.execute.mockResolvedValue({});

    const result = await buildService().execute(baseInput);

    expect(tenantsMock.findBySlug).toHaveBeenCalledTimes(3);
    expect(provisionMock.execute).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'cafe-roma-3' }),
    );
    expect(result.tenant.slug).toBe('cafe-roma-3');
  });

  it('throws SlugUnavailableError after 100 attempts', async () => {
    tenantsMock.findBySlug.mockResolvedValue({ id: 't-x' });
    await expect(buildService().execute(baseInput)).rejects.toThrow(SlugUnavailableError);
    expect(provisionMock.execute).not.toHaveBeenCalled();
  });

  it('maps OwnerAlreadyExistsError to SignupEmailAlreadyExistsError', async () => {
    tenantsMock.findBySlug.mockResolvedValue(null);
    provisionMock.execute.mockResolvedValue(tenantSnapshot());
    bootstrapMock.execute.mockRejectedValue(
      new OwnerAlreadyExistsError('t-1', 'someone-else@example.com'),
    );
    await expect(buildService().execute(baseInput)).rejects.toThrow(SignupEmailAlreadyExistsError);
  });

  it('slugifies non-ASCII displayName', async () => {
    tenantsMock.findBySlug.mockResolvedValue(null);
    provisionMock.execute.mockResolvedValue(tenantSnapshot());
    bootstrapMock.execute.mockResolvedValue({});
    await buildService().execute({ ...baseInput, displayName: 'Café Mañana' });
    expect(provisionMock.execute).toHaveBeenCalledWith(
      expect.objectContaining({ slug: expect.stringMatching(/^cafe-/) }),
    );
  });

  it('passes tenantId to setActiveOrganization', async () => {
    tenantsMock.findBySlug.mockResolvedValue(null);
    provisionMock.execute.mockResolvedValue(tenantSnapshot({ id: 't-99' }));
    bootstrapMock.execute.mockResolvedValue({});
    await buildService().execute(baseInput);
    expect(authMock.api.setActiveOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { organizationId: 't-99' },
        returnHeaders: true,
      }),
    );
  });
});
