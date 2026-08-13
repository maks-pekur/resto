import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { organizationRole as organizationRoleTable } from '@resto/db/schema';
import { AUTH_DRIZZLE_TOKEN } from '../identity.tokens';
import type { AuthDrizzle } from '../infrastructure/better-auth/auth-db';
import { PRESET_ROLES } from './preset-roles';

export interface SyncPresetRolesInput {
  readonly organizationId: string;
}

export interface SyncPresetRolesResult {
  readonly organizationId: string;
  readonly updated: number;
  readonly inserted: number;
  readonly skippedArchived: number;
}

interface ExistingRoleRow {
  readonly id: string;
  readonly role: string;
  readonly permission: string;
  readonly archivedAt: Date | null;
}

/**
 * D-06 / T-10-02-04 (Phase 10): `SeedPresetRolesService` only writes
 * `organization_role` at provisioning time — a snapshot, not a live read.
 * Editing `PRESET_ROLES` after tenants already exist reaches no existing
 * tenant. This service re-syncs the current `PRESET_ROLES` permission JSON
 * onto an already-provisioned tenant's `organization_role` rows, so a
 * permission change (like Phase 10's `order:cancel`) actually reaches
 * staff who signed up before the change shipped.
 *
 * Mirrors `SeedPresetRolesService`'s shape (direct Drizzle writes, no BA
 * role API — 08.3-P02) but UPDATEs existing rows instead of skipping them,
 * and repairs any preset slug missing entirely (tenants provisioned before
 * presets existed).
 */
@Injectable()
export class SyncPresetRolesService {
  private readonly logger = new Logger(SyncPresetRolesService.name);

  constructor(@Inject(AUTH_DRIZZLE_TOKEN) private readonly authDb: AuthDrizzle) {}

  async execute(input: SyncPresetRolesInput): Promise<SyncPresetRolesResult> {
    const existingRows: ExistingRoleRow[] = await this.authDb.db
      .select({
        id: organizationRoleTable.id,
        role: organizationRoleTable.role,
        permission: organizationRoleTable.permission,
        archivedAt: organizationRoleTable.archivedAt,
      })
      .from(organizationRoleTable)
      .where(eq(organizationRoleTable.organizationId, input.organizationId));

    const existingBySlug = new Map(existingRows.map((row) => [row.role, row]));

    let updated = 0;
    let inserted = 0;
    let skippedArchived = 0;

    for (const preset of PRESET_ROLES) {
      const existing = existingBySlug.get(preset.slug);
      const targetPermission = JSON.stringify(preset.permission);

      if (existing) {
        // T-10-02-05: never resurrect a role the owner deliberately
        // archived (08.3 D-12 soft-delete semantics).
        if (existing.archivedAt !== null) {
          skippedArchived += 1;
          continue;
        }
        if (existing.permission === targetPermission) {
          continue;
        }
        try {
          await this.authDb.db
            .update(organizationRoleTable)
            .set({ permission: targetPermission })
            .where(eq(organizationRoleTable.id, existing.id));
          updated += 1;
        } catch (err) {
          this.logger.warn(
            { err, slug: preset.slug, organizationId: input.organizationId },
            'Failed to update preset role — skipping',
          );
        }
        continue;
      }

      try {
        await this.authDb.db.insert(organizationRoleTable).values({
          id: randomUUID(),
          organizationId: input.organizationId,
          role: preset.slug,
          permission: targetPermission,
          createdAt: new Date(),
        });
        inserted += 1;
      } catch (err) {
        this.logger.warn(
          { err, slug: preset.slug, organizationId: input.organizationId },
          'Failed to insert missing preset role — skipping',
        );
      }
    }

    const result: SyncPresetRolesResult = {
      organizationId: input.organizationId,
      updated,
      inserted,
      skippedArchived,
    };
    this.logger.log(result, 'Preset roles synced.');
    return result;
  }
}
