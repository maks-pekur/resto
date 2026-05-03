import { describe, expect, it, vi } from 'vitest';
import { getCorrelationId } from '@resto/events';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CorrelationMiddleware } from '../../../src/shared/correlation.middleware';

const reqWith = (headers: Record<string, string | undefined>): FastifyRequest['raw'] =>
  ({ headers }) as unknown as FastifyRequest['raw'];

const replyCapture = () => {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (name: string, value: string): void => {
      headers[name.toLowerCase()] = value;
    },
  } as unknown as FastifyReply['raw'];
  return { res, headers };
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('CorrelationMiddleware', () => {
  it('honours a valid inbound x-correlation-id and echoes it on the response', () => {
    const incoming = '11111111-2222-4333-8444-555555555555';
    const middleware = new CorrelationMiddleware();
    const { res, headers } = replyCapture();
    let bound: string | undefined;

    middleware.use(reqWith({ 'x-correlation-id': incoming }), res, () => {
      bound = getCorrelationId();
    });

    expect(headers['x-correlation-id']).toBe(incoming);
    expect(bound).toBe(incoming);
  });

  it('generates a fresh UUID when no header is present', () => {
    const middleware = new CorrelationMiddleware();
    const { res, headers } = replyCapture();
    let bound: string | undefined;

    middleware.use(reqWith({}), res, () => {
      bound = getCorrelationId();
    });

    expect(headers['x-correlation-id']).toMatch(UUID_RE);
    expect(bound).toBe(headers['x-correlation-id']);
  });

  it('rejects a non-UUID inbound header and generates a fresh UUID instead', () => {
    const middleware = new CorrelationMiddleware();
    const { res, headers } = replyCapture();
    let bound: string | undefined;

    middleware.use(reqWith({ 'x-correlation-id': 'not-a-uuid' }), res, () => {
      bound = getCorrelationId();
    });

    expect(headers['x-correlation-id']).toMatch(UUID_RE);
    expect(headers['x-correlation-id']).not.toBe('not-a-uuid');
    expect(bound).toMatch(UUID_RE);
  });

  it('rejects an array-typed header (Node header type) and generates a fresh UUID', () => {
    const middleware = new CorrelationMiddleware();
    const { res, headers } = replyCapture();

    middleware.use(
      reqWith({ 'x-correlation-id': ['a', 'b'] as unknown as string }),
      res,
      () => undefined,
    );

    expect(headers['x-correlation-id']).toMatch(UUID_RE);
  });

  it('binds the correlation id for the duration of next() (AsyncLocalStorage scope)', () => {
    const middleware = new CorrelationMiddleware();
    const { res } = replyCapture();
    const next = vi.fn(() => {
      // Inside the next() callback the id is bound.
      expect(getCorrelationId()).toMatch(UUID_RE);
    });

    middleware.use(reqWith({}), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    // After the synchronous middleware returns, ALS is unbound again.
    expect(getCorrelationId()).toBeUndefined();
  });

  it('accepts uppercase UUID variants', () => {
    const incoming = '11111111-2222-4333-8444-555555555555'.toUpperCase();
    const middleware = new CorrelationMiddleware();
    const { res, headers } = replyCapture();
    middleware.use(reqWith({ 'x-correlation-id': incoming }), res, () => undefined);
    expect(headers['x-correlation-id']).toBe(incoming);
  });
});
