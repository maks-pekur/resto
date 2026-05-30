import { z } from 'zod';
import { TenantId } from '@resto/domain';
import { defineEventContract } from '../envelope';

export const MenuFirstPublishedV1Payload = z.object({
  tenantId: TenantId,
  version: z.number().int().positive(),
});
export type MenuFirstPublishedV1Payload = z.infer<typeof MenuFirstPublishedV1Payload>;

export const MenuFirstPublishedV1 = defineEventContract({
  type: 'catalog.menu_first_published.v1',
  payload: MenuFirstPublishedV1Payload,
});

export const MenuRepublishedV1Payload = z.object({
  tenantId: TenantId,
  version: z.number().int().positive(),
});
export type MenuRepublishedV1Payload = z.infer<typeof MenuRepublishedV1Payload>;

export const MenuRepublishedV1 = defineEventContract({
  type: 'catalog.menu_republished.v1',
  payload: MenuRepublishedV1Payload,
});

export const ItemStoppedV1Payload = z.object({
  tenantId: TenantId,
  itemId: z.string().uuid(),
  itemSlug: z.string().min(1).max(120),
  stoppedByUserId: z.string().uuid().nullable(),
  stoppedAt: z.coerce.date(),
});
export type ItemStoppedV1Payload = z.infer<typeof ItemStoppedV1Payload>;

export const ItemStoppedV1 = defineEventContract({
  type: 'catalog.item_stopped.v1',
  payload: ItemStoppedV1Payload,
});

export const ItemUnstoppedV1Payload = z.object({
  tenantId: TenantId,
  itemId: z.string().uuid(),
  itemSlug: z.string().min(1).max(120),
  unstoppedByUserId: z.string().uuid().nullable(),
});
export type ItemUnstoppedV1Payload = z.infer<typeof ItemUnstoppedV1Payload>;

export const ItemUnstoppedV1 = defineEventContract({
  type: 'catalog.item_unstopped.v1',
  payload: ItemUnstoppedV1Payload,
});
