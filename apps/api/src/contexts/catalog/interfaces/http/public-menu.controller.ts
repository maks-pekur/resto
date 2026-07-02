import { Controller, Get, Headers, Inject, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { getBrandId, requireTenantContext } from '@resto/db';
import { MenuItemId, TenantId } from '@resto/domain';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { GetMenuAvailabilityService } from '../../application/get-menu-availability.service';
import { GetMenuItemService } from '../../application/get-menu-item.service';
import { GetPublishedMenuService } from '../../application/get-published-menu.service';
import { MENU_VERSION_PORT, type MenuVersionPort } from '../../domain/ports';
import { MenuItemNotFoundError } from '../../domain/errors';
import type { PublishedMenu, PublishedMenuItem } from '../../domain/published-menu';
import { mapCatalogError } from './error-mapping';
import { BrandNeutral, Public, RequireActiveTenant } from '../../../../shared/auth';
import { wrapWith } from '../../../../shared/api/wrap';

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

const PublishedMenuBrandSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  displayName: z.string(),
  theme: z
    .object({
      logoUrl: z.string().url().nullable(),
      primaryColor: z.string().nullable(),
      font: z.string().nullable(),
    })
    .nullable(),
});

const MenuAvailabilitySchema = z.object({
  stoppedItemIds: z.array(z.string().uuid()),
});

const PublishedMenuSchema = z.object({
  tenantId: z.string().uuid(),
  version: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  brand: PublishedMenuBrandSchema.nullable(),
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
 * `TenantContextMiddleware` from the request host; absence of a
 * resolved tenant collapses these endpoints to 404 (the qr-menu only
 * makes sense at a tenant subdomain).
 */
@ApiTags('catalog')
@Public()
@BrandNeutral()
@Controller('v1/menu')
export class PublicMenuController {
  constructor(
    @Inject(GetPublishedMenuService) private readonly getMenu: GetPublishedMenuService,
    @Inject(GetMenuItemService) private readonly getItem: GetMenuItemService,
    @Inject(GetMenuAvailabilityService)
    private readonly getAvailability: GetMenuAvailabilityService,
    @Inject(MENU_VERSION_PORT) private readonly menuVersions: MenuVersionPort,
  ) {}

  @Get('availability')
  @RequireActiveTenant()
  @ApiOkResponse({ type: MenuAvailabilityDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto, description: 'no tenant resolved for host' })
  async availability(
    @Res({ passthrough: true }) reply: FastifyReply,
    @Headers('if-none-match') ifNoneMatch?: string,
  ): Promise<{ stoppedItemIds: string[] } | undefined> {
    requireTenantOr404();
    requireBrandOr404();
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
    @Res({ passthrough: true }) reply: FastifyReply,
    @Headers('if-none-match') ifNoneMatch?: string,
  ): Promise<PublishedMenu | undefined> {
    const ctx = requireTenantOr404();
    requireBrandOr404();
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
    @Res({ passthrough: true }) reply: FastifyReply,
    @Headers('if-none-match') ifNoneMatch?: string,
  ): Promise<PublishedMenuItem | undefined> {
    const ctx = requireTenantOr404();
    requireBrandOr404();
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
}

const requireTenantOr404 = (): { readonly tenantId: string } => {
  try {
    return requireTenantContext();
  } catch {
    throw new NotFoundException('No tenant resolved for this host.');
  }
};

const requireBrandOr404 = (): void => {
  if (getBrandId() === undefined) {
    throw new NotFoundException('No brand resolved for this host.');
  }
};
