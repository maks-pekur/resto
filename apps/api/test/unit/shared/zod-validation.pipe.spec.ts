import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { RestoZodValidationPipe } from '../../../src/shared/api/zod-validation.pipe';

const PersonSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().nonnegative(),
});

class PersonDto extends createZodDto(PersonSchema) {}

const buildPipe = () => new RestoZodValidationPipe(PersonDto);

const transform = (value: unknown): unknown =>
  buildPipe().transform(value, { type: 'body', metatype: PersonDto });

describe('RestoZodValidationPipe', () => {
  it('passes valid input through unchanged', () => {
    const result = transform({ name: 'Ada', age: 36 });
    expect(result).toEqual({ name: 'Ada', age: 36 });
  });

  it('throws BadRequestException with the validation.failed code on schema mismatch', () => {
    let captured: BadRequestException | undefined;
    try {
      transform({ name: '', age: -1 });
    } catch (err) {
      captured = err as BadRequestException;
    }
    expect(captured).toBeInstanceOf(BadRequestException);
    const response = captured?.getResponse() as Record<string, unknown>;
    expect(response.code).toBe('validation.failed');
    // Detail enumerates each failing path so ProblemDetailsFilter can
    // surface a useful 400 to the client.
    expect(response.message).toMatch(/name/);
    expect(response.message).toMatch(/age/);
  });

  it('serialises the root path as <root> when the failure has no path', () => {
    const RootSchema = z
      .object({ a: z.number() })
      .refine((v) => v.a > 0, { message: 'must be positive' });
    class RootDto extends createZodDto(RootSchema) {}
    let captured: BadRequestException | undefined;
    try {
      new RestoZodValidationPipe(RootDto).transform({ a: -1 }, { type: 'body', metatype: RootDto });
    } catch (err) {
      captured = err as BadRequestException;
    }
    const response = captured?.getResponse() as Record<string, unknown>;
    expect(response.message).toMatch(/must be positive/);
  });
});
