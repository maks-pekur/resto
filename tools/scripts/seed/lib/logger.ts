/**
 * Structured stdout logger. Operators read the output; downstream log
 * shippers parse the JSON. Keeping this separate from a real
 * observability stack so the CLI runs without infra dependencies.
 */
export const log = (event: string, fields: Record<string, unknown> = {}): void => {
  const entry = {
    time: new Date().toISOString(),
    level: 'info',
    cli: 'resto-seed',
    event,
    ...fields,
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
};

export const logWarn = (event: string, fields: Record<string, unknown> = {}): void => {
  // eslint-disable-next-line no-console
  console.warn(
    JSON.stringify({
      time: new Date().toISOString(),
      level: 'warn',
      cli: 'resto-seed',
      event,
      ...fields,
    }),
  );
};

export const logError = (event: string, fields: Record<string, unknown> = {}): void => {
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      time: new Date().toISOString(),
      level: 'error',
      cli: 'resto-seed',
      event,
      ...fields,
    }),
  );
};
