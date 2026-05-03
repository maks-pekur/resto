import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
  type ArgumentsHost,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProblemDetailsFilter } from '../../../src/shared/exception.filter';

interface CapturedResponse {
  statusCode?: number;
  headers: Record<string, string>;
  body?: string;
}

const captureResponse = () => {
  const captured: CapturedResponse = { headers: {} };
  const raw = {
    set statusCode(value: number) {
      captured.statusCode = value;
    },
    setHeader(name: string, value: string): void {
      captured.headers[name.toLowerCase()] = value;
    },
    end(body: string): void {
      captured.body = body;
    },
  };
  return { raw, captured };
};

const makeHost = (response: { raw: unknown }, request: { url: string }): ArgumentsHost =>
  ({
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  }) as unknown as ArgumentsHost;

const runFilter = (exception: unknown, url = '/v1/foo') => {
  const { raw, captured } = captureResponse();
  const host = makeHost({ raw }, { url });
  new ProblemDetailsFilter().catch(exception, host);
  if (captured.body === undefined) throw new Error('filter did not write a body');
  return { captured, problem: JSON.parse(captured.body) as Record<string, unknown> };
};

describe('ProblemDetailsFilter', () => {
  it('writes RFC 7807 problem+json content-type', () => {
    const { captured } = runFilter(new NotFoundException('missing'));
    expect(captured.headers['content-type']).toBe('application/problem+json');
  });

  it('mirrors the HttpException status to the raw response', () => {
    const { captured } = runFilter(new ConflictException('clash'));
    expect(captured.statusCode).toBe(409);
  });

  it('falls back to 500 for non-HttpException errors', () => {
    const { captured } = runFilter(new Error('boom'));
    expect(captured.statusCode).toBe(500);
  });

  it('uses an explicit `code` from the body for the type URI', () => {
    const { problem } = runFilter(
      new BadRequestException({
        message: 'tenant mismatch',
        code: 'auth.tenant_mismatch',
      }),
    );
    expect(problem.type).toBe('https://resto.app/problems/auth.tenant_mismatch');
  });

  it('falls back to a slugified title when no `code` is supplied', () => {
    const { problem } = runFilter(new ConflictException('Tenant Slug Taken'));
    expect(problem.type).toBe('https://resto.app/problems/tenant-slug-taken');
  });

  it('extracts `detail` from a message string', () => {
    const { problem } = runFilter(new BadRequestException('field x is required'));
    expect(problem.detail).toBe('field x is required');
  });

  it('joins array messages with "; " (Zod / class-validator style)', () => {
    const { problem } = runFilter(
      new BadRequestException({ message: ['a is invalid', 'b is invalid'] }),
    );
    expect(problem.detail).toBe('a is invalid; b is invalid');
  });

  it('includes the request URL as `instance`', () => {
    const { problem } = runFilter(new NotFoundException('x'), '/v1/menu/items/abc');
    expect(problem.instance).toBe('/v1/menu/items/abc');
  });

  it('omits detail/correlationId/traceId fields when their sources are absent', () => {
    const { problem } = runFilter(new NotFoundException());
    // No upstream correlation id / span in this unit context — fields are
    // optional and must be absent (not `null` or empty string) so clients
    // can branch on `in`.
    expect('correlationId' in problem).toBe(false);
    expect('traceId' in problem).toBe(false);
  });

  it('logs at error level for status >= 500 and warn for < 500', () => {
    const errorSpy = vi.fn();
    const warnSpy = vi.fn();
    const filter = new ProblemDetailsFilter();
    Object.assign((filter as unknown as { logger: { error: unknown; warn: unknown } }).logger, {
      error: errorSpy,
      warn: warnSpy,
    });

    const { raw } = captureResponse();
    filter.catch(new Error('boom'), makeHost({ raw }, { url: '/' }));
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();

    const { raw: raw2 } = captureResponse();
    filter.catch(new ConflictException('dup'), makeHost({ raw: raw2 }, { url: '/' }));
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('handles a FastifyReply that exposes a `raw` wrapper', () => {
    const { raw, captured } = captureResponse();
    const fastifyReply = { raw } as unknown;
    const host = makeHost({ raw: (fastifyReply as { raw: unknown }).raw }, { url: '/' });
    // Re-wrap as a reply with `raw` to exercise the FastifyReply path
    const filterHost = {
      switchToHttp: () => ({
        getResponse: () => fastifyReply,
        getRequest: () => ({ url: '/' }),
      }),
    } as unknown as ArgumentsHost;
    new ProblemDetailsFilter().catch(new HttpException('teapot', 418), filterHost);
    expect(captured.statusCode).toBe(418);
    expect(captured.headers['content-type']).toBe('application/problem+json');
    void host;
  });
});
