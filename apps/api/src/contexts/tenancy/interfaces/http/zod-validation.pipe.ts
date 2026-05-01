import { BadRequestException, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';

/**
 * Validate inbound DTOs against a Zod schema. Returns the parsed (and
 * therefore branded / coerced) value to the controller. Validation
 * failures surface as `BadRequestException`, which the global
 * `ProblemDetailsFilter` renders as RFC 7807.
 */
export class ZodValidationPipe<TSchema extends ZodTypeAny> implements PipeTransform<
  unknown,
  z.infer<TSchema>
> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): z.infer<TSchema> {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
          code: issue.code,
        })),
      });
    }
    return parsed.data as z.infer<TSchema>;
  }
}
