import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { TableZoneName } from '../domain/table-zone.aggregate';
import { TableNumber } from '../domain/restaurant-table.aggregate';

export const MAX_TABLES_PER_BULK_CALL = 200;
export const MAX_ACTIVE_TABLES_PER_LOCATION = 500;

export const CreateTableZoneInputSchema = z.object({
  name: TableZoneName,
  tableCount: z.number().int().min(0).max(MAX_TABLES_PER_BULK_CALL),
});
export type CreateTableZoneInput = z.infer<typeof CreateTableZoneInputSchema>;
export class CreateTableZoneInputDto extends createZodDto(CreateTableZoneInputSchema) {}

export const AddTablesInputSchema = z.object({
  count: z.number().int().min(1).max(MAX_TABLES_PER_BULK_CALL).default(1),
});
export type AddTablesInput = z.infer<typeof AddTablesInputSchema>;
export class AddTablesInputDto extends createZodDto(AddTablesInputSchema) {}

export const RenameTableZoneInputSchema = z.object({
  name: TableZoneName,
});
export type RenameTableZoneInput = z.infer<typeof RenameTableZoneInputSchema>;
export class RenameTableZoneInputDto extends createZodDto(RenameTableZoneInputSchema) {}

export const UpdateTableInputSchema = z.object({
  number: TableNumber,
});
export type UpdateTableInput = z.infer<typeof UpdateTableInputSchema>;
export class UpdateTableInputDto extends createZodDto(UpdateTableInputSchema) {}

const TableZoneStatusSchema = z.enum(['active', 'archived']);

/**
 * `qrUrl` is on every table because the admin bundle cannot compose it — the guest host is
 * server-only state and a tenant may sit on a verified custom domain no formula derives
 * (CONTEXT D-21). See `GuestMenuUrlService`, the one place the shape is written down.
 */
export const TableResponseSchema = z.object({
  id: z.string().uuid(),
  number: TableNumber,
  ordinal: z.number().int().positive(),
  status: TableZoneStatusSchema,
  qrUrl: z.string(),
});
export type TableResponse = z.infer<typeof TableResponseSchema>;
export class TableResponseDto extends createZodDto(TableResponseSchema) {}

export const TableZoneResponseSchema = z.object({
  id: z.string().uuid(),
  name: TableZoneName,
  status: TableZoneStatusSchema,
  tables: z.array(TableResponseSchema),
});
export type TableZoneResponse = z.infer<typeof TableZoneResponseSchema>;
export class TableZoneResponseDto extends createZodDto(TableZoneResponseSchema) {}
