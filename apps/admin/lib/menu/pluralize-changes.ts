/**
 * Russian noun declension for "неопубликованных изменений" (unpublished changes).
 *
 * Three forms — nominative-singular / genitive-singular / genitive-plural — chosen by
 * the standard Russian rule:
 *   - 11..19 → genitive plural ("изменений")
 *   - last digit 1 → nominative singular ("изменение")
 *   - last digit 2..4 → genitive singular ("изменения")
 *   - else (0, 5..9) → genitive plural ("изменений")
 */
const SINGULAR = 'неопубликованное изменение';
const FEW = 'неопубликованных изменения';
const MANY = 'неопубликованных изменений';

export const pluralizeChanges = (n: number): string => {
  const abs = Math.abs(n);
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  let form: string;
  if (mod100 >= 11 && mod100 <= 19) {
    form = MANY;
  } else if (mod10 === 1) {
    form = SINGULAR;
  } else if (mod10 >= 2 && mod10 <= 4) {
    form = FEW;
  } else {
    form = MANY;
  }
  return `${n.toString()} ${form}`;
};
