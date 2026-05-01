import type { EventEnvelope } from '../envelope';

/**
 * Header keys used to project envelope metadata onto the outbox row's
 * `headers` jsonb column and onto broker messages. Lowercase to match
 * NATS header conventions and to round-trip cleanly across HTTP
 * boundaries that lowercase header names.
 */
export const HEADER_VERSION = 'event-version';
export const HEADER_CORRELATION = 'correlation-id';
export const HEADER_CAUSATION = 'causation-id';

/**
 * Serialize the non-row fields of an envelope into the `headers` map.
 * The row stores `id`, `type`, `tenant_id`, `occurred_at`, and `payload`
 * as columns; this captures the rest.
 */
export const envelopeToHeaders = (envelope: EventEnvelope): Record<string, string> => {
  const headers: Record<string, string> = {
    [HEADER_VERSION]: envelope.version.toString(),
    [HEADER_CORRELATION]: envelope.correlationId,
  };
  if (envelope.causationId !== null) {
    headers[HEADER_CAUSATION] = envelope.causationId;
  }
  return headers;
};
