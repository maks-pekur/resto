const ALLOWED_NODE_ENVS = ['development', 'test'] as const;
const CONFIRMATION_VAR = 'RESTO_CONFIRM_RESET';
const CONFIRMATION_VALUE = 'yes-wipe-my-dev-db';
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', 'postgres']);

/**
 * Thrown by any of the `db:reset` guards when their precondition fails.
 * The CLI shell catches this and exits 1 after logging the message.
 * Pure-function design keeps the guards unit-testable without mocking
 * `process.exit`.
 */
export class ResetGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResetGuardError';
  }
}

/**
 * Layer 1: NODE_ENV allowlist. Anything other than the listed values
 * — including unset, `prod`, `live`, typos — refused.
 */
export const assertNodeEnvAllowed = (nodeEnv: string | undefined): void => {
  if (!nodeEnv || !(ALLOWED_NODE_ENVS as readonly string[]).includes(nodeEnv)) {
    throw new ResetGuardError(
      `db:reset refused: NODE_ENV must be one of ${ALLOWED_NODE_ENVS.join('/')} ` +
        `(got ${JSON.stringify(nodeEnv ?? '<unset>')}). This is an allowlist, ` +
        `not a blocklist — typos and unset values are refused.`,
    );
  }
};

/**
 * Layer 2: Confirmation sentinel. Literal sentence value (not a boolean
 * toggle) to defeat muscle-memory `export ${VAR}=1` in a `.bashrc`.
 */
export const assertConfirmationProvided = (value: string | undefined): void => {
  if (value !== CONFIRMATION_VALUE) {
    throw new ResetGuardError(
      `db:reset refused: ${CONFIRMATION_VAR} must equal "${CONFIRMATION_VALUE}" ` +
        `(got ${JSON.stringify(value ?? '<unset>')}). ` +
        `Re-run with: ${CONFIRMATION_VAR}=${CONFIRMATION_VALUE} pnpm db:reset`,
    );
  }
};

/**
 * Layer 3: Host allowlist. The URL must be a valid Postgres URL whose
 * hostname is in the dev-host allowlist. No fallback to DATABASE_URL —
 * symmetry with packages/db/CLAUDE.md § CLI rule for db:migrate.
 *
 * Declared as a TS `asserts` function so callers get cross-module type
 * narrowing — no `as string` cast needed at the call site.
 */
export function assertHostAllowed(url: string | undefined): asserts url is string {
  if (!url) {
    throw new ResetGuardError(
      'db:reset refused: DATABASE_ADMIN_URL is required ' +
        '(no fallback to DATABASE_URL; that fallback masks "your terminal ' +
        'is pointed at prod" misconfigurations).',
    );
  }
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new ResetGuardError('db:reset refused: DATABASE_ADMIN_URL is not a valid URL.');
  }
  if (!ALLOWED_HOSTS.has(host)) {
    throw new ResetGuardError(
      `db:reset refused: host ${JSON.stringify(host)} not in dev-host ` +
        `allowlist [${[...ALLOWED_HOSTS].join(', ')}]. Set DATABASE_ADMIN_URL ` +
        `to a local Postgres.`,
    );
  }
}
