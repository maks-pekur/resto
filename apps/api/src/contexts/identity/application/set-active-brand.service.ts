import { Inject, Injectable } from '@nestjs/common';
import type { TenantId } from '@resto/domain';
import { BrandOutOfScopeError } from '../domain/errors';
import {
  BRAND_PROVISIONING_PORT,
  type BrandProvisioningPort,
} from './ports/brand-provisioning.port';
import {
  MEMBER_BRAND_SCOPE_READER,
  type MemberBrandScopeReader,
} from './ports/member-brand-scope-reader.port';
import {
  SESSION_ACTIVE_BRAND_WRITER,
  type SessionActiveBrandWriter,
} from './ports/session-active-brand-writer.port';

export interface SetActiveBrandInput {
  readonly userId: string;
  readonly tenantId: TenantId;
  readonly baseRole: string | undefined;
  readonly brandId: string;
  readonly sessionToken: string;
}

export interface SetActiveBrandResult {
  readonly slug: string;
}

@Injectable()
export class SetActiveBrandService {
  constructor(
    @Inject(MEMBER_BRAND_SCOPE_READER) private readonly scopeReader: MemberBrandScopeReader,
    @Inject(BRAND_PROVISIONING_PORT) private readonly brands: BrandProvisioningPort,
    @Inject(SESSION_ACTIVE_BRAND_WRITER) private readonly writer: SessionActiveBrandWriter,
  ) {}

  async execute(input: SetActiveBrandInput): Promise<SetActiveBrandResult> {
    if (input.baseRole === 'owner') {
      const tenantBrands = await this.brands.listForTenant(input.tenantId);
      const match = tenantBrands.find((b) => b.id === input.brandId);
      if (!match) throw new BrandOutOfScopeError();
      await this.writer.writeActiveBrand({
        sessionToken: input.sessionToken,
        activeBrandId: input.brandId,
      });
      return { slug: match.slug };
    }

    const scope = await this.scopeReader.findBrandScopeForMember({
      userId: input.userId,
      tenantId: input.tenantId,
    });
    if (scope !== null && !scope.includes(input.brandId)) {
      throw new BrandOutOfScopeError();
    }
    if (scope !== null && scope.length === 0) {
      throw new BrandOutOfScopeError();
    }
    const tenantBrands = await this.brands.listForTenant(input.tenantId, scope ?? undefined);
    const match = tenantBrands.find((b) => b.id === input.brandId);
    if (!match) throw new BrandOutOfScopeError();
    await this.writer.writeActiveBrand({
      sessionToken: input.sessionToken,
      activeBrandId: input.brandId,
    });
    return { slug: match.slug };
  }
}
