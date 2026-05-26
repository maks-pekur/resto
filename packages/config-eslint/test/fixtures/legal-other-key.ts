import { randomUUID } from 'node:crypto';

export const row = {
  id: randomUUID(),
  payload: { id: crypto.randomUUID() },
};
