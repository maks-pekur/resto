import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { requireTenantContext } from '@resto/db';
import { TenantId } from '@resto/domain';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { BrandNeutral, Permissions, RequiresTenantContext } from '../../../../shared/auth';
import { wrapWith } from '../../../../shared/api/wrap';
import { AssignLocationRoleService } from '../../application/assign-location-role.service';
import { mapIdentityError } from './error-mapping';

const wrap = wrapWith(mapIdentityError);

const AssignLocationRoleInputSchema = z.object({
  locationId: z.string().uuid(),
  roleSlug: z.string().min(1).max(64),
});
export type AssignLocationRoleInput = z.infer<typeof AssignLocationRoleInputSchema>;
class AssignLocationRoleInputDto extends createZodDto(AssignLocationRoleInputSchema) {}

// D-15: brand-neutral (mirrors member-roles.controller.ts) — assigns
// roles across a brand's locations, not scoped to one pinned location.
@ApiTags('identity')
@BrandNeutral()
@Controller('v1/members')
export class MemberLocationRolesController {
  constructor(
    @Inject(AssignLocationRoleService)
    private readonly assignLocationRoleSvc: AssignLocationRoleService,
  ) {}

  @Post(':memberId/location-roles')
  @RequiresTenantContext()
  @HttpCode(HttpStatus.OK)
  @Permissions({ ac: ['update'] })
  assignLocationRole(
    @Param('memberId') memberId: string,
    @Body(new RestoZodValidationPipe(AssignLocationRoleInputDto)) input: AssignLocationRoleInput,
  ) {
    const ctx = requireTenantContext();
    const organizationId = TenantId.parse(ctx.tenantId);
    return wrap(() =>
      this.assignLocationRoleSvc.execute({
        organizationId,
        memberId,
        locationId: input.locationId,
        roleSlug: input.roleSlug,
      }),
    );
  }

  @Delete(':memberId/location-roles/:locationId')
  @RequiresTenantContext()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions({ ac: ['update'] })
  removeLocationRole(@Param('memberId') memberId: string, @Param('locationId') locationId: string) {
    const ctx = requireTenantContext();
    const organizationId = TenantId.parse(ctx.tenantId);
    return wrap(() =>
      this.assignLocationRoleSvc.execute({
        organizationId,
        memberId,
        locationId,
        roleSlug: null,
      }),
    );
  }
}
