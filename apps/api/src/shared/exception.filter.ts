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

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      title = exception.message;
      const body = exception.getResponse();
      if (typeof body === 'object' && 'message' in body) {
        const messageField: unknown = body.message;
        if (typeof messageField === 'string') {
          detail = messageField;
        } else if (Array.isArray(messageField)) {
          detail = messageField.join('; ');
        }
      }
    } else if (exception instanceof Error) {
      detail = exception.message;
    }

    const traceId = trace.getActiveSpan()?.spanContext().traceId;
    const problem: ProblemDetails = {
      type: `https://resto.app/problems/${slugify(title)}`,
      title,
      status,
      instance: req.url,
    };
    if (detail !== undefined) problem.detail = detail;
    const correlationId = getCorrelationId();
    if (correlationId !== undefined) problem.correlationId = correlationId;
    if (traceId !== undefined) problem.traceId = traceId;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({ err: exception, problem }, 'Request failed');
    } else {
      this.logger.warn({ problem }, 'Request rejected');
    }

    void res.status(status).type('application/problem+json').send(problem);
  }
}
