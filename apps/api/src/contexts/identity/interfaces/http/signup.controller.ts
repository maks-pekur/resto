import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiTags,
} from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { FastifyReply } from 'fastify';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { SignUpInputDto } from '../../application/dto';
import { SignUpService } from '../../application/signup.service';
import { mapIdentityError } from './error-mapping';
import { Public } from '../../../../shared/auth';
import { wrapWith } from '../../../../shared/api/wrap';

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

const wrap = wrapWith(mapIdentityError);

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
  @ApiBadRequestResponse({ type: ProblemDetailsDto, description: 'sign-up could not be completed' })
  async create(
    @Body(new RestoZodValidationPipe(SignUpInputDto)) input: SignUpInputDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SignUpResponseDto> {
    const result = await wrap(() => this.signup.execute(input));
    for (const cookie of result.setCookie) {
      reply.header('set-cookie', cookie);
    }
    return {
      tenant: {
        id: result.tenant.id,
        slug: result.tenant.slug,
        displayName: result.tenant.displayName,
        status: result.tenant.status,
        primaryDomain: result.tenant.primaryDomainHostname,
      },
      userId: result.userId,
    };
  }
}
