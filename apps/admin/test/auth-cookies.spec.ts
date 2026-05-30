import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

/**
 * AUTH-08 sweep (Phase 03 / Plan 04).
 *
 * Walks every `.ts`/`.tsx` file under `apps/admin/lib/` and `apps/admin/app/`,
 * AST-parses it, locates every `cookies().set(...)` and `cookieStore.set(...)`
 * call site, and asserts each carries the triad:
 *   - httpOnly: true
 *   - secure: process.env.NODE_ENV === 'production'
 *   - sameSite: 'lax'  (or 'strict' with an inline rationale comment)
 *
 * Adding a new server action in Phase 4+ that calls cookies().set without the
 * triad must FAIL this spec at CI — that's the load-bearing property.
 *
 * Excluded:
 *   - test/**     (these specs are not shipping cookies)
 *   - components/ui/** (shadcn-managed; no server cookie calls live here)
 *   - .next/**     (generated)
 *   - node_modules/** (deps)
 *   - dist/**     (build output)
 */

const ADMIN_ROOT = join(__dirname, '..');
const SCAN_ROOTS = [join(ADMIN_ROOT, 'lib'), join(ADMIN_ROOT, 'app')];
const EXCLUDE_DIR_NAMES = new Set(['node_modules', '.next', 'dist', 'test']);
const EXCLUDE_PATH_FRAGMENTS = ['components/ui/'];

const walkSourceFiles = (root: string): readonly string[] => {
  const out: string[] = [];
  const recurse = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (EXCLUDE_DIR_NAMES.has(name)) continue;
      const full = join(dir, name);
      let s: ReturnType<typeof statSync>;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        recurse(full);
        continue;
      }
      if (!s.isFile()) continue;
      if (!/\.(ts|tsx)$/u.test(name)) continue;
      if (EXCLUDE_PATH_FRAGMENTS.some((frag) => full.includes(frag))) continue;
      out.push(full);
    }
  };
  recurse(root);
  return out;
};

interface CookieSetSite {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly callKind: 'cookies().set' | 'cookieStore.set';
  readonly argumentsCount: number;
  readonly optionsObject: ts.ObjectLiteralExpression | null;
  readonly precedingLeadingComment: string;
}

const getReceiverChain = (expr: ts.Expression): string => {
  // Collapse a property-access chain like `cookieStore.set` to a dotted string.
  // For `cookies().set` returns the literal "cookies().set" via call recognition.
  if (ts.isPropertyAccessExpression(expr)) {
    const head = expr.expression;
    if (ts.isCallExpression(head) && ts.isIdentifier(head.expression)) {
      return `${head.expression.text}().${expr.name.text}`;
    }
    if (ts.isIdentifier(head)) {
      return `${head.text}.${expr.name.text}`;
    }
    if (ts.isPropertyAccessExpression(head)) {
      return `${getReceiverChain(head)}.${expr.name.text}`;
    }
  }
  return expr.getText();
};

const isCookieSetCall = (call: ts.CallExpression): { kind: CookieSetSite['callKind'] } | null => {
  if (!ts.isPropertyAccessExpression(call.expression)) return null;
  if (call.expression.name.text !== 'set') return null;
  const chain = getReceiverChain(call.expression);
  // Match: cookies().set  OR  <identifier ending in cookieStore or cookies>.set
  if (chain === 'cookies().set') return { kind: 'cookies().set' };
  if (/(^|\.)(cookieStore|cookies)\.set$/u.test(chain)) {
    // `cookies().set` already matched above; this catches cookieStore.set and
    // any other variable named *cookies / cookieStore aliased from cookies().
    return { kind: 'cookieStore.set' };
  }
  return null;
};

const findOptionsObjectArgument = (call: ts.CallExpression): ts.ObjectLiteralExpression | null => {
  // The Next.js `cookies().set` overloads we care about:
  //   set(name, value, options)
  //   set({ name, value, ...options })
  // We treat the LAST argument as the options object when it is an
  // ObjectLiteralExpression — that covers both shapes.
  if (call.arguments.length === 0) return null;
  const last = call.arguments[call.arguments.length - 1];
  if (last && ts.isObjectLiteralExpression(last)) return last;
  return null;
};

const getProperty = (
  obj: ts.ObjectLiteralExpression,
  name: string,
): ts.PropertyAssignment | null => {
  for (const prop of obj.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ((ts.isIdentifier(prop.name) && prop.name.text === name) ||
        (ts.isStringLiteral(prop.name) && prop.name.text === name))
    ) {
      return prop;
    }
  }
  return null;
};

const hasSpreadAssignment = (obj: ts.ObjectLiteralExpression): boolean =>
  obj.properties.some((p) => ts.isSpreadAssignment(p));

const evaluateLiteralOrEnvSecure = (init: ts.Expression): boolean => {
  // Accept either:
  //   secure: true
  //   secure: process.env.NODE_ENV === 'production'
  if (init.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (
    ts.isBinaryExpression(init) &&
    init.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
  ) {
    const left = init.left;
    const right = init.right;
    const isProdLiteral = (e: ts.Expression): boolean =>
      ts.isStringLiteral(e) && e.text === 'production';
    const isNodeEnv = (e: ts.Expression): boolean =>
      ts.isPropertyAccessExpression(e) &&
      ts.isPropertyAccessExpression(e.expression) &&
      ts.isIdentifier(e.expression.expression) &&
      e.expression.expression.text === 'process' &&
      e.expression.name.text === 'env' &&
      e.name.text === 'NODE_ENV';
    if (isNodeEnv(left) && isProdLiteral(right)) return true;
    if (isNodeEnv(right) && isProdLiteral(left)) return true;
  }
  return false;
};

const getStringInit = (init: ts.Expression): string | null =>
  ts.isStringLiteral(init) ? init.text : null;

const collectCookieSetSites = (file: string): readonly CookieSetSite[] => {
  const source = readFileSync(file, 'utf8');
  // ScriptKind matters: in `.ts` files, TSX parsing treats `<T>` in arrow-fn
  // generics as the start of a JSX element and silently drops downstream
  // CallExpression nodes (e.g. `cookieStore.set(...)` after `apiFetch<T>`).
  const scriptKind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, scriptKind);
  const sites: CookieSetSite[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const kind = isCookieSetCall(node);
      if (kind) {
        const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        const leadingRanges = ts.getLeadingCommentRanges(source, node.pos) ?? [];
        const precedingLeadingComment = leadingRanges
          .map((r) => source.slice(r.pos, r.end))
          .join('\n');
        sites.push({
          file,
          line: line + 1,
          column: character + 1,
          callKind: kind.kind,
          argumentsCount: node.arguments.length,
          optionsObject: findOptionsObjectArgument(node),
          precedingLeadingComment,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return sites;
};

const allSites = SCAN_ROOTS.flatMap((root) => walkSourceFiles(root)).flatMap((file) =>
  collectCookieSetSites(file),
);

describe('AUTH-08 cookie sweep — every cookies().set carries httpOnly + secure + sameSite', () => {
  it('discovers at least the four canonical Phase 03 cookie sites', () => {
    const expectedSites = [
      'lib/actions/set-active-brand.ts',
      'lib/actions/create-brand.ts',
      'lib/api-server.ts',
    ];
    const found = allSites.map((s) => relative(ADMIN_ROOT, s.file));
    for (const expected of expectedSites) {
      expect(found, `expected to find a cookies/cookieStore.set call in ${expected}`).toContain(
        expected,
      );
    }
  });

  it.each(allSites)(
    'site $file:$line ($callKind) passes the triad',
    ({ file, line, optionsObject, argumentsCount, precedingLeadingComment }) => {
      const rel = relative(ADMIN_ROOT, file);
      const here = `${rel}:${line.toString()}`;

      // An exemption tag in the leading comment opts a site out of the
      // sweep — used for the trusted-upstream BA cookie forwarding site
      // where attributes come from a normalized helper instead of an
      // inline object literal. The exemption tag must include the rule
      // ID and a one-line rationale.
      if (precedingLeadingComment.includes('AUTH-08-EXEMPT')) {
        expect(precedingLeadingComment, `${here} exemption must cite a rationale`).toMatch(
          /AUTH-08-EXEMPT:/u,
        );
        return;
      }

      // Strict shape: last argument is an object literal.
      expect(
        argumentsCount,
        `${here} cookies set call must have at least 2 arguments (name+options) or 1 object argument`,
      ).toBeGreaterThan(0);
      expect(
        optionsObject,
        `${here} last argument must be an object literal carrying { httpOnly, secure, sameSite }`,
      ).not.toBeNull();
      if (!optionsObject) return;

      // If the literal spreads from another expression, the triad cannot
      // be statically verified — force the author to either inline the
      // attributes or use the AUTH-08-EXEMPT tag.
      expect(
        hasSpreadAssignment(optionsObject),
        `${here} options literal must NOT spread (...x); inline { httpOnly, secure, sameSite } or use // AUTH-08-EXEMPT: <reason>`,
      ).toBe(false);

      const httpOnly = getProperty(optionsObject, 'httpOnly');
      expect(httpOnly, `${here} missing { httpOnly: true }`).not.toBeNull();
      expect(httpOnly?.initializer.kind, `${here} httpOnly must be the literal \`true\``).toBe(
        ts.SyntaxKind.TrueKeyword,
      );

      const secure = getProperty(optionsObject, 'secure');
      expect(
        secure,
        `${here} missing { secure: process.env.NODE_ENV === 'production' }`,
      ).not.toBeNull();
      if (secure) {
        expect(
          evaluateLiteralOrEnvSecure(secure.initializer),
          `${here} secure must be \`true\` or \`process.env.NODE_ENV === 'production'\``,
        ).toBe(true);
      }

      const sameSite = getProperty(optionsObject, 'sameSite');
      expect(sameSite, `${here} missing { sameSite: 'lax' }`).not.toBeNull();
      if (sameSite) {
        const v = getStringInit(sameSite.initializer);
        if (v === 'strict') {
          // CSRF-hardened exception requires inline rationale on the
          // property (or the immediately preceding comment) referencing
          // AUTH-08-STRICT.
          const tag = precedingLeadingComment.includes('AUTH-08-STRICT');
          expect(
            tag,
            `${here} sameSite:'strict' must carry an // AUTH-08-STRICT: <reason> rationale comment on the call site`,
          ).toBe(true);
        } else {
          expect(
            v,
            `${here} sameSite must be 'lax' (or 'strict' with AUTH-08-STRICT rationale)`,
          ).toBe('lax');
        }
      }
    },
  );
});
