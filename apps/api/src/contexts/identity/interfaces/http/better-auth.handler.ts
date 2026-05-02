import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Auth } from '../../infrastructure/better-auth/auth.config';

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
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) v.forEach((vv) => headers.append(k, vv));
      else if (typeof v === 'string') headers.set(k, v);
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
    response.headers.forEach((value, key) => reply.header(key, value));
    const text = await response.text();
    reply.send(text === '' ? undefined : text);
  });
};
