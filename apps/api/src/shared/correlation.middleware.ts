import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { withCorrelationId } from '@resto/events';
import type { FastifyReply, FastifyRequest } from 'fastify';

const HEADER = 'x-correlation-id';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read the inbound `X-Correlation-Id` header (or generate a new id),
 * echo it on the response so callers can stitch logs, and bind it to
 * `AsyncLocalStorage` for the duration of the request — bounded
 * contexts and event publishers read it from there without threading it
 * through every signature.
 */
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: FastifyRequest['raw'], res: FastifyReply['raw'], next: () => void): void {
    const incoming = req.headers[HEADER];
    const candidate = typeof incoming === 'string' ? incoming : undefined;
    const correlationId = candidate && UUID_PATTERN.test(candidate) ? candidate : randomUUID();
    res.setHeader(HEADER, correlationId);
    withCorrelationId(correlationId, () => {
      next();
    });
  }
}
