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
