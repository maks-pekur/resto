const devDefaults: Partial<Record<string, string>> = {
  VITE_API_ORIGIN: 'http://localhost:3000',
};

// G-05: reject localhost values in production (same family as ADR-0020 I-3).
const isLocalhostUrl = (val: string): boolean => /^https?:\/\/localhost(:\d+)?(\/|$)/.test(val);

export const getEnv = (key: string): string => {
  const val = (import.meta.env as Record<string, string | undefined>)[key];
  if (import.meta.env.PROD) {
    if (!val) throw new Error(`Missing required env var: ${key}`);
    if (isLocalhostUrl(val))
      throw new Error(
        `${key} must not be a localhost URL in production (got: ${val}). Set a real HTTPS origin.`,
      );
  }
  return val ?? (import.meta.env.DEV ? (devDefaults[key] ?? '') : '');
};

export const VITE_API_ORIGIN = getEnv('VITE_API_ORIGIN');
