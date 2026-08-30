import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { citext } from './_types';
import { pkUuid, tenantIdColumn, timestampsColumns } from './_columns';

/**
 * The tenant itself — a single restaurant business on the platform.
 *
 * `tenants` is *not* tenant-scoped data per se: each row IS a tenant. RLS
 * policy on this table restricts a tenant context to seeing only its own
 * row; system context sees all.
 *
 * D-01/D-04 (phase 10.2): `brands` has been merged into this table — a
 * restaurant is one organization, not a tenant with a separate brand
 * dimension underneath it. Every column below tagged "from brands" was
 * moved here verbatim; the five columns that existed on both tables
 * (`slug`, `displayName`, `status`, `locale`, `defaultCurrency`) kept the
 * stricter `tenants` definition (NOT NULL + defaults) since every writer
 * already supplied them.
 */
export const tenants = pgTable(
  'tenants',
  {
    id: pkUuid(),
    slug: citext('slug').notNull(),
    displayName: text('display_name').notNull(),
    status: text('status').notNull().default('active'),
    locale: text('locale').notNull().default('en'),
    contentLocales: text('content_locales').array().notNull().default(['en']),
    // Inherited as the default by every new location; a location may override it, because a chain
    // can cross zones (Spain has two) while most tenants never leave one.
    timezone: text('timezone').notNull().default('UTC'),
    defaultCurrency: text('default_currency').notNull().default('USD'),
    /**
     * D-34: collected at signup, applied to the tenant at
     * onboarding. NOT NULL — D-12 gives a database reset, so there are no
     * legacy rows to backfill, and a nullable column would let a
     * provisioning path silently create a market-less tenant whose
     * currency/locale cannot be derived.
     */
    country: text('country').notNull(),
    // --- from brands (D-04) ---
    theme: jsonb('theme').$type<Record<string, unknown> | null>(),
    legalName: text('legal_name'),
    legalForm: text('legal_form'),
    taxId: text('tax_id'),
    stripeAccountId: text('stripe_account_id'),
    paymentProvider: text('payment_provider').notNull().default('stripe'),
    accountType: text('account_type'),
    stripeChargesEnabled: boolean('stripe_charges_enabled').notNull().default(false),
    stripePayoutsEnabled: boolean('stripe_payouts_enabled').notNull().default(false),
    stripeOnboardingStatus: text('stripe_onboarding_status').notNull().default('not_started'),
    stripeRequirementsDue: jsonb('stripe_requirements_due').$type<string[] | null>(),
    fiscalizationConfig: jsonb('fiscalization_config').$type<Record<string, unknown>>(),
    // --- unchanged ---
    offboardingScheduledAt: timestamp('offboarding_scheduled_at', {
      withTimezone: true,
      mode: 'date',
    }),
    offboardingExecutedAt: timestamp('offboarding_executed_at', {
      withTimezone: true,
      mode: 'date',
    }),
    offboardingRequestedBy: text('offboarding_requested_by'),
    /**
     * D-4a-06: timestamp of the tenant's first menu publish. Used by the
     * `catalog.menu_first_published.v1` vs `catalog.menu_republished.v1`
     * event split (plan 06 wires the detection).
     */
    menuFirstPublishedAt: timestamp('menu_first_published_at', {
      withTimezone: true,
      mode: 'date',
    }),
    ...timestampsColumns(),
  },
  (table) => [
    uniqueIndex('tenants_slug_uq').on(table.slug),
    check(
      'tenants_status_chk',
      sql`${table.status} IN ('pending_setup', 'active', 'suspended', 'archived', 'pending_offboarding', 'erased')`,
    ),
    check('tenants_slug_format_chk', sql`${table.slug} ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'`),
    check('tenants_currency_format_chk', sql`${table.defaultCurrency} ~ '^[A-Z]{3}$'`),
    check('tenants_locale_format_chk', sql`${table.locale} ~ '^[a-z]{2}(-[A-Z]{2})?$'`),
    check('tenants_country_chk', sql`${table.country} IN ('UA', 'GB', 'ES')`),
    check(
      'tenants_content_locales_chk',
      sql`array_length(${table.contentLocales}, 1) >= 1
        AND ${table.locale} = ANY (${table.contentLocales})
        AND ${table.contentLocales} <@ ARRAY['ru', 'en', 'uk', 'es']::text[]`,
    ),
    // --- from brands (D-04) ---
    check(
      'tenants_legal_form_chk',
      sql`${table.legalForm} IS NULL OR ${table.legalForm} IN ('IP','OOO','LLC','SOLE_PROP','OTHER')`,
    ),
    check('tenants_payment_provider_chk', sql`${table.paymentProvider} IN ('stripe')`),
    check(
      'tenants_account_type_chk',
      sql`${table.accountType} IS NULL OR ${table.accountType} IN ('express', 'standard')`,
    ),
    check(
      'tenants_stripe_onboarding_status_chk',
      sql`${table.stripeOnboardingStatus} IN ('not_started', 'pending', 'complete', 'restricted')`,
    ),
    // NOTE (D-04): the brands table's former per-tenant case-insensitive
    // unique-display-name index is deliberately NOT ported. Post-merge
    // there is no parent entity for a tenant to be scoped
    // within — the only faithful translation would be a GLOBAL unique
    // display name, which would forbid two unrelated restaurants both
    // being called "Pizzeria". `tenants_slug_uq` remains the global
    // uniqueness guarantee.
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
