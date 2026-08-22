export class SlugUnavailableError extends Error {
  constructor(public readonly base: string) {
    super(`Slug "${base}" and 99 numeric suffixes are all taken; pick a different display name.`);
    this.name = 'SlugUnavailableError';
  }
}

export class SignupEmailAlreadyExistsError extends Error {
  constructor(public readonly email: string) {
    super(`A user with email "${email}" already exists.`);
    this.name = 'SignupEmailAlreadyExistsError';
  }
}

export class SignupBetterAuthFailureError extends Error {
  constructor(
    public readonly stage: 'signUpEmail' | 'signInEmail' | 'addMember',
    public override readonly cause: unknown,
  ) {
    super(`Better Auth call failed at stage "${stage}".`);
    this.name = 'SignupBetterAuthFailureError';
  }
}

/**
 * D-30/D-31 (10.2 plan 13): the caller's tenant is not (or no longer)
 * `'pending_setup'` — either onboarding already ran once (idempotent-safe
 * per the plan's interface contract, not a surfaced error state) or the
 * tenant id resolved from the session could not be found at all.
 */
export class TenantSetupNotPendingError extends Error {
  constructor(public readonly tenantId: string) {
    super(`Tenant "${tenantId}" is not pending setup.`);
    this.name = 'TenantSetupNotPendingError';
  }
}
