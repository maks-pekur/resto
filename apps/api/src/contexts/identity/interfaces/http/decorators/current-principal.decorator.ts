import { type ExecutionContext, ForbiddenException, createParamDecorator } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { CustomerPrincipal, OperatorPrincipal, Principal } from '../../../domain/principal';

export const extractCurrentPrincipal = (_data: unknown, ctx: ExecutionContext): Principal => {
  const req = ctx.switchToHttp().getRequest<FastifyRequest>();
  return req.principal ?? { kind: 'anonymous' };
};

export const extractCurrentOperator = (
  _data: unknown,
  ctx: ExecutionContext,
): OperatorPrincipal => {
  const req = ctx.switchToHttp().getRequest<FastifyRequest>();
  const principal = req.principal;
  if (principal?.kind !== 'operator') {
    throw new ForbiddenException({
      code: 'auth.principal_kind_mismatch',
      message: 'Operator principal required.',
    });
  }
  return principal;
};

export const extractCurrentCustomer = (
  _data: unknown,
  ctx: ExecutionContext,
): CustomerPrincipal => {
  const req = ctx.switchToHttp().getRequest<FastifyRequest>();
  const principal = req.principal;
  if (principal?.kind !== 'customer') {
    throw new ForbiddenException({
      code: 'auth.principal_kind_mismatch',
      message: 'Customer principal required.',
    });
  }
  return principal;
};

export const CurrentPrincipal = createParamDecorator(extractCurrentPrincipal);
export const CurrentOperator = createParamDecorator(extractCurrentOperator);
export const CurrentCustomer = createParamDecorator(extractCurrentCustomer);
