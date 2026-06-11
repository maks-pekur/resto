// AUTH-09 D-16 REINTERPRETED 2026-05-30 (plan-checker B-4): the BA
// `organization_role` table is BA's DYNAMIC tenant-creatable role storage,
// NOT static preset storage. Static presets (owner / admin / staff) live
// in `apps/api/src/contexts/identity/infrastructure/better-auth/access-
// control.ts:6-9` and are wired at BA init via the organization() plugin's
// `roles` param at `auth.config.ts:148-153`. This function is the drift
// guard that ensures the in-code presets continue to match SYSTEM_ROLES
// on every boot — analogous to assertProdGuardrails / assertNoRlsBypass.
//
// Wired in `main.ts` AFTER the EMAIL_ADAPTER_PORT factory has constructed
// the BA instance (via app.get(AUTH_TOKEN)) and BEFORE app.listen() so a
// drift surfaces during boot, not at first request.
import { SYSTEM_ROLES, type SystemRoleSlug } from '@resto/domain';
import {
  adminRole,
  ownerRole,
  staffRole,
} from '../contexts/identity/infrastructure/better-auth/access-control';

type ActionSet = readonly string[];
type Statement = Record<string, ActionSet | undefined>;

/**
 * Roles registered with BA at construction time. Keyed by the same slugs
 * that BA receives via `organization({ roles: { ... } })`. Each role's
 * `.statements` is the source of truth fed into BA — equivalence with
 * `SYSTEM_ROLES` is exactly what the drift guard asserts.
 */
const REGISTERED_ROLES: Record<SystemRoleSlug, { readonly statements: Statement }> = {
  owner: ownerRole,
  admin: adminRole,
  staff: staffRole,
};

export class SystemRoleDriftError extends Error {
  constructor(
    public readonly diff: readonly string[],
    public readonly expected: typeof SYSTEM_ROLES,
    public readonly actual: Record<string, Statement>,
  ) {
    super(
      `system-roles-drift: refusing to start: ${diff.join('; ')}. ` +
        'The BA accessControl map has drifted from packages/domain/src/rbac/system-roles.ts. ' +
        'Reconcile access-control.ts and SYSTEM_ROLES and redeploy.',
    );
    this.name = 'SystemRoleDriftError';
  }
}

const sortedKeys = (obj: Record<string, unknown>): string[] => Object.keys(obj).sort();

const sortedActionSet = (actions: ActionSet | undefined): readonly string[] =>
  actions ? [...actions].sort() : [];

const statementsEqual = (
  expected: Statement,
  actual: Statement,
): { equal: boolean; diff: string[] } => {
  const expKeys = sortedKeys(expected);
  const actKeys = sortedKeys(actual);
  const diff: string[] = [];
  if (expKeys.join(',') !== actKeys.join(',')) {
    diff.push(
      `resource-key mismatch (expected ${JSON.stringify(expKeys)}, actual ${JSON.stringify(actKeys)})`,
    );
  }
  // Resource-level deep equality on the action arrays (sorted, no dupes).
  const allKeys = Array.from(new Set([...expKeys, ...actKeys])).sort();
  for (const key of allKeys) {
    const expActions = sortedActionSet(expected[key]);
    const actActions = sortedActionSet(actual[key]);
    if (expActions.join(',') !== actActions.join(',')) {
      diff.push(
        `${key}: expected ${JSON.stringify(expActions)}, actual ${JSON.stringify(actActions)}`,
      );
    }
  }
  return { equal: diff.length === 0, diff };
};

/**
 * Drift guard: assert the in-memory accessControl roles fed to BA match
 * SYSTEM_ROLES exactly. Throws SystemRoleDriftError listing the diff on
 * mismatch — mirrors assertProdGuardrails behavior (synchronous, fail-fast).
 *
 * Reads the role registrations directly from `access-control.ts` (the same
 * surface fed to BA at construction time) rather than introspecting the
 * built `auth` instance, because BA does not expose a stable typed surface
 * for the registered role map and the access-control module IS the source
 * of truth that BA receives.
 */
export const assertSystemRolesPresent = (): void => {
  const expectedSlugs = sortedKeys(SYSTEM_ROLES);
  const actualSlugs = sortedKeys(REGISTERED_ROLES);
  const allDiffs: string[] = [];
  const actualSnapshot: Record<string, Statement> = {};

  if (expectedSlugs.join(',') !== actualSlugs.join(',')) {
    allDiffs.push(
      `role-key mismatch (expected ${JSON.stringify(expectedSlugs)}, actual ${JSON.stringify(actualSlugs)})`,
    );
  }

  for (const slug of expectedSlugs as SystemRoleSlug[]) {
    const expected = SYSTEM_ROLES[slug] as Statement;
    const registered = REGISTERED_ROLES[slug];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- REGISTERED_ROLES is typed complete, but a dropped BA registration is a real boot-time failure mode; this guard protects the registered.statements access below
    if (!registered) {
      allDiffs.push(`${slug}: not registered with BA`);
      continue;
    }
    actualSnapshot[slug] = registered.statements;
    const { equal, diff } = statementsEqual(expected, registered.statements);
    if (!equal) {
      for (const d of diff) allDiffs.push(`${slug}.${d}`);
    }
  }

  // Catch extras: any registered role slug NOT in SYSTEM_ROLES is also drift.
  for (const slug of actualSlugs) {
    if (!(slug in SYSTEM_ROLES)) {
      allDiffs.push(`${slug}: registered with BA but not in SYSTEM_ROLES`);
      const extra = (REGISTERED_ROLES as Record<string, { statements: Statement } | undefined>)[
        slug
      ];
      if (extra) actualSnapshot[slug] = extra.statements;
    }
  }

  if (allDiffs.length > 0) {
    throw new SystemRoleDriftError(allDiffs, SYSTEM_ROLES, actualSnapshot);
  }
};
