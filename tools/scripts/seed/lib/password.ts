import { randomBytes } from 'node:crypto';

const URL_SAFE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * 24-char URL-safe random password sourced from `crypto.randomBytes`.
 * Above BA's default 8-char minimum. Each byte's low 6 bits map directly
 * to one of the 64 alphabet chars — uniform sampling without rejection.
 */
export const generateOwnerPassword = (): string => {
  const bytes = randomBytes(24);
  let out = '';
  for (let i = 0; i < 24; i += 1) {
    out += URL_SAFE_ALPHABET[(bytes.at(i) ?? 0) & 0x3f] ?? '';
  }
  return out;
};

export class PasswordFlagDisallowedError extends Error {
  readonly code = 'password_flag_disallowed' as const;
  constructor() {
    super('--owner-password is only allowed when NODE_ENV=development');
    this.name = 'PasswordFlagDisallowedError';
  }
}

export const assertPasswordFlagAllowed = (env: NodeJS.ProcessEnv): void => {
  if (env.NODE_ENV !== 'development') {
    throw new PasswordFlagDisallowedError();
  }
};

export class PasswordStdinTtyError extends Error {
  readonly code = 'password_stdin_tty' as const;
  constructor() {
    super('--password-stdin requires a non-TTY stdin (pipe a value in)');
    this.name = 'PasswordStdinTtyError';
  }
}

export const readPasswordFromStdin = async (): Promise<string> => {
  if (process.stdin.isTTY) {
    throw new PasswordStdinTtyError();
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks).toString('utf8').trim();
};
