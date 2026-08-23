import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiTags,
} from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { SignUpInputDto } from '../../application/dto';
import { SignUpService } from '../../application/signup/signup.service';
import { mapIdentityError } from './error-mapping';
import { LocationNeutral, Public } from '../../../../shared/auth';
import { wrapWith } from '../../../../shared/api/wrap';

/**
 * D-06 enumeration-parity response: identical body shape for "email taken"
 * and "email new". Pre-Phase-03 this controller returned `{ tenant, userId }`
 * plus Set-Cookie on success and 409 ProblemDetails on existing email — the
 * status divergence + the Set-Cookie divergence were the leak. Both branches
 * now collapse to `{ status: 'pending_verification' }`. The new user must
 * complete email verification and sign in on subsequent requests.
 */
const SignUpResponseSchema = z.object({
  status: z.literal('pending_verification'),
});

class SignUpResponseDto extends createZodDto(SignUpResponseSchema) {}

const wrap = wrapWith(mapIdentityError);

@ApiTags('identity')
@LocationNeutral()
@Controller('v1/signup')
export class SignUpController {
  constructor(@Inject(SignUpService) private readonly signup: SignUpService) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: SignUpInputDto })
  @ApiCreatedResponse({ type: SignUpResponseDto })
  @ApiConflictResponse({ type: ProblemDetailsDto, description: 'slug exhausted (rare)' })
  @ApiBadRequestResponse({ type: ProblemDetailsDto, description: 'sign-up could not be completed' })
  async create(
    @Body(new RestoZodValidationPipe(SignUpInputDto)) input: SignUpInputDto,
  ): Promise<SignUpResponseDto> {
    // D-06: executeOrTimeEqualize swallows SignupEmailAlreadyExistsError
    // and pads response timing to a fixed floor. The controller deliberately
    // does NOT forward Set-Cookie — both branches must look identical on
    // the wire (Pitfall 1 in 03-RESEARCH.md).
    return wrap(() => this.signup.executeOrTimeEqualize(input));
  }
}
