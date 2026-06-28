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

export const formatDuration = (msSince: number): string => {
  const diff = Math.max(0, msSince);
  if (diff < 60_000) return `${Math.floor(diff / 1_000).toString()}с`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000).toString()}м`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000).toString()}ч`;
  return `${Math.floor(diff / 86_400_000).toString()}д`;
};
