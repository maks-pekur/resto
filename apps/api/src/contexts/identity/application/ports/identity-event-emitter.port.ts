import { type EventEnvelope } from '@resto/events';

export const IDENTITY_EVENT_EMITTER = Symbol('IDENTITY_EVENT_EMITTER');

export interface IdentityEventEmitterPort {
  emit(envelope: EventEnvelope): Promise<void>;
}
