import { z } from 'zod';
import { TenantId } from '@resto/domain';

/**
 * Event type — `<context>.<event>.v<n>`.
 *
 * The trailing `v<n>` is the schema version. Every breaking payload
 * change ships as a new type with the next `v`; old consumers continue
 * subscribing to the old version until they are migrated. Producers and
 * consumers MUST agree on the type-version pair.
 */
const eventTypeRegex = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+\.v(\d+)$/;

/**
 * Cross-context event envelope. Same shape on the wire (NATS JetStream)
 * and at rest (the transactional outbox). Broker-agnostic by design —
 * adapter code in `infrastructure/` is the only place that touches NATS.
 *
 * Fields:
 * - `id`: globally unique event id; doubles as the broker idempotency
 *   key (`msgID`) and the consumer-side dedup key.
 * - `type`: `<context>.<event>.v<n>`. Becomes the broker subject.
 * - `version`: must equal the trailing `<n>` in `type`. Stored
 *   redundantly so a misformatted `type` is caught at parse time.
 * - `tenantId`: tenant the event belongs to; `null` for platform-level
 *   events that exist before any tenant context (e.g. `tenant.provisioned`).
 * - `correlationId`: end-to-end request id, propagated through OTel
 *   baggage. Ties an event back to the inbound request that triggered it.
 * - `causationId`: id of the event that *caused* this one, for chains.
 *   `null` for events triggered by an inbound request rather than another
 *   event.
 * - `occurredAt`: when the producer wrote the event. NOT when the broker
 *   received it.
 * - `payload`: schema-checked at the contract layer (see `defineEventContract`).
 */
export const EventEnvelope = z
  .object({
    id: z.string().uuid(),
    type: z.string().regex(eventTypeRegex, 'must be <context>.<event>.v<n>'),
    version: z.number().int().positive(),
    tenantId: TenantId.nullable(),
    correlationId: z.string().uuid(),
    causationId: z.string().uuid().nullable(),
    occurredAt: z.coerce.date(),
    payload: z.unknown(),
  })
  .superRefine((env, ctx) => {
    const match = eventTypeRegex.exec(env.type);
    if (match && Number(match[1]) !== env.version) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['version'],
        message: `version ${env.version.toString()} does not match type suffix .v${match[1] ?? ''}`,
      });
    }
  });
export type EventEnvelope = z.infer<typeof EventEnvelope>;

/**
 * Typed envelope for a specific contract. Returned by
 * `EventContract.envelopeSchema`'s `parse` so handlers receive a payload
 * narrowed to the contract's shape rather than `unknown`.
 */
export type TypedEnvelope<TPayload> = Omit<EventEnvelope, 'payload'> & {
  readonly payload: TPayload;
};

/**
 * A binding between a `type` string, a payload Zod schema, and a parser
 * that returns a payload-narrowed envelope. Producers build envelopes
 * directly; consumers route through `parse` so the handler signature is
 * `(envelope: TypedEnvelope<MyPayload>) => Promise<void>` rather than
 * `(envelope: EventEnvelope) => Promise<void>` with a manual cast.
 */
export interface EventContract<TPayload, TName extends string = string> {
  readonly type: TName;
  readonly version: number;
  readonly payloadSchema: z.ZodType<TPayload>;
  /** Parse and narrow an envelope according to this contract. Throws on mismatch. */
  parse(input: unknown): TypedEnvelope<TPayload>;
}

/**
 * Define a typed event contract.
 *
 * The `type` string carries the version (`.v1`, `.v2`, …); `version` is
 * derived from it so the two never disagree. Producers MUST go through
 * the returned contract — direct `EventEnvelope` construction skips the
 * payload schema check.
 */
export const defineEventContract = <TPayload, TName extends string>(opts: {
  type: TName;
  payload: z.ZodType<TPayload>;
}): EventContract<TPayload, TName> => {
  const match = eventTypeRegex.exec(opts.type);
  if (!match) {
    throw new Error(`defineEventContract: invalid type "${opts.type}".`);
  }
  const versionStr = match[1];
  if (!versionStr) {
    throw new Error(`defineEventContract: could not extract version from type "${opts.type}".`);
  }
  const version = Number(versionStr);
  const schema = z.object({
    id: z.string().uuid(),
    type: z.literal(opts.type),
    version: z.literal(version),
    tenantId: TenantId.nullable(),
    correlationId: z.string().uuid(),
    causationId: z.string().uuid().nullable(),
    occurredAt: z.coerce.date(),
    payload: opts.payload,
  });
  return {
    type: opts.type,
    version,
    payloadSchema: opts.payload,
    parse: (input) => schema.parse(input) as TypedEnvelope<TPayload>,
  };
};
