import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Auth } from '../../infrastructure/better-auth/auth.config';

export type RateLimitHandler = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

let rateLimitHandler: RateLimitHandler | undefined;

export const setRateLimitHandler = (handler: RateLimitHandler): void => {
  rateLimitHandler = handler;
};

/**
 * Mounts BA's web-standard handler at /api/auth/* via Fastify.
 *
 * Body handling: Fastify pre-parses JSON, urlencoded, and other
 * registered content types into `req.body`. To preserve fidelity for BA,
 * we re-encode `req.body` per content-type. We honor whichever the
 * client sent (JSON or form-encoded).
 */
export const registerBetterAuthHandler = (fastify: FastifyInstance, auth: Auth): void => {
  fastify.all('/api/auth/*', async (req: FastifyRequest, reply: FastifyReply) => {
    // Apply rate limiting if handler has been set. This is set by registerSecurity
    // after the rate limiter plugin is registered.
    if (rateLimitHandler) {
      try {
        await rateLimitHandler(req, reply);
      } catch (err: unknown) {
        // Rate limiter throws when limit is exceeded. The error object contains
        // the response body. We need to manually send a 429 response.
        const error = err as { statusCode?: number; message?: string };
        // If this is a rate-limit error, send a 429 response
        if (error.statusCode === 429 || error.message === 'Too Many Requests') {
          reply.status(429);
          reply.header('content-type', 'application/problem+json');
          // The error object itself is the response body
          reply.send(err);
          return;
        }
        // For any other error, re-throw
        throw err;
      }
    }
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) {
        v.forEach((vv) => {
          headers.append(k, vv);
        });
      } else if (typeof v === 'string') {
        headers.set(k, v);
      }
    }

    let body: string | undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body !== undefined) {
      const ct = (req.headers['content-type'] ?? '').toLowerCase();
      if (ct.includes('application/x-www-form-urlencoded')) {
        const params = new URLSearchParams(req.body as Record<string, string>);
        body = params.toString();
      } else if (ct.includes('multipart/form-data')) {
        // BA's email/password and organization endpoints don't use multipart
        // in Phase A. Fail loud rather than silently misforward.
        reply.status(415);
        reply.send({ error: 'multipart/form-data not supported by /api/auth/* in Phase A' });
        return;
      } else {
        // Default: JSON. Covers BA's standard endpoints in Phase A.
        body = JSON.stringify(req.body);
        if (!ct) headers.set('content-type', 'application/json');
      }
    }

    const webRequest = new Request(url.toString(), {
      method: req.method,
      headers,
      ...(body !== undefined ? { body } : {}),
    });

    const response = await auth.handler(webRequest);

    reply.status(response.status);
    response.headers.forEach((value, key) => {
      reply.header(key, value);
    });
    const text = await response.text();
    reply.send(text === '' ? undefined : text);
  });
};
