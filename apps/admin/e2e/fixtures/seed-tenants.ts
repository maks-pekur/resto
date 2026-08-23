const apiOrigin = (): string => process.env.ADMIN_E2E_API_ORIGIN ?? 'http://localhost:5001';
const internalToken = (): string =>
  process.env.INTERNAL_API_TOKEN ?? 'dev-internal-token-min-16-chars';

export const FIXTURES = {
  soloOwner: {
    email: 'solo@e2e.test',
    password: 'e2e-passwd-1234',
    name: 'Solo Owner',
    tenantSlug: 'e2e-solo-owner',
    tenantDisplayName: 'E2E Solo Co',
  },
  pendingOwner: {
    email: 'pending@e2e.test',
    password: 'e2e-passwd-1234',
    name: 'Pending Owner',
    tenantSlug: 'e2e-pending-owner',
    tenantDisplayName: 'E2E Pending Co',
  },
  twoOrgOwner: {
    email: 'twoorg@e2e.test',
    password: 'e2e-passwd-1234',
    name: 'Two Org Owner',
    tenantASlug: 'e2e-two-org-a',
    tenantADisplayName: 'E2E Org Alpha',
    tenantBSlug: 'e2e-two-org-b',
    tenantBDisplayName: 'E2E Org Bravo',
  },
} as const;

interface TenantSummary {
  readonly id: string;
  readonly slug: string;
}

interface ProvisionTenantInput {
  readonly slug: string;
  readonly displayName: string;
  readonly country?: string;
  readonly status?: 'pending_setup' | 'active';
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
      country: input.country ?? 'GB',
      status: input.status,
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

// `BootstrapOwnerService.execute` reuses an existing Better Auth user by
// email and adds them as owner of the NEW tenant too — this is what lets
// `twoOrgOwner` hold two separate memberships without any direct DB write
// (10.2 plan 19; see apps/api/.../bootstrap-owner.service.ts).
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

/**
 * Idempotent seed for the ADM-00 fixture scenarios (10.2 plan 19). Re-running
 * on a primed DB is a no-op (409s from the tenant-create endpoint short the
 * matching bootstrap call).
 *
 * `oneBrandStaff`-style non-owner seeding is still not possible: `apps/api`
 * exposes no internal endpoint to add a non-owner member to a tenant. The
 * scenario that needed it (a filtered `GET /v1/me/brands`) is deleted, not
 * downgraded to `.fixme` — see `adm-00-smoke-walk.spec.ts`'s own comment.
 */
export const seedScenarioTenants = async (): Promise<void> => {
  const solo = await provisionTenant({
    slug: FIXTURES.soloOwner.tenantSlug,
    displayName: FIXTURES.soloOwner.tenantDisplayName,
  });
  if (solo) {
    await bootstrapOwner(solo.id, {
      email: FIXTURES.soloOwner.email,
      password: FIXTURES.soloOwner.password,
      name: FIXTURES.soloOwner.name,
    });
  }

  const pending = await provisionTenant({
    slug: FIXTURES.pendingOwner.tenantSlug,
    displayName: FIXTURES.pendingOwner.tenantDisplayName,
    status: 'pending_setup',
  });
  if (pending) {
    await bootstrapOwner(pending.id, {
      email: FIXTURES.pendingOwner.email,
      password: FIXTURES.pendingOwner.password,
      name: FIXTURES.pendingOwner.name,
    });
  }

  const orgA = await provisionTenant({
    slug: FIXTURES.twoOrgOwner.tenantASlug,
    displayName: FIXTURES.twoOrgOwner.tenantADisplayName,
  });
  if (orgA) {
    await bootstrapOwner(orgA.id, {
      email: FIXTURES.twoOrgOwner.email,
      password: FIXTURES.twoOrgOwner.password,
      name: FIXTURES.twoOrgOwner.name,
    });
  }

  const orgB = await provisionTenant({
    slug: FIXTURES.twoOrgOwner.tenantBSlug,
    displayName: FIXTURES.twoOrgOwner.tenantBDisplayName,
  });
  if (orgB) {
    await bootstrapOwner(orgB.id, {
      email: FIXTURES.twoOrgOwner.email,
      password: FIXTURES.twoOrgOwner.password,
      name: FIXTURES.twoOrgOwner.name,
    });
  }
};
