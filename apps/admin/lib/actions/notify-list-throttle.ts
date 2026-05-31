const THROTTLE_WINDOW_MS = 60_000;
const THROTTLE_MAX = 5;
const recentSignups: { ts: number; email: string }[] = [];

export const shouldThrottle = (email: string): boolean => {
  const now = Date.now();
  while (recentSignups.length > 0 && now - (recentSignups[0]?.ts ?? 0) > THROTTLE_WINDOW_MS) {
    recentSignups.shift();
  }
  const distinctEmails = new Set(recentSignups.map((s) => s.email));
  if (distinctEmails.size >= THROTTLE_MAX && !distinctEmails.has(email)) {
    return true;
  }
  recentSignups.push({ ts: now, email });
  return false;
};

export const __resetNotifyListThrottleForTests = (): void => {
  recentSignups.length = 0;
};
