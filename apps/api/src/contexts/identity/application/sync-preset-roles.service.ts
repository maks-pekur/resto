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
