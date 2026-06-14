export const toStoppedSet = (stoppedItemIds: readonly string[]): ReadonlySet<string> =>
  new Set(stoppedItemIds);
