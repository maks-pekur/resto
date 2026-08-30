import { z } from 'zod';
import { MAX_TABLES_PER_BULK_CALL } from '@/lib/queries/table-zones';

export const ZONE_NAME_MAX = 60;

/** Messages are i18n keys, not sentences: the form resolves them under `tables.form`. */
export const ZoneFormSchema = z.object({
  name: z.string().trim().min(1, 'nameRequired').max(ZONE_NAME_MAX, 'nameTooLong'),
  tableCount: z.coerce
    .number({ invalid_type_error: 'countInvalid' })
    .int('countInvalid')
    .min(0, 'countInvalid')
    .max(MAX_TABLES_PER_BULK_CALL, 'countTooMany'),
});

export type ZoneFormValues = z.infer<typeof ZoneFormSchema>;
