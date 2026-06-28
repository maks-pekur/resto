export const safeNext = (raw: string): string =>
  raw.startsWith('/') && !/^\/[\\/]/.test(raw) ? raw : '/dashboard';
