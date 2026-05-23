/**
 * Whitelist regex for role-provisioning passwords (RES-245).
 *
 * Allowed characters: ASCII alphanumerics + `!@#$%^&*()_+-=`.
 * Length: 16-128 chars.
 *
 * Why a whitelist at all: Postgres DDL (`CREATE/ALTER ROLE PASSWORD`)
 * does NOT support bind parameters — the password MUST be embedded as
 * a string literal in the SQL we send. The whitelist exists so that
 * literal quoting is provably safe: with no single quote, no
 * backslash, and no escape sequence in the value, wrapping it in
 * `'...'` cannot terminate the literal early or smuggle a statement.
 *
 * Excluded characters that would otherwise enable SQL/shell injection:
 * newline, CR, null byte, single-quote, backslash, `--`, `/*`,
 * semicolon, whitespace, non-ASCII.
 */
const ROLE_PASSWORD_RE = /^[A-Za-z0-9!@#$%^&*()_+\-=]{16,128}$/;

/**
 * Defense-in-depth substring rejections.
 *
 * `--` is meaningful: `-` is whitelisted (matches `[!@#$%^&*()_+\-=]`), so
 * `--ALTER` would pass the character-class regex. Reject the SQL line-comment
 * sequence explicitly.
 *
 * `/*` is belt-and-suspenders: `/` is NOT whitelisted, so the regex already
 * rejects any password containing `/`. The substring check stays so a future
 * whitelist relaxation (e.g. someone adding `/` to the allowed set) does not
 * silently re-open the block-comment injection vector.
 */
const FORBIDDEN_SUBSTRINGS = ['--', '/*'] as const;

const buildError = (purpose: string, length: number): Error =>
  new Error(
    `${purpose}: password must match /^[A-Za-z0-9!@#$%^&*()_+\\-=]{16,128}$/ ` +
      `and contain no '--' or '/*'. ` +
      `Whitelist excludes newline, CR, null byte, single-quote, backslash, ` +
      `'--', '/*', semicolons, whitespace, and other SQL-injection vectors. ` +
      `Got length=${length.toString()} (sanitised; raw value not logged).`,
  );

export const validateRolePassword = (purpose: string, pwd: string): void => {
  if (!ROLE_PASSWORD_RE.test(pwd)) {
    throw buildError(purpose, pwd.length);
  }
  for (const seq of FORBIDDEN_SUBSTRINGS) {
    if (pwd.includes(seq)) {
      throw buildError(purpose, pwd.length);
    }
  }
};
