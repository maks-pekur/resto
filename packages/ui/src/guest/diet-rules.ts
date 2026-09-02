/**
 * A vegan dish is vegetarian by definition — there is nothing animal in it to object to. The
 * implication lives here rather than in the operator's ticks: nobody should have to remember to
 * mark both, and a menu where half the kitchen remembered would filter half right.
 */
const IMPLIES: Readonly<Record<string, readonly string[]>> = {
  vegan: ['vegetarian'],
};

export const dietsOf = (declared: readonly string[]): ReadonlySet<string> => {
  const all = new Set(declared);
  for (const diet of declared) for (const implied of IMPLIES[diet] ?? []) all.add(implied);
  return all;
};

/** What the card shows: the strongest claim only, so a vegan dish is not labelled twice. */
export const visibleDiets = (declared: readonly string[]): readonly string[] => {
  const implied = new Set(declared.flatMap((diet) => IMPLIES[diet] ?? []));
  return declared.filter((diet) => !implied.has(diet));
};
