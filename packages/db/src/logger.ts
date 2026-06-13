import pino from 'pino';

/**
 * Package-local logger. Apps may override the global pino logger with
 * their own configuration; this module just produces structured records
 * tagged with `pkg: '@resto/db'`.
 */
export const logger = pino({
  name: 'resto-db',
  level: process.env.LOG_LEVEL ?? 'info',
  base: { pkg: '@resto/db' },
  redact: {
    paths: [
      'password',
      'token',
      'email',
      'phone',
      'params',
      '*.password',
      '*.token',
      '*.email',
      '*.phone',
      '*.params',
    ],
    censor: '[redacted]',
  },
});

export type Logger = typeof logger;
