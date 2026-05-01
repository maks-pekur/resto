import { z } from 'zod';

/**
 * Standard audit timestamps shared by every domain entity. Mirrors the
 * `timestampsColumns` helper in `@resto/db`.
 *
 * Spread into `z.object({ ...timestampsShape })` rather than nested so the
 * fields stay flat at the row level.
 */
export const timestampsShape = {
  createdAt: z.date(),
  updatedAt: z.date(),
  archivedAt: z.date().nullable(),
};
