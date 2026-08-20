import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { requireTenantContext } from '@resto/db';
import { TenantId } from '@resto/domain';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import {
  BrandNeutral,
  LocationNeutral,
  Permissions,
  RequiresTenantContext,
} from '../../../../shared/auth';
import { wrapWith } from '../../../../shared/api/wrap';
import {
  CreateRoleInputDto,
  type CreateRoleInput,
  UpdateRoleInputDto,
  type UpdateRoleInput,
} from '../../application/dto';
import { CreateRoleService } from '../../application/create-role.service';
import { UpdateRoleService } from '../../application/update-role.service';
import { ArchiveRoleService } from '../../application/archive-role.service';
import { ListRolesService } from '../../application/list-roles.service';
import { RoleNotFoundError } from '../../domain/errors';
import { mapIdentityError } from './error-mapping';
import { CurrentOperator } from './decorators/current-principal.decorator';
import type { OperatorPrincipal } from '../../domain/principal';

const wrap = wrapWith(mapIdentityError);

const toWebHeaders = (raw: FastifyRequest['headers']): Headers => {
  const headers = new Headers();
  for (const [k, v] of Object.entries(raw)) {
    if (k.toLowerCase() === 'cookie') {
      const joined = Array.isArray(v) ? v.join('; ') : typeof v === 'string' ? v : '';
      if (joined.length > 0) headers.set('cookie', joined);
      continue;
    }
    if (Array.isArray(v)) {
      v.forEach((vv) => {
        headers.append(k, vv);
      });
    } else if (typeof v === 'string') {
      headers.set(k, v);
    }
  }
  return headers;
};

@ApiTags('identity')
@BrandNeutral()
@LocationNeutral()
@Controller('v1/roles')
export class RolesController {
  constructor(
    @Inject(CreateRoleService) private readonly createRole: CreateRoleService,
    @Inject(UpdateRoleService) private readonly updateRole: UpdateRoleService,
    @Inject(ArchiveRoleService) private readonly archiveRole: ArchiveRoleService,
    @Inject(ListRolesService) private readonly listRoles: ListRolesService,
  ) {}

  @Post()
  @RequiresTenantContext()
  @HttpCode(HttpStatus.CREATED)
  @Permissions({ ac: ['create'] })
  createRoleHandler(
    @CurrentOperator() operator: OperatorPrincipal,
    @Body(new RestoZodValidationPipe(CreateRoleInputDto)) input: CreateRoleInput,
    @Req() req: FastifyRequest,
  ) {
    const ctx = requireTenantContext();
    const organizationId = TenantId.parse(ctx.tenantId);
    return wrap(() =>
      this.createRole.execute({
        roleName: input.roleName,
        permission: input.permission,
        organizationId,
        actorUserId: operator.userId,
        headers: toWebHeaders(req.headers),
      }),
    );
  }

  @Put(':roleSlug')
  @RequiresTenantContext()
  @Permissions({ ac: ['update'] })
  updateRoleHandler(
    @CurrentOperator() operator: OperatorPrincipal,
    @Param('roleSlug') roleSlug: string,
    @Body(new RestoZodValidationPipe(UpdateRoleInputDto)) input: UpdateRoleInput,
    @Req() req: FastifyRequest,
  ) {
    const ctx = requireTenantContext();
    const organizationId = TenantId.parse(ctx.tenantId);
    return wrap(() =>
      this.updateRole.execute({
        roleSlug,
        permission: input.permission,
        organizationId,
        actorUserId: operator.userId,
        headers: toWebHeaders(req.headers),
      }),
    );
  }

  @Delete(':roleSlug')
  @RequiresTenantContext()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions({ ac: ['delete'] })
  archiveRoleHandler(
    @CurrentOperator() operator: OperatorPrincipal,
    @Param('roleSlug') roleSlug: string,
    @Req() req: FastifyRequest,
  ) {
    const ctx = requireTenantContext();
    const organizationId = TenantId.parse(ctx.tenantId);
    return wrap(() =>
      this.archiveRole.execute({
        roleSlug,
        organizationId,
        actorUserId: operator.userId,
        headers: toWebHeaders(req.headers),
      }),
    );
  }

  @Get()
  @RequiresTenantContext()
  @Permissions({ ac: ['read'] })
  listRolesHandler(@Req() req: FastifyRequest) {
    const ctx = requireTenantContext();
    const organizationId = TenantId.parse(ctx.tenantId);
    return wrap(() =>
      this.listRoles.execute({
        organizationId,
        headers: toWebHeaders(req.headers),
      }),
    );
  }

  @Get(':roleSlug')
  @RequiresTenantContext()
  @Permissions({ ac: ['read'] })
  getRoleHandler(@Param('roleSlug') roleSlug: string, @Req() req: FastifyRequest) {
    const ctx = requireTenantContext();
    const organizationId = TenantId.parse(ctx.tenantId);
    return wrap(async () => {
      const { roles } = await this.listRoles.execute({
        organizationId,
        headers: toWebHeaders(req.headers),
      });
      const role = roles.find((r) => r.role === roleSlug);
      if (!role) {
        throw new RoleNotFoundError(roleSlug);
      }
      return role;
    });
  }
}
