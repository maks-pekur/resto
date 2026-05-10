import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

/**
 * RFC 7807 problem+json shape — wire schema for every error response.
 * The actual rendering happens in `ProblemDetailsFilter`; this DTO
 * exists purely so controllers can advertise the shape via
 * `@ApiResponse({ type: ProblemDetailsDto })` for OpenAPI consumers.
 */
const ProblemDetailsSchema = z.object({
  type: z.string().url(),
  title: z.string(),
  status: z.number(),
  detail: z.string().optional(),
  instance: z.string(),
  correlationId: z.string().optional(),
  traceId: z.string().optional(),
});

export class ProblemDetailsDto extends createZodDto(ProblemDetailsSchema) {}
