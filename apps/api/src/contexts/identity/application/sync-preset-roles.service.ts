import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { tenantRole as tenantRoleTable } from '@resto/db/schema';
import { AUTH_DRIZZLE_TOKEN } from '../identity.tokens';
import type { AuthDrizzle } from '../infrastructure/better-auth/auth-db';
import { PRESET_ROLES } from './preset-roles';

export interface SyncPresetRolesInput {
  readonly tenantId: string;
}

export interface SyncPresetRolesResult {
  readonly tenantId: string;
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

@Injectable()
export class SyncPresetRolesService {
  private readonly logger = new Logger(SyncPresetRolesService.name);

  constructor(@Inject(AUTH_DRIZZLE_TOKEN) private readonly authDb: AuthDrizzle) {}

  async execute(input: SyncPresetRolesInput): Promise<SyncPresetRolesResult> {
    const existingRows: ExistingRoleRow[] = await this.authDb.db
      .select({
        id: tenantRoleTable.id,
        role: tenantRoleTable.role,
        permission: tenantRoleTable.permission,
        archivedAt: tenantRoleTable.archivedAt,
      })
      .from(tenantRoleTable)
      .where(eq(tenantRoleTable.tenantId, input.tenantId));

    const existingBySlug = new Map(existingRows.map((row) => [row.role, row]));

    let updated = 0;
    let inserted = 0;
    let skippedArchived = 0;

    for (const preset of PRESET_ROLES) {
      const existing = existingBySlug.get(preset.slug);
      const targetPermission = JSON.stringify(preset.permission);

      if (existing) {
        if (existing.archivedAt !== null) {
          skippedArchived += 1;
          continue;
        }
        if (existing.permission === targetPermission) {
          continue;
        }
        try {
          await this.authDb.db
            .update(tenantRoleTable)
            .set({ permission: targetPermission })
            .where(eq(tenantRoleTable.id, existing.id));
          updated += 1;
        } catch (err) {
          this.logger.warn(
            { err, slug: preset.slug, tenantId: input.tenantId },
            'Failed to update preset role — skipping',
          );
        }
        continue;
      }

      try {
        await this.authDb.db.insert(tenantRoleTable).values({
          id: randomUUID(),
          tenantId: input.tenantId,
          role: preset.slug,
          permission: targetPermission,
          createdAt: new Date(),
        });
        inserted += 1;
      } catch (err) {
        this.logger.warn(
          { err, slug: preset.slug, tenantId: input.tenantId },
          'Failed to insert missing preset role — skipping',
        );
      }
    }

    const result: SyncPresetRolesResult = {
      tenantId: input.tenantId,
      updated,
      inserted,
      skippedArchived,
    };
    this.logger.log(result, 'Preset roles synced.');
    return result;
  }
}
