import { sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { citext } from './_types';
import { pkUuid, tenantIdColumn, timestampsColumns } from './_columns';

/**
 * The tenant itself — a single restaurant business on the platform.
 *
 * `tenants` is *not* tenant-scoped data per se: each row IS a tenant. RLS
 * policy on this table restricts a tenant context to seeing only its own
 * row; system context sees all.
 */
export const tenants = pgTable(
  'tenants',
  {
    id: pkUuid(),
    slug: citext('slug').notNull(),
    displayName: text('display_name').notNull(),
    status: text('status').notNull().default('active'),
    locale: text('locale').notNull().default('en'),
    defaultCurrency: text('default_currency').notNull().default('USD'),
    /** Stripe Connect (Express) account id — populated when payments are wired in MVP-2. */
    stripeAccountId: text('stripe_account_id'),
    ...timestampsColumns(),
  },
  (table) => [
    uniqueIndex('tenants_slug_uq').on(table.slug),
    check('tenants_status_chk', sql`${table.status} IN ('active', 'suspended', 'archived')`),
    check('tenants_slug_format_chk', sql`${table.slug} ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'`),
    check('tenants_currency_format_chk', sql`${table.defaultCurrency} ~ '^[A-Z]{3}$'`),
    check('tenants_locale_format_chk', sql`${table.locale} ~ '^[a-z]{2}(-[A-Z]{2})?$'`),
  ],
);

/**
 * Domain mappings for a tenant: the auto-assigned subdomain plus any
 * verified custom domains. Subdomain is created on provisioning; custom
 * domain rows are added later (verification flow lands in MVP-2).
 */
export const tenantDomains = pgTable(
  'tenant_domains',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    domain: citext('domain').notNull(),
    kind: text('kind').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'date' }),
    ...timestampsColumns(),
  },
  (table) => [
    uniqueIndex('tenant_domains_domain_uq').on(table.domain),
    index('tenant_domains_tenant_idx').on(table.tenantId, table.kind),
    uniqueIndex('tenant_domains_one_primary_per_tenant_uq')
      .on(table.tenantId)
      .where(sql`${table.isPrimary} = true`),
    check('tenant_domains_kind_chk', sql`${table.kind} IN ('subdomain', 'custom')`),
  ],
);
