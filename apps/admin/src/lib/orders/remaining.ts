export interface RemainingTime {
  readonly label: string;
  readonly late: boolean;
}

/**
 * How long is left of the promise made to the guest. Past the promise it keeps counting with a
 * minus in front — four minutes late has to read differently from four minutes early, and a bare
 * "00:04" reads the same either way.
 */
export const remainingTime = (etaAt: string | null, now: number): RemainingTime | null => {
  if (etaAt === null) return null;
  const deltaMs = new Date(etaAt).getTime() - now;
  const late = deltaMs < 0;
  const absMs = Math.abs(deltaMs);
  const hours = Math.floor(absMs / 3_600_000);
  const minutes = Math.floor((absMs % 3_600_000) / 60_000);
  const seconds = Math.floor((absMs % 60_000) / 1000);
  const body =
    hours > 0
      ? `${String(hours)}:${String(minutes).padStart(2, '0')}`
      : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return { label: late ? `−${body}` : body, late };
};

export interface Countdown {
  /** Parts of the remaining span, always non-negative — `late` carries the sign. */
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly totalMinutes: number;
  /** True once the span is too far out for a number to say anything useful. */
  readonly overflow: boolean;
  readonly late: boolean;
  /** 1 at the moment the promise was made, 0 when it comes due. */
  readonly progress: number;
  readonly tone: 'calm' | 'warning' | 'late';
}

const WARNING_AT = 0.25;
/** Past this the exact figure stops being information — three days out is simply "not now". */
const OVERFLOW_MINUTES = 3 * 24 * 60;

export const countdown = (
  etaAt: string | null,
  startedAt: string,
  now: number,
): Countdown | null => {
  if (etaAt === null) return null;
  const due = new Date(etaAt).getTime();
  const start = new Date(startedAt).getTime();
  const remainingMs = due - now;
  const late = remainingMs < 0;
  // A promise made in the past leaves no span to drain; treat it as spent rather than dividing
  // by zero and painting a full ring on an order that is already due.
  const spanMs = due - start;
  const progress = late || spanMs <= 0 ? 0 : Math.min(remainingMs / spanMs, 1);
  const totalMinutes = Math.max(Math.round(Math.abs(remainingMs) / 60_000), 0);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;

  return {
    days,
    hours,
    minutes,
    totalMinutes,
    overflow: totalMinutes >= OVERFLOW_MINUTES,
    late,
    progress,
    tone: late ? 'late' : progress <= WARNING_AT ? 'warning' : 'calm',
  };
};
