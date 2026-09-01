import { z } from 'zod';

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/u;

export const OpeningInterval = z
  .object({
    from: z.string().regex(TIME_OF_DAY, 'HH:MM expected'),
    // Earlier than `from` means the kitchen works past midnight, which is normal for a restaurant.
    to: z.string().regex(TIME_OF_DAY, 'HH:MM expected'),
  })
  .strip();
export type OpeningInterval = z.infer<typeof OpeningInterval>;

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const day = z.array(OpeningInterval).max(3).default([]);

/** An empty day is a closed day; a null `openingHours` is a venue that has not filled them in. */
export const OpeningHours = z
  .object({ mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day })
  .strip();
export type OpeningHours = z.infer<typeof OpeningHours>;

/** Guest wi-fi as printed on the table tent — public by design, never staff credentials. */
export const WifiAccess = z
  .object({
    ssid: z.string().trim().min(1).max(64),
    password: z.string().trim().max(128).nullable().default(null),
  })
  .strip();
export type WifiAccess = z.infer<typeof WifiAccess>;
