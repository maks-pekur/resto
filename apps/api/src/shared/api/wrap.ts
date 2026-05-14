export const wrapWith =
  (mapper: (err: unknown) => unknown) =>
  async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      throw mapper(err);
    }
  };
