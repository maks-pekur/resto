declare const buildEnvelope: () => { correlationId: string };

const built = buildEnvelope();
export const envelope = {
  type: 'demo.v1',
  correlationId: built.correlationId,
};
