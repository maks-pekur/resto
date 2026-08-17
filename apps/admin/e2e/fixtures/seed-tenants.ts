const apiOrigin = (): string => process.env.ADMIN_E2E_API_ORIGIN ?? 'http://localhost:5001';
const adminOrigin = (): string => process.env.ADMIN_E2E_BASE_URL ?? 'http://localhost:4000';
const internalToken = (): string =>
  process.env.INTERNAL_API_TOKEN ?? 'dev-internal-token-min-16-chars';

export const FIXTURES = {
  zeroBrands: {
    email: 'zero@e2e.test',
    password: 'e2e-passwd-1234',
    name: 'Zero Brand Owner',
    tenantSlug: 'e2e-zero-brands',
    tenantDisplayName: 'E2E Zero-Brand Co',
  },
  oneBrandOwner: {
    email: 'one@e2e.test',
    password: 'e2e-passwd-1234',
    name: 'One Brand Owner',
    tenantSlug: 'e2e-one-brand',
    tenantDisplayName: 'E2E One-Brand Co',
    brand: { slug: 'e2e-one-brand-main', displayName: 'Main Brand' },
  },
  oneBrandStaff: {
    email: 'staff@e2e.test',
    password: 'e2e-passwd-1234',
    name: 'One Brand Staff',
  },
  threeBrands: {
    email: 'three@e2e.test',
    password: 'e2e-passwd-1234',
    name: 'Three Brand Owner',
    tenantSlug: 'e2e-three-brands',
    tenantDisplayName: 'E2E Three-Brand Co',
    brands: [
      { slug: 'e2e-three-brand-a', displayName: 'Brand Alpha' },
      { slug: 'e2e-three-brand-b', displayName: 'Brand Bravo' },
      { slug: 'e2e-three-brand-c', displayName: 'Brand Charlie' },
    ],
  },
} as const;

interface TenantSummary {
  readonly id: string;
  readonly slug: string;
}

interface BrandSummary {
  readonly id: string;
  readonly slug: string;
}

interface ProvisionTenantInput {
  readonly slug: string;
  readonly displayName: string;
  readonly defaultCurrency?: string;
  readonly locale?: string;
}

const internalHeaders = (): Record<string, string> => ({
  'content-type': 'application/json',
  'x-internal-token': internalToken(),
});

const provisionTenant = async (input: ProvisionTenantInput): Promise<TenantSummary | null> => {
  const res = await fetch(`${apiOrigin()}/internal/v1/tenants`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({
      slug: input.slug,
      displayName: input.displayName,
      defaultCurrency: input.defaultCurrency ?? 'USD',
      locale: input.locale ?? 'en',
    }),
  });
  if (res.status === 201) {
    return (await res.json()) as TenantSummary;
  }
  if (res.status === 409) {
    return null;
  }
  throw new Error(`provisionTenant ${input.slug} → ${String(res.status)} ${await res.text()}`);
};

const bootstrapOwner = async (
  tenantId: string,
  input: { email: string; password: string; name: string },
): Promise<void> => {
  const res = await fetch(`${apiOrigin()}/internal/v1/tenants/${tenantId}/owner`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify(input),
  });
  if (res.status === 201 || res.status === 200 || res.status === 409) {
    return;
  }
  throw new Error(`bootstrapOwner ${input.email} → ${String(res.status)} ${await res.text()}`);
};

const signInAndGetCookie = async (email: string, password: string): Promise<string> => {
  const res = await fetch(`${apiOrigin()}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: adminOrigin() },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) {
    throw new Error(`signIn ${email} → ${String(res.status)} ${await res.text()}`);
  }
  const setCookie = res.headers.get('set-cookie') ?? '';
  return setCookie
    .split(',')
    .map((c) => c.split(';')[0]?.trim() ?? '')
    .filter(Boolean)
    .join('; ');
};

const setActiveOrg = async (cookie: string, tenantId: string): Promise<string> => {
  const res = await fetch(`${apiOrigin()}/api/auth/organization/set-active`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, origin: adminOrigin() },
    body: JSON.stringify({ organizationId: tenantId }),
  });
  if (res.status !== 200) {
    throw new Error(`setActiveOrg ${tenantId} → ${String(res.status)} ${await res.text()}`);
  }
  const setCookie = res.headers.get('set-cookie');
  if (setCookie === null || setCookie === '') return cookie;
  return setCookie
    .split(',')
    .map((c) => c.split(';')[0]?.trim() ?? '')
    .filter(Boolean)
    .join('; ');
};

const createBrand = async (
  cookie: string,
  tenantId: string,
  brand: { slug: string; displayName: string },
): Promise<BrandSummary | null> => {
  const res = await fetch(`${apiOrigin()}/v1/me/brands`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie,
      'x-tenant-id': tenantId,
    },
    body: JSON.stringify({ slug: brand.slug, displayName: brand.displayName }),
  });
  if (res.status === 201) {
    return (await res.json()) as BrandSummary;
  }
  if (res.status === 409) {
    return null;
  }
  throw new Error(`createBrand ${brand.slug} → ${String(res.status)} ${await res.text()}`);
};

const seedTenantWithBrands = async (
  fx: {
    email: string;
    password: string;
    name: string;
    tenantSlug: string;
    tenantDisplayName: string;
  },
  brands: readonly { slug: string; displayName: string }[],
): Promise<void> => {
  const tenant = await provisionTenant({
    slug: fx.tenantSlug,
    displayName: fx.tenantDisplayName,
  });
  if (tenant === null) {
    return;
  }
  await bootstrapOwner(tenant.id, { email: fx.email, password: fx.password, name: fx.name });
  if (brands.length === 0) return;
  const cookieBase = await signInAndGetCookie(fx.email, fx.password);
  const cookieWithOrg = await setActiveOrg(cookieBase, tenant.id);
  for (const brand of brands) {
    await createBrand(cookieWithOrg, tenant.id, brand);
  }
};

/**
 * Idempotent seed for the four ADM-00 fixture scenarios. Re-running on a
 * primed DB is a no-op (409s from tenant + brand create endpoints).
 *
 * The `oneBrandStaff` operator is NOT seeded here: `apps/api` exposes no
 * internal endpoint to add a non-owner member to a tenant, and direct DB
 * insertion would need to mirror Better Auth's password-credential format
 * which is Phase 03 territory (RBAC seed). Scenario 4 in
 * `adm-00-smoke-walk.spec.ts` runs against the owner instead and is
 * downgraded to `test.fixme` per CONTEXT Out-of-scope until Phase 03
 * lands the staff-role bootstrap path.
 */
export const seedScenarioTenants = async (): Promise<void> => {
  await seedTenantWithBrands(FIXTURES.zeroBrands, []);
  await seedTenantWithBrands(FIXTURES.oneBrandOwner, [FIXTURES.oneBrandOwner.brand]);
  await seedTenantWithBrands(
    FIXTURES.threeBrands,
    FIXTURES.threeBrands.brands.map((b) => ({ slug: b.slug, displayName: b.displayName })),
  );
};
