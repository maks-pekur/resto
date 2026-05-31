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
