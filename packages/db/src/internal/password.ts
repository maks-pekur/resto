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
 * SQL comment sequences are character-pairs whose individual characters
 * (`-`, `*`, `/`) are otherwise allowed in passwords (hyphen and the
 * shell-glob set are common in operator-generated secrets). We reject
 * the *sequences* explicitly so a future caller who interpolates the
 * password into raw SQL cannot smuggle a comment.
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
