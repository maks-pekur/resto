import { randomUUID } from 'node:crypto';

export const envelope = {
  type: 'demo.v1',
  correlationId: randomUUID(),
};
