import { Inject, Injectable } from '@nestjs/common';
import {
  BRAND_PROVISIONING_PORT,
  type BrandProvisioningPort,
} from './ports/brand-provisioning.port';

export interface SlugAvailabilityResult {
  readonly available: boolean;
  readonly suggestion: string | null;
}

const MAX_SUGGESTION_SUFFIX = 99;

/**
 * Live slug-availability check used by the admin brand-creation form
 * (RES-180). Returns `available: true` when the requested slug is
 * unused; otherwise computes the lowest free `slug-N` (N≥2, capped at
 * 99) by reading every active brand whose slug is `slug` or
 * `slug-<N>`. Cross-tenant by design — slug uniqueness is platform-wide.
 *
 * Suffix capped to keep suggestions readable and to bound the search
 * space; if every suffix up to 99 is taken the caller surfaces "no
 * suggestion — pick another name" rather than `slug-100+`.
 */
@Injectable()
export class CheckBrandSlugAvailabilityService {
  constructor(@Inject(BRAND_PROVISIONING_PORT) private readonly brands: BrandProvisioningPort) {}

  async execute(slug: string): Promise<SlugAvailabilityResult> {
    const slugs = await this.brands.findActiveSlugsByPrefix(slug);
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
}
