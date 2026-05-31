export const formatAge = (timestampMs: number, now: number = Date.now()): string => {
  const diff = Math.max(0, now - timestampMs);
  if (diff < 60_000) {
    const seconds = Math.floor(diff / 1_000);
    return `${seconds.toString()}с назад`;
  }
  if (diff < 3_600_000) {
    const minutes = Math.floor(diff / 60_000);
    return `${minutes.toString()}м назад`;
  }
  const hours = Math.floor(diff / 3_600_000);
  return `${hours.toString()}ч назад`;
};
