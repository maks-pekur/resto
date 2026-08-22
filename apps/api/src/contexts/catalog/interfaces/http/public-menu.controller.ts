import {
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { MenuItemId, TenantId } from '@resto/domain';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { GetMenuAvailabilityService } from '../../application/get-menu-availability.service';
import { GetMenuItemService } from '../../application/get-menu-item.service';
import { GetPublishedMenuService } from '../../application/get-published-menu.service';
import { MENU_VERSION_PORT, type MenuVersionPort } from '../../domain/ports';
import { MenuItemNotFoundError } from '../../domain/errors';
import type { PublishedMenu, PublishedMenuItem } from '../../domain/published-menu';
import { mapCatalogError } from './error-mapping';
import { LocationNeutral, Public, RequireActiveTenant } from '../../../../shared/auth';
import { wrapWith } from '../../../../shared/api/wrap';
import { ENV_TOKEN } from '../../../../config/config.module';
import type { Env } from '../../../../config/env.schema';
import { effectiveHost } from '../../../../shared/effective-host';
import { TenantResolverService } from '../../../tenancy/application/tenant-resolver.service';

const LocalizedTextSchema = z.record(z.string(), z.string());

const PublishedMenuItemSizeSchema = z.object({
  id: z.string().uuid(),
  name: LocalizedTextSchema,
  price: z.string(),
  isDefault: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
});

const PublishedMenuItemPhotoSchema = z.object({
  s3Key: z.string(),
  sortOrder: z.number().int().nonnegative(),
  alt: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  isPrimary: z.boolean().optional(),
  url: z.string().url(),
});

const PublishedMenuItemSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  categoryId: z.string().uuid(),
  name: LocalizedTextSchema,
  description: LocalizedTextSchema.nullable(),
  basePrice: z.string(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  code: z.string().nullable(),
  weight: z.string().nullable(),
  measureUnit: z.enum(['g', 'kg', 'ml', 'l', 'pcs']).nullable(),
  imageUrl: z.string().url().nullable(),
  photos: z.array(PublishedMenuItemPhotoSchema),
  allergens: z.array(z.string()),
  sortOrder: z.number().int().nonnegative(),
  proteins: z.string().nullable(),
  fats: z.string().nullable(),
  carbs: z.string().nullable(),
  kcal: z.number().int().nullable(),
  nutritionEstimated: z.boolean(),
  sizes: z.array(PublishedMenuItemSizeSchema),
  modifierGroupIds: z.array(z.string().uuid()),
});

const PublishedMenuCategorySchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: LocalizedTextSchema,
  description: LocalizedTextSchema.nullable(),
  sortOrder: z.number().int().nonnegative(),
  code: z.string().nullable(),
});

const PublishedMenuModifierOptionSchema = z.object({
  id: z.string(),
  name: LocalizedTextSchema,
  priceDelta: z.string(),
  defaultAmount: z.number().int().nonnegative(),
  freeAmount: z.number().int().nonnegative(),
  sortOrder: z.number().int().nonnegative(),
  minAmount: z.number().int().nonnegative().nullable(),
  maxAmount: z.number().int().nonnegative().nullable(),
});

const PublishedMenuModifierGroupSchema = z.object({
  id: z.string().uuid(),
  name: LocalizedTextSchema,
  minSelectable: z.number().int().nonnegative(),
  maxSelectable: z.number().int().nonnegative(),
  isRequired: z.boolean(),
  options: z.array(PublishedMenuModifierOptionSchema),
});

const MenuAvailabilitySchema = z.object({
  stoppedItemIds: z.array(z.string().uuid()),
});

const PublishedMenuSchema = z.object({
  tenantId: z.string().uuid(),
  version: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  categories: z.array(PublishedMenuCategorySchema),
  items: z.array(PublishedMenuItemSchema),
  modifierGroups: z.array(PublishedMenuModifierGroupSchema),
});

class PublishedMenuDto extends createZodDto(PublishedMenuSchema) {}
class PublishedMenuItemDto extends createZodDto(PublishedMenuItemSchema) {}
class MenuAvailabilityDto extends createZodDto(MenuAvailabilitySchema) {}

const wrap = wrapWith(mapCatalogError);

/**
 * Customer-facing read path. Tenant is resolved by the global
 * `TenantContextMiddleware` from the request host, but that middleware's
 * fallback chain also resolves plain `<slug>.<domain>` hosts (reserved for
 * the future public website, D-22) via `resolveByHost`'s generic subdomain
 * match — a shape distinct from the guest-menu-specific `.menu.` host
 * `resolveByCustomerHost` requires. Trusting ALS alone would let the guest
 * menu leak onto that reserved host. Each handler here re-verifies the
 * REQUEST's own host against `resolveByCustomerHost` directly, independent
 * of whatever the middleware happened to bind — the only way to guarantee
 * this controller serves exclusively on the host D-22 assigns it.
 */
@ApiTags('catalog')
@Public()
@LocationNeutral()
@Controller('v1/menu')
export class PublicMenuController {
  constructor(
    @Inject(GetPublishedMenuService) private readonly getMenu: GetPublishedMenuService,
    @Inject(GetMenuItemService) private readonly getItem: GetMenuItemService,
    @Inject(GetMenuAvailabilityService)
    private readonly getAvailability: GetMenuAvailabilityService,
    @Inject(MENU_VERSION_PORT) private readonly menuVersions: MenuVersionPort,
    @Inject(TenantResolverService) private readonly tenants: TenantResolverService,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  @Get('availability')
  @RequireActiveTenant()
  @ApiOkResponse({ type: MenuAvailabilityDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto, description: 'no tenant resolved for host' })
  async availability(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Headers('if-none-match') ifNoneMatch?: string,
  ): Promise<{ stoppedItemIds: string[] } | undefined> {
    await this.requireGuestTenantOr404(req);
    const { stoppedItemIds, stopVersion } = await wrap(() => this.getAvailability.execute());
    const etag = '"' + stopVersion.toString() + '"';
    if (ifNoneMatch === etag) {
      reply.status(304);
      return undefined;
    }
    reply.header('ETag', etag);
    reply.header('Cache-Control', 'public, s-maxage=5');
    return { stoppedItemIds };
  }

  @Get()
  @RequireActiveTenant()
  @ApiOkResponse({ type: PublishedMenuDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto, description: 'no tenant resolved for host' })
  async menu(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Headers('if-none-match') ifNoneMatch?: string,
  ): Promise<PublishedMenu | undefined> {
    const ctx = await this.requireGuestTenantOr404(req);
    const version = await wrap(() => this.menuVersions.current(TenantId.parse(ctx.tenantId)));
    const etag = '"' + version.toString() + '"';
    if (ifNoneMatch === etag) {
      reply.status(304);
      return undefined;
    }
    reply.header('ETag', etag);
    reply.header('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
    return wrap(() => this.getMenu.execute(ctx.tenantId));
  }

  @Get('items/:id')
  @RequireActiveTenant()
  @ApiOkResponse({ type: PublishedMenuItemDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async item(
    @Param('id') id: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Headers('if-none-match') ifNoneMatch?: string,
  ): Promise<PublishedMenuItem | undefined> {
    const ctx = await this.requireGuestTenantOr404(req);
    const version = await wrap(() => this.menuVersions.current(TenantId.parse(ctx.tenantId)));
    const etag = '"' + version.toString() + '"';
    if (ifNoneMatch === etag) {
      reply.status(304);
      return undefined;
    }
    reply.header('ETag', etag);
    reply.header('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
    return wrap(() => {
      const parsed = MenuItemId.safeParse(id);
      if (!parsed.success) throw new MenuItemNotFoundError(id);
      return this.getItem.execute(parsed.data);
    });
  }

  private async requireGuestTenantOr404(
    req: FastifyRequest,
  ): Promise<{ readonly tenantId: string }> {
    const trustProxy = this.env.TRUST_PROXY !== undefined && this.env.TRUST_PROXY.length > 0;
    const host = effectiveHost(req.headers, trustProxy);
    const resolved = await this.tenants.resolveByCustomerHost(host);
    if (!resolved) throw new NotFoundException('No tenant resolved for this host.');
    return { tenantId: resolved.id };
  }
}
