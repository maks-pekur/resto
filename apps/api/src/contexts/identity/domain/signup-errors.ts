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
