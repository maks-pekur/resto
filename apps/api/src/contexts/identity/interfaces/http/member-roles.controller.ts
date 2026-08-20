import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Param,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { requireTenantContext } from '@resto/db';
import { TenantId } from '@resto/domain';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { LocationNeutral, Permissions, RequiresTenantContext } from '../../../../shared/auth';
import { wrapWith } from '../../../../shared/api/wrap';
import { AssignRoleInputDto, type AssignRoleInput } from '../../application/dto';
import { AssignRoleService } from '../../application/assign-role.service';
import { ListMembersService } from '../../application/list-members.service';
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
@LocationNeutral()
@Controller('v1/roles')
export class MemberRolesController {
  constructor(
    @Inject(AssignRoleService) private readonly assignRoleSvc: AssignRoleService,
    @Inject(ListMembersService) private readonly listMembersSvc: ListMembersService,
  ) {}

  @Post(':roleSlug/assign')
  @RequiresTenantContext()
  @HttpCode(HttpStatus.OK)
  @Permissions({ ac: ['update'] })
  assignRole(
    @CurrentOperator() operator: OperatorPrincipal,
    @Param('roleSlug') roleSlug: string,
    @Body(new RestoZodValidationPipe(AssignRoleInputDto)) input: AssignRoleInput,
    @Req() req: FastifyRequest,
  ) {
    const ctx = requireTenantContext();
    const organizationId = TenantId.parse(ctx.tenantId);
    return wrap(() =>
      this.assignRoleSvc.execute({
        organizationId,
        actorUserId: operator.userId,
        targetMemberId: input.memberId,
        roleSlug,
        headers: toWebHeaders(req.headers),
      }),
    );
  }

  @Get('members')
  @RequiresTenantContext()
  @Permissions({ ac: ['read'] })
  listMembers() {
    const ctx = requireTenantContext();
    const organizationId = TenantId.parse(ctx.tenantId);
    return wrap(() => this.listMembersSvc.execute({ organizationId }));
  }
}
