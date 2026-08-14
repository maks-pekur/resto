import { randomUUID } from 'node:crypto';
import postgres, { type Sql } from 'postgres';
import { PRESET_ROLES } from '@resto/domain';
import { log } from '../lib/logger';
import { parseFlags, type RuntimeOptions } from '../lib/options';

interface OrgRow {
  readonly id: string;
}

interface ExistingRoleRow {
  readonly id: string;
  readonly role: string;
  readonly permission: string;
  readonly archivedAt: Date | null;
}

interface SyncCounts {
  readonly updated: number;
  readonly inserted: number;
  readonly skippedArchived: number;
}

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Required environment variable ${name} is not set.`);
  return value;
};

const syncOrganization = async (sql: Sql, organizationId: string): Promise<SyncCounts> => {
  const rows = await sql<ExistingRoleRow[]>`
    SELECT id, role, permission, archived_at AS "archivedAt"
    FROM organization_role
    WHERE organization_id = ${organizationId}
  `;
  const bySlug = new Map(rows.map((row) => [row.role, row]));

  let updated = 0;
  let inserted = 0;
  let skippedArchived = 0;

  for (const preset of PRESET_ROLES) {
    const existing = bySlug.get(preset.slug);
    const target = JSON.stringify(preset.permission);

    if (existing) {
      if (existing.archivedAt !== null) {
        skippedArchived += 1;
        continue;
      }
      if (existing.permission === target) continue;
      await sql`UPDATE organization_role SET permission = ${target} WHERE id = ${existing.id}`;
      updated += 1;
      continue;
    }

    await sql`
      INSERT INTO organization_role (id, organization_id, role, permission, created_at)
      VALUES (${randomUUID()}, ${organizationId}, ${preset.slug}, ${target}, now())
    `;
    inserted += 1;
  }

  return { updated, inserted, skippedArchived };
};

export const runSyncPresetRoles = async (
  argv: readonly string[],
  options: RuntimeOptions,
): Promise<void> => {
  const flags = parseFlags(argv);
  const all = flags.named.get('all') === 'true';
  const tenantFlag = flags.named.get('tenant');

  if (!all && tenantFlag === undefined) {
    throw new Error('sync-preset-roles requires --all or --tenant <uuid>');
  }

  const authDatabaseUrl = requireEnv('BETTER_AUTH_DATABASE_URL');

  if (options.dryRun) {
    log('sync-preset-roles.plan', { all, tenant: tenantFlag ?? null });
    return;
  }

  const sql = postgres(authDatabaseUrl, { max: 1, prepare: false });
  try {
    let organizationIds: readonly string[];
    if (all) {
      const rows = await sql<OrgRow[]>`
        SELECT id FROM tenants WHERE status NOT IN ('archived', 'erased')
      `;
      organizationIds = rows.map((row) => row.id);
    } else if (tenantFlag !== undefined) {
      organizationIds = [tenantFlag];
    } else {
      organizationIds = [];
    }

    if (organizationIds.length === 0) {
      log('sync-preset-roles.none', {});
      return;
    }

    let totalUpdated = 0;
    let totalInserted = 0;
    let totalSkippedArchived = 0;

    for (const organizationId of organizationIds) {
      const counts = await syncOrganization(sql, organizationId);
      log('sync-preset-roles.tenant', { organizationId, ...counts });
      totalUpdated += counts.updated;
      totalInserted += counts.inserted;
      totalSkippedArchived += counts.skippedArchived;
    }

    log('sync-preset-roles.done', {
      tenants: organizationIds.length,
      updated: totalUpdated,
      inserted: totalInserted,
      skippedArchived: totalSkippedArchived,
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
};
