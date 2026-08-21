import { type CountryCodeValue, type CurrencyValue, currencyForCountry } from '@resto/domain';
import type { Sql } from 'postgres';
import { ApiClient } from '../lib/api-client';
import { createAuthDb, findMemberId, findUserIdByEmail, insertStaffMember } from '../lib/auth-db';
import { printDemoCredentialsBlock } from '../lib/credentials-block';
import { log } from '../lib/logger';
import type { RuntimeOptions } from '../lib/options';
import { OperatorHttpClient, signInAsOperator } from '../lib/operator-http';
import { createAppDb, seedDemoOrder, DEMO_ORDER_SPECS } from '../lib/demo-orders';

const DEMO_PASSWORD = 'DevPassword123!';
const ADMIN_URL = 'http://localhost:4000';

interface TenantResponse {
  readonly id: string;
  readonly slug: string;
}

interface BootstrapOwnerResponse {
  readonly userId: string;
}

interface LocationResponse {
  readonly id: string;
  readonly name: string;
}

interface CategoryListItem {
  readonly id: string;
  readonly slug: string;
}

interface CategoryListResponse {
  readonly items: readonly CategoryListItem[];
}

interface ItemListItem {
  readonly id: string;
  readonly slug: string;
}

interface ItemListResponse {
  readonly items: readonly ItemListItem[];
}

interface OrgDef {
  readonly slug: string;
  readonly displayName: string;
  readonly country: CountryCodeValue;
  readonly locations: readonly string[];
}

// D-33/D-34/D-35: one entry per market so the fixture exercises all three
// supported countries and their derived currencies, not a single happy path.
const ORGANIZATIONS: readonly OrgDef[] = [
  {
    slug: 'pizza',
    displayName: 'Pizza Palace',
    country: 'UA',
    locations: ['Kyiv Center', 'Kyiv Left Bank'],
  },
  { slug: 'burger', displayName: 'Burger Barn', country: 'GB', locations: ['Central', 'Mall'] },
  { slug: 'tapas', displayName: 'Tapas Bar', country: 'ES', locations: ['Madrid Centro'] },
];

interface ItemDef {
  readonly slug: string;
  readonly name: string;
  readonly price: string;
}

interface CategoryDef {
  readonly slug: string;
  readonly name: string;
  readonly items: readonly ItemDef[];
}

const CATALOG: Readonly<Record<string, readonly CategoryDef[]>> = {
  pizza: [
    {
      slug: 'pizzas',
      name: 'Pizzas',
      items: [
        { slug: 'margherita', name: 'Margherita', price: '9.99' },
        { slug: 'pepperoni', name: 'Pepperoni', price: '11.99' },
      ],
    },
    {
      slug: 'drinks',
      name: 'Drinks',
      items: [
        { slug: 'cola', name: 'Cola', price: '2.50' },
        { slug: 'water', name: 'Water', price: '1.50' },
      ],
    },
  ],
  burger: [
    {
      slug: 'burgers',
      name: 'Burgers',
      items: [
        { slug: 'cheeseburger', name: 'Cheeseburger', price: '8.99' },
        { slug: 'veggie-burger', name: 'Veggie Burger', price: '8.49' },
      ],
    },
    {
      slug: 'sides',
      name: 'Sides',
      items: [
        { slug: 'fries', name: 'Fries', price: '3.99' },
        { slug: 'onion-rings', name: 'Onion Rings', price: '4.49' },
      ],
    },
  ],
  tapas: [
    {
      slug: 'tapas',
      name: 'Tapas',
      items: [
        { slug: 'patatas-bravas', name: 'Patatas Bravas', price: '5.50' },
        { slug: 'gambas-al-ajillo', name: 'Gambas al Ajillo', price: '8.50' },
      ],
    },
    {
      slug: 'drinks',
      name: 'Drinks',
      items: [
        { slug: 'sangria', name: 'Sangria', price: '4.50' },
        { slug: 'agua', name: 'Agua', price: '1.80' },
      ],
    },
  ],
};

interface StaffDef {
  readonly email: string;
  readonly name: string;
  readonly organization: string;
  readonly roleSlug: string;
  readonly locations: readonly string[];
}

// D-17: staff belong to exactly one organization — never several.
const STAFF: readonly StaffDef[] = [
  {
    email: 'manager@demo.local',
    name: 'Demo Manager',
    organization: 'pizza',
    roleSlug: 'manager',
    locations: ['Kyiv Center', 'Kyiv Left Bank'],
  },
  {
    email: 'cashier@demo.local',
    name: 'Demo Cashier',
    organization: 'burger',
    roleSlug: 'cashier-foh',
    locations: ['Central'],
  },
];

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Required environment variable ${name} is not set.`);
  return value;
};

const ensureLocations = async (
  op: OperatorHttpClient,
  org: OrgDef,
): Promise<Map<string, string>> => {
  const existing = await op.get<LocationResponse[]>('/v1/tenancy/locations');
  const byName = new Map(existing.map((l) => [l.name, l.id]));

  for (const name of org.locations) {
    if (byName.has(name)) {
      log('seed-demo.location.exists', { organization: org.slug, name });
      continue;
    }
    const created = await op.post<LocationResponse>('/v1/tenancy/locations', {
      name,
      address: null,
      timezone: null,
      contacts: null,
    });
    byName.set(name, created.id);
    log('seed-demo.location.created', { organization: org.slug, name, id: created.id });
  }
  return byName;
};

const ensureCatalog = async (
  op: OperatorHttpClient,
  orgSlug: string,
  currency: CurrencyValue,
): Promise<void> => {
  const existingCategories = await op.get<CategoryListResponse>('/v1/catalog/categories');
  const categoryBySlug = new Map(existingCategories.items.map((c) => [c.slug, c.id]));

  for (const category of CATALOG[orgSlug] ?? []) {
    let categoryId = categoryBySlug.get(category.slug);
    if (categoryId) {
      log('seed-demo.category.exists', { organization: orgSlug, slug: category.slug });
    } else {
      const created = await op.post<{ id: string }>('/v1/catalog/categories', {
        slug: category.slug,
        name: { en: category.name },
        parentId: null,
        description: null,
        sortOrder: 0,
        code: null,
      });
      categoryId = created.id;
      log('seed-demo.category.created', {
        organization: orgSlug,
        slug: category.slug,
        id: categoryId,
      });
    }

    const existingItems = await op.get<ItemListResponse>(
      `/v1/catalog/items?categoryId=${categoryId}&status=all`,
    );
    const itemBySlug = new Map(existingItems.items.map((i) => [i.slug, i.id]));

    for (const item of category.items) {
      const existingId = itemBySlug.get(item.slug);
      const payload = {
        ...(existingId ? { id: existingId } : {}),
        categoryId,
        slug: item.slug,
        name: { en: item.name },
        basePrice: item.price,
        currency,
        status: 'published' as const,
      };
      await op.post('/v1/catalog/items', payload);
      log(existingId ? 'seed-demo.item.updated' : 'seed-demo.item.created', {
        organization: orgSlug,
        slug: item.slug,
      });
    }
  }

  await op.post('/v1/catalog/publish', {}).catch((err: unknown) => {
    log('seed-demo.publish.skipped', { organization: orgSlug, err: String(err) });
  });
};

/**
 * Creates (or reuses) the BA user + `member` row for a staff fixture.
 *
 * `/api/auth/sign-up/email` is closed to external callers without a
 * pending invitation (D-29, 10.2 plan 13) — the seed's real HTTP call
 * would now 403. `/internal/v1/tenants/:id/owner` is the one remaining
 * internal-token-gated path that creates a BA account without that gate,
 * but it always grants `role: 'owner'`. Safe here only because staff are
 * bootstrapped before the real owner for the same organization (see
 * `runSeedDemo`), so the org has no owner-role member yet; the role is
 * downgraded to 'staff' immediately after.
 */
const ensureStaffAccount = async (
  api: ApiClient,
  authDb: Sql,
  tenant: TenantResponse,
  staff: StaffDef,
): Promise<string> => {
  let userId = await findUserIdByEmail(authDb, staff.email);
  if (userId) {
    log('seed-demo.staff.user_exists', { email: staff.email });
  } else {
    const created = await api.post<BootstrapOwnerResponse>(
      `/internal/v1/tenants/${tenant.id}/owner`,
      { email: staff.email, password: DEMO_PASSWORD, name: staff.name },
    );
    userId = created.userId;
    log('seed-demo.staff.user_created', { email: staff.email, userId });
  }

  let memberId = await findMemberId(authDb, tenant.id, userId);
  if (memberId) {
    await authDb`UPDATE member SET role = 'staff' WHERE id = ${memberId} AND role <> 'staff'`;
    log('seed-demo.staff.member_exists', { email: staff.email, memberId });
  } else {
    memberId = await insertStaffMember(authDb, tenant.id, userId);
    log('seed-demo.staff.member_created', { email: staff.email, memberId });
  }
  return memberId;
};

const seedDemoOrdersForOrg = async (
  op: OperatorHttpClient,
  apiUrl: string,
  tenant: TenantResponse,
  org: OrgDef,
  locationsByName: Map<string, string>,
): Promise<void> => {
  const locationName = org.locations[0];
  const locationId = locationName ? locationsByName.get(locationName) : undefined;
  if (!locationId) {
    log('seed-demo.orders.skipped', { reason: 'no location resolved', organization: org.slug });
    return;
  }
  const items = await op.get<{ items: { id: string; slug: string }[] }>(
    '/v1/catalog/items?status=published',
  );
  const firstItem = items.items[0];
  if (!firstItem) {
    log('seed-demo.orders.skipped', {
      reason: 'no published catalog item',
      organization: org.slug,
    });
    return;
  }
  const appDb = createAppDb(requireEnv('DATABASE_URL'));
  try {
    for (const spec of DEMO_ORDER_SPECS) {
      const seeded = await seedDemoOrder(appDb, {
        apiUrl,
        tenantId: tenant.id,
        locationId,
        itemId: firstItem.id,
        itemName: firstItem.slug,
        spec,
      });
      log('seed-demo.order.seeded', {
        organization: org.slug,
        location: locationName,
        shortNumber: seeded.shortNumber,
        status: seeded.status,
      });
    }
  } finally {
    await appDb.end({ timeout: 5 });
  }
};

export const runSeedDemo = async (
  _argv: readonly string[],
  options: RuntimeOptions,
): Promise<void> => {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error(
      'seed-demo only runs with NODE_ENV=development (dev fixture, not for real envs).',
    );
  }
  const authDatabaseUrl = requireEnv('BETTER_AUTH_DATABASE_URL');

  if (options.dryRun) {
    log('seed-demo.plan', {
      owner: 'owner@demo.local',
      organizations: ORGANIZATIONS.map((o) => ({ slug: o.slug, country: o.country })),
      staff: STAFF.map((s) => s.email),
    });
    return;
  }

  const api = new ApiClient({ apiUrl: options.apiUrl, internalToken: options.internalToken });
  const authDb = createAuthDb(authDatabaseUrl);

  try {
    for (const [index, org] of ORGANIZATIONS.entries()) {
      const tenant = await api.post<TenantResponse>('/internal/v1/tenants', {
        slug: org.slug,
        displayName: org.displayName,
        country: org.country,
      });
      log('seed-demo.tenant.ready', { id: tenant.id, slug: tenant.slug, country: org.country });

      const staffForOrg = STAFF.filter((s) => s.organization === org.slug);
      const memberIdByEmail = new Map<string, string>();
      for (const staff of staffForOrg) {
        memberIdByEmail.set(staff.email, await ensureStaffAccount(api, authDb, tenant, staff));
      }

      await api.post<BootstrapOwnerResponse>(`/internal/v1/tenants/${tenant.id}/owner`, {
        email: 'owner@demo.local',
        password: DEMO_PASSWORD,
        name: 'Demo Owner',
      });
      log('seed-demo.owner.ready', { email: 'owner@demo.local', organization: org.slug });

      const ownerCookie = await signInAsOperator(
        options.apiUrl,
        'owner@demo.local',
        DEMO_PASSWORD,
        tenant.id,
      );
      const op = new OperatorHttpClient(options.apiUrl, ownerCookie, {
        'x-tenant-slug': tenant.slug,
      });

      const locationsByName = await ensureLocations(op, org);
      await ensureCatalog(op, org.slug, currencyForCountry(org.country));

      for (const staff of staffForOrg) {
        const memberId = memberIdByEmail.get(staff.email);
        if (!memberId) throw new Error(`Missing memberId for ${staff.email}`);
        for (const locationName of staff.locations) {
          const locationId = locationsByName.get(locationName);
          if (!locationId) {
            throw new Error(
              `Location "${locationName}" for organization "${org.slug}" was not provisioned.`,
            );
          }
          await op.post(`/v1/members/${memberId}/location-roles`, {
            locationId,
            roleSlug: staff.roleSlug,
          });
          log('seed-demo.staff.location_role_assigned', {
            email: staff.email,
            organization: org.slug,
            location: locationName,
            role: staff.roleSlug,
          });
        }
      }

      if (index === 0) {
        await seedDemoOrdersForOrg(op, options.apiUrl, tenant, org, locationsByName);
      }
    }
  } finally {
    await authDb.end({ timeout: 5 });
  }

  printDemoCredentialsBlock(ADMIN_URL, [
    {
      role: 'owner',
      email: 'owner@demo.local',
      password: DEMO_PASSWORD,
      scope: `all organizations (${ORGANIZATIONS.map((o) => `${o.slug} [${o.country}]`).join(', ')}), all locations`,
    },
    {
      role: 'manager (pizza)',
      email: 'manager@demo.local',
      password: DEMO_PASSWORD,
      scope: 'organization pizza — locations Kyiv Center + Kyiv Left Bank',
      note: 'scoped to 2 locations — expect the pick-location interstitial after login',
    },
    {
      role: 'cashier-foh (burger)',
      email: 'cashier@demo.local',
      password: DEMO_PASSWORD,
      scope: 'organization burger — location Central',
      note: 'scoped to 1 location — auto-pinned, no interstitial',
    },
  ]);
};
