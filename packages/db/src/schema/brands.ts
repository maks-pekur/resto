import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { citext } from './_types';
import {
  compositeTenantFk,
  pkUuid,
  tenantIdColumn,
  tenantParentUniqueIndex,
  timestampsColumns,
} from './_columns';
import { tenants } from './tenants';
import { member } from './auth';

export const brands = pgTable(
  'brands',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    slug: citext('slug').notNull(),
    displayName: text('display_name').notNull(),
    status: text('status').notNull().default('active'),
    locale: text('locale'),
    defaultCurrency: text('default_currency'),
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
    ...timestampsColumns(),
  },
  (table) => [
    foreignKey({
      name: 'brands_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    uniqueIndex('brands_tenant_slug_uq').on(table.tenantId, table.slug),
    uniqueIndex('brands_slug_active_uq')
      .on(table.slug)
      .where(sql`${table.status} != 'erased'`),
    // RES-182: per-tenant case-insensitive unique on display_name —
    // active rows only (an erased brand frees the name).
    uniqueIndex('brands_tenant_display_name_active_uq')
      .on(table.tenantId, sql`lower(${table.displayName})`)
      .where(sql`${table.status} != 'erased'`),
    index('brands_tenant_status_idx').on(table.tenantId, table.status),
    check('brands_status_chk', sql`${table.status} IN ('active','suspended','archived','erased')`),
    check(
      'brands_legal_form_chk',
      sql`${table.legalForm} IS NULL OR ${table.legalForm} IN ('IP','OOO','LLC','SOLE_PROP','OTHER')`,
    ),
    check('brands_slug_format_chk', sql`${table.slug} ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'`),
    check(
      'brands_currency_format_chk',
      sql`${table.defaultCurrency} IS NULL OR ${table.defaultCurrency} ~ '^[A-Z]{3}$'`,
    ),
    check(
      'brands_locale_format_chk',
      sql`${table.locale} IS NULL OR ${table.locale} ~ '^[a-z]{2}(-[A-Z]{2})?$'`,
    ),
    check('brands_payment_provider_chk', sql`${table.paymentProvider} IN ('stripe')`),
    check(
      'brands_account_type_chk',
      sql`${table.accountType} IS NULL OR ${table.accountType} IN ('express', 'standard')`,
    ),
    check(
      'brands_stripe_onboarding_status_chk',
      sql`${table.stripeOnboardingStatus} IN ('not_started', 'pending', 'complete', 'restricted')`,
    ),
    tenantParentUniqueIndex('brands', { id: table.id, tenantId: table.tenantId }),
  ],
);

export const brandDomains = pgTable(
  'brand_domains',
  {
    id: pkUuid(),
    brandId: uuid('brand_id').notNull(),
    tenantId: tenantIdColumn(),
    domain: citext('domain').notNull(),
    kind: text('kind').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'date' }),
    ...timestampsColumns(),
  },
  (table) => [
    compositeTenantFk({
      name: 'brand_domains_brand_fk',
      child: { id: table.brandId, tenantId: table.tenantId },
      parent: { id: brands.id, tenantId: brands.tenantId },
    }).onDelete('cascade'),
    foreignKey({
      name: 'brand_domains_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    uniqueIndex('brand_domains_domain_uq').on(table.domain),
    index('brand_domains_brand_kind_idx').on(table.brandId, table.kind),
    uniqueIndex('brand_domains_one_primary_per_brand_uq')
      .on(table.brandId)
      .where(sql`${table.isPrimary} = true`),
    check('brand_domains_kind_chk', sql`${table.kind} IN ('subdomain', 'custom')`),
  ],
);

export const memberBrandScope = pgTable(
  'member_brand_scope',
  {
    memberId: text('member_id').notNull(),
    brandId: uuid('brand_id').notNull(),
    tenantId: tenantIdColumn(),
    role: text('role'),
    ...timestampsColumns(),
  },
  (table) => [
    primaryKey({
      name: 'member_brand_scope_pk',
      columns: [table.memberId, table.brandId],
    }),
    foreignKey({
      name: 'member_brand_scope_member_fk',
      columns: [table.memberId],
      foreignColumns: [member.id],
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'member_brand_scope_brand_fk',
      child: { id: table.brandId, tenantId: table.tenantId },
      parent: { id: brands.id, tenantId: brands.tenantId },
    }).onDelete('cascade'),
    foreignKey({
      name: 'member_brand_scope_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    index('member_brand_scope_brand_idx').on(table.brandId),
    index('member_brand_scope_tenant_idx').on(table.tenantId),
  ],
);
