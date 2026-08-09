import {
  CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { OWNER_ONLY_KEY } from '../../../../../shared/auth';

@Injectable()
export class OwnerOnlyGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean | undefined>(OWNER_ONLY_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;

    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const principal = req.principal;
    if (principal?.kind !== 'operator' || principal.baseRole !== 'owner') {
      throw new NotFoundException();
    }
    return true;
  }
}
