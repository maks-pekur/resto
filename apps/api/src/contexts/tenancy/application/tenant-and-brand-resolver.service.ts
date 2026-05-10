import { Inject, Injectable } from '@nestjs/common';
import { BrandSlug, type BrandId, type TenantId } from '@resto/domain';
import { BRAND_REPOSITORY, type BrandRepository } from '../domain/ports';

export interface ResolvedCustomerContext {
  readonly tenantId: TenantId;
  readonly brandId: BrandId;
  readonly brandSlug: string;
}

export interface ResolvedBrand {
  readonly id: BrandId;
  readonly slug: string;
}

const RESERVED_HOSTS = new Set(['admin', 'api', 'www']);

@Injectable()
export class TenantAndBrandResolverService {
  constructor(@Inject(BRAND_REPOSITORY) private readonly brands: BrandRepository) {}

  async resolveByCustomerHost(host: string | undefined): Promise<ResolvedCustomerContext | null> {
    if (!host) return null;
    const hostname = host.split(':')[0]?.toLowerCase();
    if (!hostname) return null;

    const byDomain = await this.brands.findByDomainHost(hostname);
    if (byDomain && byDomain.status !== 'erased') {
      return {
        tenantId: byDomain.tenantId,
        brandId: byDomain.id,
        brandSlug: byDomain.slug,
      };
    }

    const labels = hostname.split('.');
    if (labels.length <= 2) return null;
    const candidate = labels[0];
    if (!candidate || RESERVED_HOSTS.has(candidate)) return null;

    const slug = BrandSlug.safeParse(candidate);
    if (!slug.success) return null;

    const bySlug = await this.brands.findBySlug(slug.data);
    if (!bySlug || bySlug.status === 'erased') return null;
    return {
      tenantId: bySlug.tenantId,
      brandId: bySlug.id,
      brandSlug: bySlug.slug,
    };
  }

  async resolveBrandBySlug(tenantId: TenantId, rawSlug: string): Promise<ResolvedBrand | null> {
    const parsed = BrandSlug.safeParse(rawSlug);
    if (!parsed.success) return null;
    const brand = await this.brands.findByTenantAndSlug(tenantId, parsed.data);
    if (!brand || brand.status === 'erased') return null;
    return { id: brand.id, slug: brand.slug };
  }
}
