import { sql } from 'drizzle-orm';
import { check, foreignKey, index, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { citext } from './_types';
import { pkUuid, tenantIdColumn, timestampsColumns } from './_columns';
import { tenants } from './tenants';

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
    theme: jsonb('theme').$type<Record<string, unknown>>(),
    legalName: text('legal_name'),
    legalForm: text('legal_form'),
    taxId: text('tax_id'),
    stripeAccountId: text('stripe_account_id'),
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
  ],
);
