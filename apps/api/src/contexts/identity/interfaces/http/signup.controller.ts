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
  UsePipes,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { ZodValidationPipe } from '../../../tenancy/interfaces/http/zod-validation.pipe';
import { SignUpInput } from '../../application/dto';
import { SignUpService } from '../../application/signup.service';
import {
  SlugUnavailableError,
  SignupEmailAlreadyExistsError,
  SignupBetterAuthFailureError,
} from '../../domain/signup-errors';
import { Public } from './decorators/public.decorator';

interface SignUpResponseBody {
  tenant: {
    id: string;
    slug: string;
    displayName: string;
    status: string;
    primaryDomain: string;
  };
  userId: string;
}

@ApiTags('identity')
@Controller('v1/signup')
export class SignUpController {
  constructor(@Inject(SignUpService) private readonly signup: SignUpService) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(SignUpInput))
  async create(
    @Body() input: SignUpInput,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SignUpResponseBody> {
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
