const devDefaults: Partial<Record<string, string>> = {
  VITE_API_ORIGIN: 'http://localhost:3000',
};

export const getEnv = (key: string): string => {
  const val = (import.meta.env as Record<string, string | undefined>)[key];
  if (!val && import.meta.env.PROD) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return val ?? (import.meta.env.DEV ? (devDefaults[key] ?? '') : '');
};

export const VITE_API_ORIGIN = getEnv('VITE_API_ORIGIN');
