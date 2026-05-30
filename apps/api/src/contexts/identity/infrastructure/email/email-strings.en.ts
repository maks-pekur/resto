/**
 * EN operator-email copy. Plain text — branded HTML wrappers ship in
 * Phase 8 GNOTIF (per-tenant brand-themed templates). D-02.
 *
 * Placeholders: `{{url}}`, `{{tenantSlug}}`, `{{inviterName}}`.
 */
export const invitationSubject = 'You are invited to RestOS';

export const invitationBody =
  '{{inviterName}} has invited you to join {{tenantSlug}} on RestOS.\n\n' +
  'Click the link below to accept the invitation and set up your account:\n\n' +
  '{{url}}\n\n' +
  'If you did not expect this invitation, you can safely ignore this email.\n';

export const resetSubject = 'Reset your RestOS password';

export const resetBody =
  'A password reset was requested for your RestOS account.\n\n' +
  'Click the link below to set a new password. The link expires in 1 hour:\n\n' +
  '{{url}}\n\n' +
  'If you did not request a password reset, you can safely ignore this email.\n';

export const verificationSubject = 'Verify your RestOS email';

export const verificationBody =
  'Welcome to RestOS! Please verify your email address by clicking the link below:\n\n' +
  '{{url}}\n\n' +
  'This link expires in 24 hours.\n';
