/**
 * RU operator-email copy. Plain text — branded HTML wrappers ship in
 * Phase 8 GNOTIF (per-tenant brand-themed templates). D-02.
 *
 * Placeholders: `{{url}}`, `{{tenantSlug}}`, `{{inviterName}}`.
 */
export const invitationSubject = 'Приглашение в RestOS';

export const invitationBody =
  '{{inviterName}} приглашает вас присоединиться к {{tenantSlug}} в RestOS.\n\n' +
  'Перейдите по ссылке ниже, чтобы принять приглашение и настроить учётную запись:\n\n' +
  '{{url}}\n\n' +
  'Если вы не ожидали это приглашение — просто проигнорируйте письмо.\n';

export const resetSubject = 'Сброс пароля в RestOS';

export const resetBody =
  'Поступил запрос на сброс пароля для вашей учётной записи RestOS.\n\n' +
  'Перейдите по ссылке ниже, чтобы задать новый пароль. Ссылка действует 1 час:\n\n' +
  '{{url}}\n\n' +
  'Если вы не запрашивали сброс пароля — просто проигнорируйте письмо.\n';

export const verificationSubject = 'Подтвердите email в RestOS';

export const verificationBody =
  'Добро пожаловать в RestOS! Подтвердите ваш email, перейдя по ссылке ниже:\n\n' +
  '{{url}}\n\n' +
  'Ссылка действует 24 часа.\n';
