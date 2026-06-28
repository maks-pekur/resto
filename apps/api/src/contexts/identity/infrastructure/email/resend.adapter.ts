import { Logger } from '@nestjs/common';
import { type TenantAwareDb } from '@resto/db';
import { appendToOutbox, buildEnvelope, IdentityEmailDispatchFailedV1 } from '@resto/events';
import type { Resend } from 'resend';
import type { TenantId } from '@resto/domain';
import type { Env } from '../../../../config/env.schema';
import type {
  EmailAdapterPort,
  SendGuestNotificationInput,
  SendInvitationInput,
  SendResetPasswordInput,
  SendVerificationInput,
} from '../../domain/ports';
import { renderGuestEmail } from '../../../../contexts/notifications/infrastructure/guest-email-templates';
import {
  invitationBody as invitationBodyEn,
  invitationSubject as invitationSubjectEn,
  resetBody as resetBodyEn,
  resetSubject as resetSubjectEn,
  verificationBody as verificationBodyEn,
  verificationSubject as verificationSubjectEn,
} from './email-strings.en';
import {
  invitationBody as invitationBodyRu,
  invitationSubject as invitationSubjectRu,
  resetBody as resetBodyRu,
  resetSubject as resetSubjectRu,
  verificationBody as verificationBodyRu,
  verificationSubject as verificationSubjectRu,
} from './email-strings.ru';

interface EmailLocaleStrings {
  readonly invitationSubject: string;
  readonly invitationBody: string;
  readonly resetSubject: string;
  readonly resetBody: string;
  readonly verificationSubject: string;
  readonly verificationBody: string;
}

const STRINGS: Record<'en' | 'ru', EmailLocaleStrings> = {
  en: {
    invitationSubject: invitationSubjectEn,
    invitationBody: invitationBodyEn,
    resetSubject: resetSubjectEn,
    resetBody: resetBodyEn,
    verificationSubject: verificationSubjectEn,
    verificationBody: verificationBodyEn,
  },
  ru: {
    invitationSubject: invitationSubjectRu,
    invitationBody: invitationBodyRu,
    resetSubject: resetSubjectRu,
    resetBody: resetBodyRu,
    verificationSubject: verificationSubjectRu,
    verificationBody: verificationBodyRu,
  },
};

const fill = (template: string, vars: Record<string, string>): string =>
  template.replace(/\{\{(\w+)\}\}/gu, (_, key: string) => vars[key] ?? '');

/** D-05 retry budget: [immediate, +250ms, +1000ms, +4000ms] — total < 6s. */
const RETRY_DELAYS_MS = [0, 250, 1000, 4000] as const;
const SEND_TIMEOUT_MS = 5500;
const MAX_ERROR_MESSAGE_LENGTH = 2048;

const FlowKind = {
  invitation: 'invitation',
  reset_password: 'password_reset',
  verification: 'verification',
  guest_notification: 'guest_notification',
} as const;
type FlowKindKey = keyof typeof FlowKind;
type FlowSubjectName = (typeof FlowKind)[FlowKindKey];

interface SendCommand {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string | undefined;
  readonly idempotencyKey: string;
  readonly tenantId: TenantId | undefined;
  readonly userId: string | undefined;
  readonly flowName: FlowSubjectName;
}

/** Captures the minimal Resend SDK surface this adapter touches. */
export interface ResendClientLike {
  readonly emails: {
    send(
      payload: {
        from: string;
        to: string;
        replyTo: string;
        subject: string;
        text: string;
        html?: string | undefined;
      },
      options?: { idempotencyKey: string },
    ): Promise<ResendSendResult>;
  };
  readonly domains: {
    list(): Promise<ResendDomainsResult>;
  };
}

/**
 * Discriminated union — explicit shape (not inferred from a heterogeneous
 * array) per the prior-agent stall-trigger note: the previous executor
 * burned its watchdog budget trying to coax TypeScript into accepting a
 * union inferred from `[okResponse, errResponse]`. Spell the union out
 * here so mock helpers in tests have a stable target type.
 */
export type ResendSendResult =
  | { readonly data: { readonly id: string }; readonly error: null }
  | {
      readonly data: null;
      readonly error: { readonly message: string; readonly statusCode: number | null };
    };

export type ResendDomainsResult =
  | { readonly data: unknown; readonly error: null }
  | {
      readonly data: null;
      readonly error: { readonly message: string; readonly statusCode: number | null };
    };

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const jitter = (): number => Math.floor(Math.random() * 100);

const isRetryable = (statusCode: number | null | undefined): boolean => {
  if (statusCode === null || statusCode === undefined) return true;
  if (statusCode >= 500 && statusCode <= 599) return true;
  return false;
};

const truncate = (s: string): string =>
  s.length <= MAX_ERROR_MESSAGE_LENGTH ? s : s.slice(0, MAX_ERROR_MESSAGE_LENGTH);

/**
 * `NODE_ENV ∈ {staging, production}` adapter. Wraps the Resend Node SDK
 * with the D-05 retry+emit contract:
 *
 * - Up to 4 attempts on transient 5xx / network errors. Total wall-clock
 *   budget < 6s (0 + 250 + 1000 + 4000ms + jitter).
 * - 4xx (including 429 rate-limit) treated as terminal — WARN log per
 *   Claude's-Discretion-item-5; no retry.
 * - On terminal failure: emit `identity.email_dispatch_failed.v1`
 *   envelope (reason='resend_terminal_failure') via the transactional
 *   outbox (`db.withTenantId(tenantId, ...)` when tenantId is known,
 *   `db.withoutTenant(...)` for the BA pre-org-bind verification path).
 *   Then rethrow so BA logs the failure and the original test signal
 *   propagates.
 *
 * D-15: `verifyTransport()` calls `domains.list()` — surfaces "invalid
 * RESEND_API_KEY" loudly at boot before BA mounts.
 *
 * D-17: never calls `runInTenantContext`. Tenant binding is explicit
 * via `db.withTenantId` per ADR-0020 I-6.
 */
export class ResendEmailAdapter implements EmailAdapterPort {
  readonly adapterName = 'resend' as const;

  readonly #client: ResendClientLike;
  readonly #db: TenantAwareDb;
  readonly #from: string;
  readonly #replyTo: string;
  readonly #logger: Logger;

  constructor(
    client: ResendClientLike,
    env: Pick<Env, 'RESEND_FROM' | 'RESEND_REPLY_TO'>,
    db: TenantAwareDb,
    logger?: Logger,
  ) {
    this.#client = client;
    this.#db = db;
    this.#from = env.RESEND_FROM;
    this.#replyTo = env.RESEND_REPLY_TO;
    this.#logger = logger ?? new Logger('ResendEmailAdapter');
  }

  async sendInvitation(input: SendInvitationInput): Promise<void> {
    const strings = STRINGS[input.locale];
    const text = fill(strings.invitationBody, {
      url: input.url,
      tenantSlug: input.tenantSlug,
      inviterName: input.inviterName,
    });
    await this.#sendWithRetry({
      to: input.to,
      subject: strings.invitationSubject,
      text,
      idempotencyKey: `invitation:${input.tenantId}:${input.to}`,
      tenantId: input.tenantId,
      userId: undefined,
      flowName: FlowKind.invitation,
    });
  }

  async sendResetPassword(input: SendResetPasswordInput): Promise<void> {
    const strings = STRINGS[input.locale];
    const text = fill(strings.resetBody, { url: input.url });
    await this.#sendWithRetry({
      to: input.to,
      subject: strings.resetSubject,
      text,
      idempotencyKey: `reset:${input.userId}`,
      tenantId: input.tenantId,
      userId: input.userId,
      flowName: FlowKind.reset_password,
    });
  }

  async sendVerification(input: SendVerificationInput): Promise<void> {
    const strings = STRINGS[input.locale];
    const text = fill(strings.verificationBody, { url: input.url });
    await this.#sendWithRetry({
      to: input.to,
      subject: strings.verificationSubject,
      text,
      idempotencyKey: `verification:${input.userId}`,
      tenantId: input.tenantId,
      userId: input.userId,
      flowName: FlowKind.verification,
    });
  }

  async sendGuestNotification(input: SendGuestNotificationInput): Promise<void> {
    const rendered = renderGuestEmail(
      input.kind,
      input.locale,
      input.brandTheme,
      input.brandName,
      input.vars,
    );
    await this.#sendWithRetry({
      to: input.to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      idempotencyKey: input.idempotencyKey,
      tenantId: input.tenantId,
      userId: undefined,
      flowName: FlowKind.guest_notification,
    });
  }

  async verifyTransport(): Promise<void> {
    let result: ResendDomainsResult;
    try {
      result = await this.#client.domains.list();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Resend verifyTransport failed (network): ${message}`, { cause: err });
    }
    if (result.error !== null) {
      throw new Error(
        `Resend verifyTransport failed: ${result.error.message} (status ${String(result.error.statusCode)})`,
      );
    }
    // Skeptic MED-10 visibility: log tier on successful ping. Researcher A3
    // is ASSUMED 100/day + 3000/month — operator confirmation captured in
    // 03-02-SUMMARY.md.
    this.#logger.log(
      { adapterName: this.adapterName, tier: 'free', dailyLimit: 100, monthlyLimit: 3000 },
      'Resend tier: free (100/day, 3000/month) — confirm at https://resend.com/pricing',
    );
  }

  async #sendWithRetry(cmd: SendCommand): Promise<void> {
    let lastError: { message: string; statusCode: number | null } | null = null;
    let lastNetworkError: Error | null = null;

    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
      const delay = RETRY_DELAYS_MS[attempt] ?? 0;
      if (delay > 0) await sleep(delay + jitter());

      let result: ResendSendResult;
      // WR-11: timer-clearing race. Previously `#abortAfter` kept the sleep
      // timer scheduled even after `send` resolved, stacking up to 4 live
      // timers across retries and turning into an unhandled rejection at
      // process shutdown. Clear the timer in `finally` so node releases it
      // as soon as either branch wins.
      let timeoutId: NodeJS.Timeout | undefined;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`Resend send timed out after ${String(SEND_TIMEOUT_MS)}ms`));
          }, SEND_TIMEOUT_MS);
        });
        try {
          result = await Promise.race([
            this.#client.emails.send(
              {
                from: this.#from,
                to: cmd.to,
                replyTo: this.#replyTo,
                subject: cmd.subject,
                text: cmd.text,
                ...(cmd.html !== undefined ? { html: cmd.html } : {}),
              },
              { idempotencyKey: cmd.idempotencyKey },
            ),
            timeoutPromise,
          ]);
        } finally {
          if (timeoutId !== undefined) clearTimeout(timeoutId);
        }
      } catch (err) {
        lastNetworkError = err instanceof Error ? err : new Error(String(err));
        this.#logger.warn(
          {
            adapterName: this.adapterName,
            to: cmd.to,
            flow: cmd.flowName,
            attempt: attempt + 1,
            err: lastNetworkError.message,
          },
          'Resend send threw network error — retryable',
        );
        if (attempt === RETRY_DELAYS_MS.length - 1) {
          await this.#emitTerminalFailure(cmd, lastNetworkError.message);
          throw lastNetworkError;
        }
        continue;
      }

      if (result.error === null) {
        this.#logger.log(
          {
            adapterName: this.adapterName,
            to: cmd.to,
            flow: cmd.flowName,
            attempt: attempt + 1,
            id: result.data.id,
          },
          'Resend send succeeded',
        );
        return;
      }

      lastError = result.error;

      // 429 = rate limit; Claude's-Discretion-item-5 visibility recommendation.
      if (result.error.statusCode === 429) {
        this.#logger.warn(
          {
            adapterName: this.adapterName,
            to: cmd.to,
            flow: cmd.flowName,
            statusCode: 429,
            err: result.error.message,
          },
          'Resend rate-limit hit (429) — treating as terminal (no retry); check tier and rotation policy',
        );
      }

      if (!isRetryable(result.error.statusCode)) {
        await this.#emitTerminalFailure(cmd, result.error.message);
        throw new Error(
          `Resend send failed (terminal ${String(result.error.statusCode)}): ${result.error.message}`,
        );
      }

      this.#logger.warn(
        {
          adapterName: this.adapterName,
          to: cmd.to,
          flow: cmd.flowName,
          attempt: attempt + 1,
          statusCode: result.error.statusCode,
          err: result.error.message,
        },
        'Resend send 5xx — retrying',
      );

      if (attempt === RETRY_DELAYS_MS.length - 1) {
        await this.#emitTerminalFailure(cmd, result.error.message);
        throw new Error(
          `Resend send exhausted retries (last status ${String(result.error.statusCode)}): ${result.error.message}`,
        );
      }
    }

    const fallback =
      lastError?.message ?? lastNetworkError?.message ?? 'Resend send failed (no error captured)';
    await this.#emitTerminalFailure(cmd, fallback);
    throw new Error(fallback);
  }

  async #emitTerminalFailure(cmd: SendCommand, errorMessage: string): Promise<void> {
    try {
      const envelope = buildEnvelope(
        IdentityEmailDispatchFailedV1,
        {
          reason: 'resend_terminal_failure',
          originalSubject: cmd.flowName,
          errorMessage: truncate(errorMessage),
          ...(cmd.userId ? { userId: cmd.userId } : {}),
          ...(cmd.tenantId ? { tenantId: cmd.tenantId } : {}),
        },
        cmd.tenantId ? { tenantId: cmd.tenantId } : { tenantId: null },
      );
      if (cmd.tenantId) {
        await this.#db.withTenantId(cmd.tenantId, async (tx) => {
          await appendToOutbox(tx, { envelope });
        });
      } else {
        await this.#db.withoutTenant(
          'email dispatch failure — no tenant context (BA pre-org-bind path)',
          async (tx) => {
            await appendToOutbox(tx, { envelope });
          },
        );
      }
    } catch (auditErr) {
      this.#logger.error(
        {
          adapterName: this.adapterName,
          to: cmd.to,
          flow: cmd.flowName,
          err: auditErr instanceof Error ? auditErr.message : String(auditErr),
        },
        'Failed to emit identity.email_dispatch_failed.v1 — audit row missing for this failure',
      );
    }
  }
}

/**
 * Factory wrapper — instantiates the real Resend SDK and adapts it to the
 * `ResendClientLike` shape. Tests use `ResendEmailAdapter` directly with
 * a mock client to avoid hitting the network.
 */
export const createResendClientAdapter = (
  resend: Resend,
  env: Pick<Env, 'RESEND_FROM' | 'RESEND_REPLY_TO'>,
  db: TenantAwareDb,
  logger?: Logger,
): ResendEmailAdapter => {
  const client: ResendClientLike = {
    emails: {
      send: (payload, options) =>
        resend.emails.send(payload as Parameters<typeof resend.emails.send>[0], options),
    },
    domains: {
      list: () => resend.domains.list(),
    },
  };
  return new ResendEmailAdapter(client, env, db, logger);
};
