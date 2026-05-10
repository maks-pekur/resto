import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  InternalServerErrorException,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiTags,
} from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { FastifyReply } from 'fastify';
import { SignUpInputDto } from '../../application/dto';
import { SignUpService } from '../../application/signup.service';
import {
  SlugUnavailableError,
  SignupEmailAlreadyExistsError,
  SignupBetterAuthFailureError,
} from '../../domain/signup-errors';
import { Public } from './decorators/public.decorator';

const SignUpResponseSchema = z.object({
  tenant: z.object({
    id: z.string().uuid(),
    slug: z.string(),
    displayName: z.string(),
    status: z.string(),
    primaryDomain: z.string(),
  }),
  userId: z.string(),
});

class SignUpResponseDto extends createZodDto(SignUpResponseSchema) {}

const ProblemDetailsSchema = z.object({
  type: z.string().url(),
  title: z.string(),
  status: z.number(),
  detail: z.string().optional(),
  instance: z.string(),
  correlationId: z.string().optional(),
  traceId: z.string().optional(),
});

class ProblemDetailsDto extends createZodDto(ProblemDetailsSchema) {}

@ApiTags('identity')
@Controller('v1/signup')
export class SignUpController {
  constructor(@Inject(SignUpService) private readonly signup: SignUpService) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: SignUpInputDto })
  @ApiCreatedResponse({ type: SignUpResponseDto })
  @ApiConflictResponse({ type: ProblemDetailsDto, description: 'email or slug already taken' })
  @ApiInternalServerErrorResponse({ type: ProblemDetailsDto })
  async create(
    @Body() input: SignUpInputDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SignUpResponseDto> {
    try {
      const result = await this.signup.execute(input);
      for (const cookie of result.setCookie) {
        reply.header('set-cookie', cookie);
      }
      return {
        tenant: {
          id: result.tenant.id,
          slug: result.tenant.slug,
          displayName: result.tenant.displayName,
          status: result.tenant.status,
          primaryDomain: result.tenant.primaryDomain.domain,
        },
        userId: result.userId,
      };
    } catch (err) {
      if (err instanceof SignupEmailAlreadyExistsError) {
        throw new ConflictException({ code: 'signup.email_taken', message: err.message });
      }
      if (err instanceof SlugUnavailableError) {
        throw new ConflictException({ code: 'signup.slug_unavailable', message: err.message });
      }
      if (err instanceof SignupBetterAuthFailureError) {
        throw new InternalServerErrorException({
          code: 'signup.auth_failed',
          message: 'Sign-up could not be completed; please try again.',
        });
      }
      throw err;
    }
  }
}
