import { ApiClient } from '../lib/api-client';
import { KeycloakAdmin } from '../lib/keycloak-admin';
import { loadMenuYaml, type MenuYaml } from '../lib/menu-yaml';
import { log } from '../lib/logger';
import { parseFlags, requireFlag, type RuntimeOptions } from '../lib/options';

interface UpsertResult {
  readonly id: string;
}

export const runSeedMenu = async (
  argv: readonly string[],
  options: RuntimeOptions,
): Promise<void> => {
  const flags = parseFlags(argv);
  const tenantSlug = requireFlag(flags, 'tenant');
  const file = requireFlag(flags, 'file');
  const ownerEmail = flags.named.get('owner-email');
  const ownerPassword = flags.named.get('owner-password');
  const clientId = flags.named.get('client-id') ?? 'resto-api';
  const clientSecret = flags.named.get('client-secret') ?? '';

  const menu: MenuYaml = loadMenuYaml(file);
  log('seed-menu.parsed', {
    file,
    tenantSlug,
    categories: menu.categories.length,
    items: menu.items.length,
    modifiers: menu.modifiers.length,
  });

  if (options.dryRun) {
    log('seed-menu.plan', { tenantSlug, items: menu.items.map((i) => i.slug) });
    return;
  }

  if (!ownerEmail || !ownerPassword) {
    throw new Error(
      'seed-menu requires --owner-email and --owner-password to obtain a bearer token. ' +
        'Use the credentials issued by `provision-tenant`.',
    );
  }

  const keycloak = new KeycloakAdmin({
    adminUrl: options.keycloakAdminUrl,
    adminUsername: options.keycloakAdminUsername,
    adminPassword: options.keycloakAdminPassword,
    realm: options.keycloakRealm,
  });
  const { accessToken } = await keycloak.issueOwnerToken({
    clientId,
    clientSecret,
    email: ownerEmail,
    password: ownerPassword,
  });

  const api = new ApiClient({
    apiUrl: options.apiUrl,
    internalToken: options.internalToken,
    tenantSlug,
    bearerToken: accessToken,
  });

  const categoryIdBySlug = new Map<string, string>();
  for (const category of menu.categories) {
    const result = await api.post<UpsertResult>('/internal/v1/catalog/categories', {
      slug: category.slug,
      name: category.name,
      description: category.description ?? null,
      sortOrder: category.sortOrder,
    });
    categoryIdBySlug.set(category.slug, result.id);
    log('seed-menu.category', { slug: category.slug, id: result.id });
  }

  for (const item of menu.items) {
    const categoryId = categoryIdBySlug.get(item.category);
    if (!categoryId) {
      throw new Error(`Item ${item.slug} references unknown category ${item.category}`);
    }
    const result = await api.post<UpsertResult>('/internal/v1/catalog/items', {
      categoryId,
      slug: item.slug,
      name: item.name,
      description: item.description ?? null,
      basePrice: item.basePrice,
      currency: menu.currency,
      imageS3Key: item.imageS3Key ?? null,
      allergens: item.allergens ?? null,
      status: item.status,
      sortOrder: item.sortOrder,
    });
    log('seed-menu.item', { slug: item.slug, id: result.id });
  }

  for (const modifier of menu.modifiers) {
    const result = await api.post<UpsertResult>('/internal/v1/catalog/modifiers', {
      name: modifier.name,
      minSelectable: modifier.minSelectable,
      maxSelectable: modifier.maxSelectable,
      isRequired: modifier.isRequired,
    });
    log('seed-menu.modifier', { slug: modifier.slug, id: result.id });
  }

  await api.post<{ tenantId: string; version: number }>('/internal/v1/catalog/publish', {});
  log('seed-menu.done', { tenantSlug });
};
