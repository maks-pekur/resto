import { BadRequestException } from '@nestjs/common';
import { createZodValidationPipe } from 'nestjs-zod';

/**
 * Re-export of nestjs-zod's `ZodValidationPipe` configured with our
 * RFC-7807 error shape: `BadRequestException({code, message})` so the
 * global `ProblemDetailsFilter` renders a stable `type` URI of
 * `https://resto.app/problems/validation.failed`.
 *
 * Used per-parameter as `@Body(new RestoZodValidationPipe(SomeDto))`.
 * We do NOT register this as a global APP_PIPE because esbuild (the
 * tsx/vitest transpiler) does not emit `design:paramtypes` decorator
 * metadata, so the global form cannot detect Zod DTO classes via
 * reflect-metadata — explicit per-parameter use is required for
 * validation to actually fire.
 */
export const RestoZodValidationPipe = createZodValidationPipe({
  createValidationException: (zodError) => {
    const issues =
      zodError && typeof zodError === 'object' && 'issues' in zodError
        ? (zodError as { issues: { path: (string | number)[]; message: string }[] }).issues
        : [];
    const detail = issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`).join('; ');
    return new BadRequestException({
      code: 'validation.failed',
      message: detail || 'Validation failed.',
    });
  },
});
