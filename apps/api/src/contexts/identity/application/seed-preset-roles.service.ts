import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { organizationRole as organizationRoleTable } from '@resto/db/schema';
import { AUTH_DRIZZLE_TOKEN } from '../identity.tokens';
import type { AuthDrizzle } from '../infrastructure/better-auth/auth-db';
import { PRESET_ROLES } from './preset-roles';

export interface SeedPresetRolesInput {
  readonly organizationId: string;
}

@Injectable()
export class SeedPresetRolesService {
  private readonly logger = new Logger(SeedPresetRolesService.name);

  constructor(@Inject(AUTH_DRIZZLE_TOKEN) private readonly authDb: AuthDrizzle) {}

  async execute(input: SeedPresetRolesInput): Promise<void> {
    const existing = await this.authDb.db
      .select({ role: organizationRoleTable.role })
      .from(organizationRoleTable)
      .where(eq(organizationRoleTable.organizationId, input.organizationId));

    const existingSlugs = new Set(existing.map((r) => r.role));

    for (const preset of PRESET_ROLES) {
      if (existingSlugs.has(preset.slug)) continue;
      try {
        await this.authDb.db.insert(organizationRoleTable).values({
          id: randomUUID(),
          organizationId: input.organizationId,
          role: preset.slug,
          permission: JSON.stringify(preset.permission),
          createdAt: new Date(),
        });
      } catch (err) {
        this.logger.warn(
          { err, slug: preset.slug, organizationId: input.organizationId },
          'Failed to seed preset role — skipping',
        );
      }
    }
  }
}
