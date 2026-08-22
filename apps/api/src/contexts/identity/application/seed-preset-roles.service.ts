import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { tenantRole as tenantRoleTable } from '@resto/db/schema';
import { AUTH_DRIZZLE_TOKEN } from '../identity.tokens';
import type { AuthDrizzle } from '../infrastructure/better-auth/auth-db';
import { PRESET_ROLES } from './preset-roles';

export interface SeedPresetRolesInput {
  readonly tenantId: string;
}

@Injectable()
export class SeedPresetRolesService {
  private readonly logger = new Logger(SeedPresetRolesService.name);

  constructor(@Inject(AUTH_DRIZZLE_TOKEN) private readonly authDb: AuthDrizzle) {}

  async execute(input: SeedPresetRolesInput): Promise<void> {
    const existing = await this.authDb.db
      .select({ role: tenantRoleTable.role })
      .from(tenantRoleTable)
      .where(eq(tenantRoleTable.tenantId, input.tenantId));

    const existingSlugs = new Set(existing.map((r) => r.role));

    for (const preset of PRESET_ROLES) {
      if (existingSlugs.has(preset.slug)) continue;
      try {
        await this.authDb.db.insert(tenantRoleTable).values({
          id: randomUUID(),
          tenantId: input.tenantId,
          role: preset.slug,
          permission: JSON.stringify(preset.permission),
          createdAt: new Date(),
        });
      } catch (err) {
        this.logger.warn(
          { err, slug: preset.slug, tenantId: input.tenantId },
          'Failed to seed preset role — skipping',
        );
      }
    }
  }
}
