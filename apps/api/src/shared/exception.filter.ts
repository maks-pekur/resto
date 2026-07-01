import type { ServerResponse } from 'node:http';
import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { getCorrelationId } from '@resto/events';
import type { FastifyReply, FastifyRequest } from 'fastify';

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance: string;
  code?: string;
  correlationId?: string;
  traceId?: string;
}

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Global exception filter — converts every thrown error into an
 * RFC 7807 `application/problem+json` response. Adds the active
 * correlation id and trace id so logs, traces, and the client all
 * share the same identifiers.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<FastifyReply>();
    const req = ctx.getRequest<FastifyRequest>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal Server Error';
    let detail: string | undefined;
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      title = exception.message;
      const body = exception.getResponse();
      if (typeof body === 'object') {
        if ('detail' in body && typeof body.detail === 'string') {
          // Explicit RFC 7807 `detail` wins — lets callers separate the
          // human-readable description from the exception's `.message`
          // (which becomes `title`). Used by the rate-limit guard to
          // surface "retry in N seconds" without overwriting the
          // status-name title.
          detail = body.detail;
        } else if ('message' in body) {
          const messageField: unknown = body.message;
          if (typeof messageField === 'string') {
            detail = messageField;
          } else if (Array.isArray(messageField)) {
            detail = messageField.join('; ');
          }
        }
        if ('code' in body && typeof body.code === 'string') {
          code = body.code;
        }
      }
    } else if (exception instanceof Error) {
      detail = exception.message;
    }

    const traceId = trace.getActiveSpan()?.spanContext().traceId;

    const isServerError = status >= HttpStatus.INTERNAL_SERVER_ERROR;
    if (isServerError) {
      title = 'Internal Server Error';
    }

    // Stable `type` URI: prefer the explicit error code (e.g.
    // `auth.tenant_mismatch`) when callers provide it; fall back to the
    // slugified title for legacy and stdlib exceptions. Clients branch
    // on the URI suffix.
    const problem: ProblemDetails = {
      type: `https://resto.app/problems/${code ?? slugify(title)}`,
      title,
      status,
      instance: req.url,
    };

    // Redact `detail` for 5xx (RES-175). Drizzle/Postgres errors include
    // constraint names, table names, and sometimes parameter values —
    // shipping that to the client leaks schema details and PII. The
    // original detail still lands in the log line below, correlated by
    // `correlationId` and `traceId` so on-call can pivot.
    if (detail !== undefined) {
      problem.detail = isServerError
        ? 'Internal server error — see correlationId in logs.'
        : detail;
    }
    // `code` is the stable machine-readable error identifier (e.g.
    // `tenancy.tenant_suspended`); clients branch on it rather than the
    // human-readable `title`. The filter already uses it for the `type`
    // URI; surfacing it as its own field keeps callers from having to
    // parse the URI suffix.
    if (code !== undefined) problem.code = code;
    const correlationId = getCorrelationId();
    if (correlationId !== undefined) problem.correlationId = correlationId;
    if (traceId !== undefined) problem.traceId = traceId;

    if (isServerError) {
      this.logger.error({ err: exception, problem, originalDetail: detail }, 'Request failed');
    } else {
      this.logger.warn({ problem }, 'Request rejected');
    }

    sendProblem(res, status, problem);
  }
}

/**
 * Write the problem-details response. NestJS's exception-filter contract
 * does not guarantee whether `getResponse()` returns the framework
 * (FastifyReply) wrapper or the raw Node response — landing on the raw
 * response is portable and avoids relying on adapter internals.
 */
const CORS_RESPONSE_HEADERS = [
  'access-control-allow-origin',
  'access-control-allow-credentials',
  'access-control-expose-headers',
  'vary',
] as const;

const sendProblem = (
  res: FastifyReply | ServerResponse,
  status: number,
  problem: unknown,
): void => {
  const raw: ServerResponse = 'raw' in res ? res.raw : res;
  // raw.end() bypasses Fastify's onSend hook, where @fastify/cors writes the
  // CORS headers — mirror them so error responses stay readable cross-origin.
  if ('raw' in res) {
    for (const name of CORS_RESPONSE_HEADERS) {
      const value = res.getHeader(name);
      if (value !== undefined && !raw.hasHeader(name)) {
        raw.setHeader(name, value);
      }
    }
  }
  raw.statusCode = status;
  raw.setHeader('content-type', 'application/problem+json');
  raw.end(JSON.stringify(problem));
};
