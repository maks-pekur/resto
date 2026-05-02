/**
 * CLI options resolution. Reads from process.argv (for command-specific
 * flags) and from environment variables (for connection details — the
 * api URL and the internal token).
 *
 * The resolver is intentionally minimal — no commander/yargs dep. The
 * surface is small, the parser is straightforward, and the tests cover
 * the happy paths.
 */

export interface RuntimeOptions {
  readonly apiUrl: string;
  readonly internalToken: string;
  readonly dryRun: boolean;
}

export class MissingEnvError extends Error {
  constructor(public readonly variable: string) {
    super(`Required environment variable ${variable} is not set.`);
    this.name = 'MissingEnvError';
  }
}

const requireEnv = (name: string, env: NodeJS.ProcessEnv): string => {
  const value = env[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new MissingEnvError(name);
  }
  return value;
};

export const resolveRuntimeOptions = (
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): RuntimeOptions => ({
  apiUrl: env.RESTO_API_URL ?? 'http://localhost:3000',
  internalToken: requireEnv('INTERNAL_API_TOKEN', env),
  dryRun: argv.includes('--dry-run'),
});

export interface ParsedFlags {
  readonly named: Map<string, string>;
  readonly positional: readonly string[];
}

/**
 * Tiny `--flag value` / `--flag=value` parser. Boolean flags appear in
 * `named` with the literal string `'true'`. Unknown flags are returned
 * as-is — commands decide what is required.
 */
export const parseFlags = (argv: readonly string[]): ParsedFlags => {
  const named = new Map<string, string>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq > 0) {
        named.set(arg.slice(2, eq), arg.slice(eq + 1));
      } else {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) {
          named.set(arg.slice(2), 'true');
        } else {
          named.set(arg.slice(2), next);
          i += 1;
        }
      }
    } else {
      positional.push(arg);
    }
  }
  return { named, positional };
};

export const requireFlag = (flags: ParsedFlags, name: string): string => {
  const value = flags.named.get(name);
  if (typeof value !== 'string' || value.length === 0 || value === 'true') {
    throw new Error(`Missing required flag --${name}`);
  }
  return value;
};
