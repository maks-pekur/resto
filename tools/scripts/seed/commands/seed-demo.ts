import { ApiClient } from '../lib/api-client';
import { createAuthDb, findMemberId, findUserIdByEmail, insertStaffMember } from '../lib/auth-db';
import { printDemoCredentialsBlock } from '../lib/credentials-block';
import { log } from '../lib/logger';
import type { RuntimeOptions } from '../lib/options';
import { OperatorHttpClient, OperatorHttpError, signInAsOperator } from '../lib/operator-http';
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

interface BrandDef {
  readonly slug: string;
  readonly displayName: string;
  readonly locations: readonly string[];
}

const BRANDS: readonly BrandDef[] = [
  { slug: 'pizza', displayName: 'Pizza Palace', locations: ['Downtown', 'Uptown'] },
  { slug: 'burger', displayName: 'Burger Barn', locations: ['Central', 'Mall'] },
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
};

interface StaffDef {
  readonly email: string;
  readonly name: string;
  readonly roleSlug: string;
  readonly assignments: readonly { readonly brand: string; readonly location: string }[];
}

const STAFF: readonly StaffDef[] = [
  {
    email: 'manager@demo.local',
    name: 'Demo Manager',
    roleSlug: 'manager',
    assignments: [
      { brand: 'pizza', location: 'Downtown' },
      { brand: 'pizza', location: 'Uptown' },
    ],
  },
  {
    email: 'cashier@demo.local',
    name: 'Demo Cashier',
    roleSlug: 'cashier-foh',
    assignments: [{ brand: 'burger', location: 'Central' }],
  },
];

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Required environment variable ${name} is not set.`);
  return value;
};

const isConflict = (err: unknown): boolean =>
  err instanceof OperatorHttpError && err.status === 409;

const ensureBrand = async (op: OperatorHttpClient, brand: BrandDef): Promise<void> => {
  try {
    await op.post('/v1/me/brands', { slug: brand.slug, displayName: brand.displayName });
    log('seed-demo.brand.created', { slug: brand.slug });
  } catch (err) {
    if (!isConflict(err)) throw err;
    log('seed-demo.brand.exists', { slug: brand.slug });
  }
};

const ensureLocations = async (
  op: OperatorHttpClient,
  brand: BrandDef,
): Promise<Map<string, string>> => {
  const opBrand = op.withHeaders({ 'x-brand-slug': brand.slug });
  const existing = await opBrand.get<LocationResponse[]>('/v1/tenancy/locations');
  const byName = new Map(existing.map((l) => [l.name, l.id]));

  for (const name of brand.locations) {
    if (byName.has(name)) {
      log('seed-demo.location.exists', { brand: brand.slug, name });
      continue;
    }
    const created = await opBrand.post<LocationResponse>('/v1/tenancy/locations', {
      name,
      address: null,
      timezone: null,
      contacts: null,
    });
    byName.set(name, created.id);
    log('seed-demo.location.created', { brand: brand.slug, name, id: created.id });
  }
  return byName;
};

const ensureCatalog = async (op: OperatorHttpClient, brandSlug: string): Promise<void> => {
  const opBrand = op.withHeaders({ 'x-brand-slug': brandSlug });
  const existingCategories = await opBrand.get<CategoryListResponse>('/v1/catalog/categories');
  const categoryBySlug = new Map(existingCategories.items.map((c) => [c.slug, c.id]));

  for (const category of CATALOG[brandSlug] ?? []) {
    let categoryId = categoryBySlug.get(category.slug);
    if (categoryId) {
      log('seed-demo.category.exists', { brand: brandSlug, slug: category.slug });
    } else {
      const created = await opBrand.post<{ id: string }>('/v1/catalog/categories', {
        slug: category.slug,
        name: { en: category.name },
        parentId: null,
        description: null,
        sortOrder: 0,
        code: null,
      });
      categoryId = created.id;
      log('seed-demo.category.created', { brand: brandSlug, slug: category.slug, id: categoryId });
    }

    const existingItems = await opBrand.get<ItemListResponse>(
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
        currency: 'USD',
        status: 'published' as const,
      };
      await opBrand.post('/v1/catalog/items', payload);
      log(existingId ? 'seed-demo.item.updated' : 'seed-demo.item.created', {
        brand: brandSlug,
        slug: item.slug,
      });
    }
  }

  await opBrand.post('/v1/catalog/publish', {}).catch((err: unknown) => {
    log('seed-demo.publish.skipped', { brand: brandSlug, err: String(err) });
  });
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
      tenant: 'demo',
      owner: 'owner@demo.local',
      brands: BRANDS.map((b) => b.slug),
      staff: STAFF.map((s) => s.email),
    });
    return;
  }

  const api = new ApiClient({ apiUrl: options.apiUrl, internalToken: options.internalToken });

  const tenant = await api.post<TenantResponse>('/internal/v1/tenants', {
    slug: 'demo',
    displayName: 'Demo Restaurant Group',
    defaultCurrency: 'USD',
    locale: 'en',
  });
  log('seed-demo.tenant.ready', { id: tenant.id, slug: tenant.slug });

  await api.post<BootstrapOwnerResponse>(`/internal/v1/tenants/${tenant.id}/owner`, {
    email: 'owner@demo.local',
    password: DEMO_PASSWORD,
    name: 'Demo Owner',
  });
  log('seed-demo.owner.ready', { email: 'owner@demo.local' });

  // T-note: `/api/auth/sign-up/email` shares its per-IP rate-limit bucket
  // with every other route (RATE_LIMIT_AUTH_SIGNUP_PER_MIN, default 5/min) —
  // running both staff sign-ups as early as possible, before the owner
  // session dance and the brand/location/catalog calls, keeps the shared
  // counter low enough that neither sign-up gets 429'd by unrelated traffic
  // accumulated earlier in the same run.
  const authDb = createAuthDb(authDatabaseUrl);
  const staffUserIds = new Map<string, string>();
  try {
    for (const staff of STAFF) {
      let userId = await findUserIdByEmail(authDb, staff.email);
      if (userId) {
        log('seed-demo.staff.user_exists', { email: staff.email });
      } else {
        const signUpRes = await fetch(
          new URL('/api/auth/sign-up/email', options.apiUrl).toString(),
          {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin: ADMIN_URL },
            body: JSON.stringify({ email: staff.email, password: DEMO_PASSWORD, name: staff.name }),
          },
        );
        if (!signUpRes.ok) {
          throw new Error(
            `sign-up/email for ${staff.email} failed: ${signUpRes.status.toString()} ${await signUpRes.text()}`,
          );
        }
        const body = (await signUpRes.json()) as { user: { id: string } };
        userId = body.user.id;
        log('seed-demo.staff.user_created', { email: staff.email, userId });
      }
      staffUserIds.set(staff.email, userId);
    }

    const ownerCookie = await signInAsOperator(
      options.apiUrl,
      'owner@demo.local',
      DEMO_PASSWORD,
      tenant.id,
    );
    const op = new OperatorHttpClient(options.apiUrl, ownerCookie, {
      'x-tenant-slug': tenant.slug,
    });

    for (const brand of BRANDS) {
      await ensureBrand(op, brand);
    }

    const locationsByBrand = new Map<string, Map<string, string>>();
    for (const brand of BRANDS) {
      locationsByBrand.set(brand.slug, await ensureLocations(op, brand));
      await ensureCatalog(op, brand.slug);
    }

    for (const staff of STAFF) {
      const userId = staffUserIds.get(staff.email);
      if (!userId) throw new Error(`Missing userId for ${staff.email} after sign-up phase.`);

      let memberId = await findMemberId(authDb, tenant.id, userId);
      if (memberId) {
        log('seed-demo.staff.member_exists', { email: staff.email, memberId });
      } else {
        memberId = await insertStaffMember(authDb, tenant.id, userId);
        log('seed-demo.staff.member_created', { email: staff.email, memberId });
      }

      for (const assignment of staff.assignments) {
        const locationId = locationsByBrand.get(assignment.brand)?.get(assignment.location);
        if (!locationId) {
          throw new Error(
            `Location "${assignment.location}" for brand "${assignment.brand}" was not provisioned.`,
          );
        }
        await op.post(`/v1/members/${memberId}/location-roles`, {
          locationId,
          roleSlug: staff.roleSlug,
        });
        log('seed-demo.staff.location_role_assigned', {
          email: staff.email,
          brand: assignment.brand,
          location: assignment.location,
          role: staff.roleSlug,
        });
      }
    }

    const ordersBrand = BRANDS[0];
    const ordersLocationName = ordersBrand?.locations[0];
    const ordersLocationId =
      ordersBrand && ordersLocationName
        ? locationsByBrand.get(ordersBrand.slug)?.get(ordersLocationName)
        : undefined;

    if (!ordersBrand || !ordersLocationId) {
      log('seed-demo.orders.skipped', { reason: 'no brand/location resolved' });
    } else {
      const opBrand = new OperatorHttpClient(options.apiUrl, ownerCookie, {
        'x-tenant-slug': tenant.slug,
        'x-brand-slug': ordersBrand.slug,
      });
      const items = await opBrand.get<{ items: { id: string; slug: string }[] }>(
        '/v1/catalog/items?status=published',
      );
      const firstItem = items.items[0];
      if (!firstItem) {
        log('seed-demo.orders.skipped', { reason: 'no published catalog item' });
      } else {
        const appDb = createAppDb(requireEnv('DATABASE_URL'));
        try {
          for (const spec of DEMO_ORDER_SPECS) {
            const seeded = await seedDemoOrder(appDb, {
              apiUrl: options.apiUrl,
              tenantId: tenant.id,
              brandSlug: ordersBrand.slug,
              locationId: ordersLocationId,
              itemId: firstItem.id,
              itemName: firstItem.slug,
              spec,
            });
            log('seed-demo.order.seeded', {
              brand: ordersBrand.slug,
              location: ordersLocationName,
              shortNumber: seeded.shortNumber,
              status: seeded.status,
            });
          }
        } finally {
          await appDb.end({ timeout: 5 });
        }
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
      scope: 'all brands (pizza, burger), all locations',
    },
    {
      role: 'manager (pizza)',
      email: 'manager@demo.local',
      password: DEMO_PASSWORD,
      scope: 'brand pizza — locations Downtown + Uptown',
      note: 'scoped to 2 locations — expect the pick-location interstitial after login',
    },
    {
      role: 'cashier-foh (burger)',
      email: 'cashier@demo.local',
      password: DEMO_PASSWORD,
      scope: 'brand burger — location Central',
      note: 'scoped to 1 location — auto-pinned, no interstitial',
    },
  ]);
};
