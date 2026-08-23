import { Inject, Injectable } from '@nestjs/common';
import { and, eq, like, ne, or } from 'drizzle-orm';
import { tenants as tenantsTable } from '@resto/db/schema';
import { AUTH_DRIZZLE_TOKEN } from '../../identity.tokens';
import type { AuthDrizzle } from '../../infrastructure/better-auth/auth-db';

export interface SlugAvailabilityResult {
  readonly available: boolean;
  readonly suggestion: string | null;
}

const MAX_SUGGESTION_SUFFIX = 99;
export const SLUG_LOOKUP_LIMIT = MAX_SUGGESTION_SUFFIX + 1;

/**
 * Live slug-availability check backing the onboarding form's silent
 * collision resolution (D-30, UI-SPEC S4 — the UI never renders a "taken"
 * error). Returns `available: true` when the requested slug is unused;
 * otherwise computes the lowest free `slug-N` (N>=2, capped at 99) by
 * reading every non-erased tenant whose slug is exactly `slug` or
 * `slug-<N>`. Cross-tenant by design — slug uniqueness is platform-wide
 * (RES-180, carried over from the pre-merge brand-slug check).
 *
 * Suffix capped to keep suggestions readable and to bound the search
 * space; if every suffix up to 99 is taken the caller surfaces "no
 * suggestion — pick another name" rather than `slug-100+`.
 */
@Injectable()
export class CheckTenantSlugAvailabilityService {
  constructor(@Inject(AUTH_DRIZZLE_TOKEN) private readonly authDb: AuthDrizzle) {}

  async execute(slug: string): Promise<SlugAvailabilityResult> {
    const slugs = await this.findActiveSlugsByPrefix(slug, SLUG_LOOKUP_LIMIT);
    const taken = new Set<string>(slugs);
    if (!taken.has(slug)) {
      return { available: true, suggestion: null };
    }
    for (let n = 2; n <= MAX_SUGGESTION_SUFFIX; n += 1) {
      const candidate = `${slug}-${n.toString()}`;
      if (!taken.has(candidate)) {
        return { available: false, suggestion: candidate };
      }
    }
    return { available: false, suggestion: null };
  }

  private async findActiveSlugsByPrefix(prefix: string, limit: number): Promise<readonly string[]> {
    const escaped = prefix.replace(/[\\%_]/g, (m) => `\\${m}`);
    const rows = await this.authDb.db
      .select({ slug: tenantsTable.slug })
      .from(tenantsTable)
      .where(
        and(
          ne(tenantsTable.status, 'erased'),
          or(eq(tenantsTable.slug, prefix), like(tenantsTable.slug, `${escaped}-%`)),
        ),
      )
      .limit(limit);
    return rows.map((r) => r.slug);
  }
}
