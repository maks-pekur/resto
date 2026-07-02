import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { wrapWith } from '../../../../shared/api/wrap';
import {
  BrandNeutral,
  Permissions,
  RequireActiveTenant,
  RequireBrand,
} from '../../../../shared/auth';
import { Public } from '../../../../shared/auth/public.decorator';
import { StartBrandOnboardingService } from '../../application/start-brand-onboarding.service';
import { OAUTH_NONCE_COOKIE } from '../../domain/oauth-state';
import { mapDomainError } from './error-mapping';

const AccountSessionResponseSchema = z.object({
  clientSecret: z.string(),
});
class AccountSessionResponseDto extends createZodDto(AccountSessionResponseSchema) {}

const AccountLinkResponseSchema = z.object({
  onboardingUrl: z.string().url(),
});
class AccountLinkResponseDto extends createZodDto(AccountLinkResponseSchema) {}

const OnboardingStatusResponseSchema = z.object({
  accountType: z.enum(['express', 'standard']).nullable(),
  onboardingStatus: z.enum(['not_started', 'pending', 'complete', 'restricted']),
  chargesEnabled: z.boolean(),
  payoutsEnabled: z.boolean(),
  canAcceptPayments: z.boolean(),
  requirementsDue: z.array(z.string()).nullable(),
});
class OnboardingStatusResponseDto extends createZodDto(OnboardingStatusResponseSchema) {}

const OAuthStartResponseSchema = z.object({
  authorizeUrl: z.string().url(),
});
class OAuthStartResponseDto extends createZodDto(OAuthStartResponseSchema) {}

const IS_PROD = process.env.NODE_ENV === 'production';

function buildNonceCookieHeader(nonce: string): string {
  const attrs = [
    `${OAUTH_NONCE_COOKIE}=${nonce}`,
    'HttpOnly',
    IS_PROD ? 'Secure' : '',
    'SameSite=Lax',
    'Path=/',
  ]
    .filter((a) => a !== '')
    .join('; ');
  return attrs;
}

function parseCookieHeader(header: string, name: string): string | undefined {
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k?.trim() === name) return rest.join('=').trim();
  }
  return undefined;
}

function buildClearCookieHeader(): string {
  return `${OAUTH_NONCE_COOKIE}=; HttpOnly; ${IS_PROD ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=0`;
}

@ApiTags('tenancy')
@Controller('v1/tenancy/brands/:slug/onboarding')
export class BrandOnboardingController {
  readonly #wrap = wrapWith(mapDomainError);

  constructor(private readonly service: StartBrandOnboardingService) {}

  @Post('account-session')
  @HttpCode(HttpStatus.OK)
  @Permissions({ tenant: ['transfer'] })
  @RequireActiveTenant()
  @RequireBrand()
  @ApiOkResponse({ type: AccountSessionResponseDto })
  async createAccountSession(@Param('slug') slug: string): Promise<AccountSessionResponseDto> {
    return this.#wrap(() => this.service.createEmbeddedSession(slug));
  }

  @Post('account-link')
  @HttpCode(HttpStatus.OK)
  @Permissions({ tenant: ['transfer'] })
  @RequireActiveTenant()
  @RequireBrand()
  @ApiOkResponse({ type: AccountLinkResponseDto })
  async createAccountLink(@Param('slug') slug: string): Promise<AccountLinkResponseDto> {
    return this.#wrap(() => this.service.createHostedLink(slug));
  }

  @Get('status')
  @Permissions({ tenant: ['read'] })
  @RequireActiveTenant()
  @RequireBrand()
  @ApiOkResponse({ type: OnboardingStatusResponseDto })
  async getStatus(@Param('slug') slug: string): Promise<OnboardingStatusResponseDto> {
    return this.#wrap(() => this.service.getStatus(slug));
  }

  @Get('oauth/start')
  @HttpCode(HttpStatus.OK)
  @Permissions({ tenant: ['transfer'] })
  @RequireActiveTenant()
  @RequireBrand()
  @ApiOkResponse({ type: OAuthStartResponseDto })
  async startOAuth(
    @Param('slug') slug: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<OAuthStartResponseDto> {
    return this.#wrap(async () => {
      const result = await this.service.startOAuth(slug);
      res.raw.setHeader('Set-Cookie', buildNonceCookieHeader(result.nonce));
      return { authorizeUrl: result.authorizeUrl };
    });
  }
}

@ApiTags('tenancy')
@BrandNeutral()
@Controller('v1/tenancy/onboarding')
export class BrandOAuthCallbackController {
  readonly #wrap = wrapWith(mapDomainError);

  constructor(private readonly service: StartBrandOnboardingService) {}

  @Get('oauth/callback')
  @Public()
  async handleOAuthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ): Promise<void> {
    const cookieHeader = req.headers.cookie ?? '';
    const nonce = parseCookieHeader(cookieHeader, OAUTH_NONCE_COOKIE);

    if (!nonce) {
      throw new BadRequestException('OAuth nonce cookie missing — CSRF validation failed.');
    }

    res.raw.setHeader('Set-Cookie', buildClearCookieHeader());

    const result = await this.#wrap(() => this.service.handleOAuthCallback({ code, state, nonce }));

    const redirectUrl = (result as { redirectUrl: string }).redirectUrl;

    if (!/^https?:\/\//.test(redirectUrl) || /^\/[\\/]/.test(redirectUrl)) {
      throw new BadRequestException('Invalid redirect URL after OAuth callback.');
    }

    await res.redirect(redirectUrl, HttpStatus.FOUND);
  }
}
