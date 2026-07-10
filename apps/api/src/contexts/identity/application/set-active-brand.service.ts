import { Inject, Injectable } from '@nestjs/common';
import type { TenantId } from '@resto/domain';
import { BrandOutOfScopeError } from '../domain/errors';
import { InitialLocationDrizzleRepository } from '../infrastructure/initial-location-drizzle.repository';
import {
  BRAND_PROVISIONING_PORT,
  type BrandProvisioningPort,
} from './ports/brand-provisioning.port';
import {
  MEMBER_LOCATION_SCOPE_READER,
  type MemberLocationScopeReader,
} from './ports/member-location-scope-reader.port';
import {
  SESSION_ACTIVE_BRAND_WRITER,
  type SessionActiveBrandWriter,
} from './ports/session-active-brand-writer.port';
import {
  SESSION_ACTIVE_LOCATION_WRITER,
  type SessionActiveLocationWriter,
} from './ports/session-active-location-writer.port';

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
    @Inject(MEMBER_LOCATION_SCOPE_READER)
    private readonly locationScopeReader: MemberLocationScopeReader,
    @Inject(BRAND_PROVISIONING_PORT) private readonly brands: BrandProvisioningPort,
    @Inject(SESSION_ACTIVE_BRAND_WRITER) private readonly writer: SessionActiveBrandWriter,
    @Inject(SESSION_ACTIVE_LOCATION_WRITER)
    private readonly locationWriter: SessionActiveLocationWriter,
    @Inject(InitialLocationDrizzleRepository)
    private readonly initialLocation: InitialLocationDrizzleRepository,
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
      await this.resetActiveLocation(input.userId, input.brandId, input.sessionToken);
      return { slug: match.slug };
    }

    const reachableBrands = await this.locationScopeReader.findReachableBrandsForMember({
      userId: input.userId,
      tenantId: input.tenantId,
    });
    if (!reachableBrands?.includes(input.brandId)) {
      throw new BrandOutOfScopeError();
    }
    const tenantBrands = await this.brands.listForTenant(input.tenantId, reachableBrands);
    const match = tenantBrands.find((b) => b.id === input.brandId);
    if (!match) throw new BrandOutOfScopeError();
    await this.writer.writeActiveBrand({
      sessionToken: input.sessionToken,
      activeBrandId: input.brandId,
    });
    await this.resetActiveLocation(input.userId, input.brandId, input.sessionToken);
    return { slug: match.slug };
  }

  private async resetActiveLocation(
    userId: string,
    brandId: string,
    sessionToken: string,
  ): Promise<void> {
    const resolved = await this.initialLocation.resolveForUserInBrand(userId, brandId);
    await this.locationWriter.writeActiveLocation({
      sessionToken,
      activeLocationId: resolved,
    });
  }
}
