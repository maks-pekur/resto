import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { getBrandId, requireTenantContext } from '@resto/db';
import { MenuItemId } from '@resto/domain';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { GetMenuItemService } from '../../application/get-menu-item.service';
import { GetPublishedMenuService } from '../../application/get-published-menu.service';
import { MenuItemNotFoundError } from '../../domain/errors';
import type { PublishedMenu, PublishedMenuItem } from '../../domain/published-menu';
import { mapCatalogError } from './error-mapping';
import { Public, RequireActiveTenant } from '../../../../shared/auth';
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
  isStopListed: z.boolean(),
});

const PublishedMenuCategorySchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: LocalizedTextSchema,
  description: LocalizedTextSchema.nullable(),
  sortOrder: z.number().int().nonnegative(),
});

const PublishedMenuModifierOptionSchema = z.object({
  id: z.string(),
  name: LocalizedTextSchema,
  priceDelta: z.string(),
  defaultAmount: z.number().int().nonnegative(),
  freeAmount: z.number().int().nonnegative(),
  sortOrder: z.number().int().nonnegative(),
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

const wrap = wrapWith(mapCatalogError);

/**
 * Customer-facing read path. Tenant is resolved by the global
 * `TenantContextMiddleware` from the request host; absence of a
 * resolved tenant collapses these endpoints to 404 (the qr-menu only
 * makes sense at a tenant subdomain).
 */
@ApiTags('catalog')
@Public()
@Controller('v1/menu')
export class PublicMenuController {
  constructor(
    @Inject(GetPublishedMenuService) private readonly getMenu: GetPublishedMenuService,
    @Inject(GetMenuItemService) private readonly getItem: GetMenuItemService,
  ) {}

  @Get()
  @RequireActiveTenant()
  @ApiOkResponse({ type: PublishedMenuDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto, description: 'no tenant resolved for host' })
  async menu(): Promise<PublishedMenu> {
    const ctx = requireTenantOr404();
    requireBrandOr404();
    return wrap(() => this.getMenu.execute(ctx.tenantId));
  }

  @Get('items/:id')
  @RequireActiveTenant()
  @ApiOkResponse({ type: PublishedMenuItemDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async item(@Param('id') id: string): Promise<PublishedMenuItem> {
    requireTenantOr404();
    requireBrandOr404();
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
